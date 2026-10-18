import "server-only";

import { createHash } from "node:crypto";

import { createClient } from "redis";

/**
 * Sabit pencereli istek sınırı (ADR 0021). Sayaçlar `REDIS_URL` varsa Redis'te (tüm sunucu
 * örnekleri ortak), yoksa süreç belleğinde (geliştirme, test, CI). Redis'e ulaşılamazsa istek
 * geçer (açık başarısızlık): sınırlama kötüye kullanıma karşı korumadır, hizmetin kendisi değil.
 * Anahtarlardaki kimlikler (e-posta, IP, oturum) özetlenir; Redis'te kişisel veri durmaz.
 */

export type RateLimitRule = { limit: number; windowSec: number };

export const RATE_LIMITS = {
  /** proxy: oturum (yoksa IP) başına API ve form/Server Action istekleri. */
  request: { limit: 120, windowSec: 60 },
  /** proxy: IP başına üst sınır (çerezi her istekte değiştirerek oturum sınırını atlatmaya karşı;
   * aynı ağdaki kullanıcılar paylaşır, bu yüzden geniş). */
  requestIp: { limit: 600, windowSec: 60 },
  /** Giriş bağlantısı: aynı e-postaya. */
  magicLinkEmail: { limit: 5, windowSec: 60 * 60 },
  /** Giriş bağlantısı: aynı IP'den. */
  magicLinkIp: { limit: 20, windowSec: 15 * 60 },
  /** Auth.js e-posta gönderimi (doğrudan `/api/auth` çağrılarına karşı yedek sınır). */
  magicLinkSend: { limit: 8, windowSec: 60 * 60 },
  /** Ekstre PDF'i ayrıştırma (motorda CPU işi; kullanıcı başına). */
  statementParse: { limit: 20, windowSec: 60 * 60 },
  /** Geri bildirim gönderme (kullanıcı başına). */
  feedback: { limit: 10, windowSec: 60 * 60 },
  /** Planı zorla yeniden hesaplatma (motor maliyeti). */
  recompute: { limit: 10, windowSec: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export const RATE_LIMIT_MESSAGE = "Çok fazla istek gönderdin. Biraz bekleyip yeniden dene.";

/** Pencere içindeki sayacı bir artırır ve yeni değeri döner. */
export interface RateLimitStore {
  hit(key: string, windowSec: number): Promise<number>;
  /** Sağlık kontrolü (yalnızca Redis deposu). */
  ping?(): Promise<void>;
}

export function createMemoryStore(now: () => number = Date.now): RateLimitStore {
  const counters = new Map<string, { count: number; expiresAt: number }>();
  return {
    async hit(key, windowSec) {
      const time = now();
      if (counters.size > 10_000) {
        for (const [k, v] of counters) if (v.expiresAt <= time) counters.delete(k);
      }
      const current = counters.get(key);
      const entry =
        current && current.expiresAt > time
          ? current
          : { count: 0, expiresAt: time + windowSec * 1000 };
      entry.count += 1;
      counters.set(key, entry);
      return entry.count;
    },
  };
}

type Redis = ReturnType<typeof createClient>;
const REDIS_TIMEOUT_MS = 500;

export function createRedisStore(url: string): RateLimitStore {
  let client: Promise<Redis> | null = null;
  const connect = () => {
    client ??= createClient({
      url,
      // Bağlantı yokken komutlar kuyrukta beklemesin, hemen hata versin (istek geçer).
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
      },
    })
      .on("error", (error: unknown) => logOnce("redis", error))
      .connect();
    return client;
  };
  return {
    async hit(key, windowSec) {
      const redis = await withTimeout(connect());
      const [count] = await withTimeout(
        redis.multi().incr(key).expire(key, windowSec, "NX").exec(),
      );
      return Number(count);
    },
    async ping() {
      const redis = await withTimeout(connect());
      await withTimeout(redis.ping());
    },
  };
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("rate limit store timeout")), REDIS_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

let lastLog = 0;
function logOnce(source: string, error: unknown) {
  // Redis kapalıyken her istekte günlük basmasın: dakikada bir.
  if (Date.now() - lastLog < 60_000) return;
  lastLog = Date.now();
  console.error(`[rate-limit] ${source}:`, error instanceof Error ? error.message : error);
}

/** Saf çekirdek: pencere anahtarı, sayaç, kalan ve bekleme süresi. */
export async function checkRateLimit(
  store: RateLimitStore,
  name: string,
  rule: RateLimitRule,
  id: string,
  now = Date.now(),
): Promise<RateLimitResult> {
  const windowMs = rule.windowSec * 1000;
  const window = Math.floor(now / windowMs);
  const key = `rl:${name}:${hashId(id)}:${window}`;
  const retryAfterSec = Math.max(1, Math.ceil(((window + 1) * windowMs - now) / 1000));
  let count: number;
  try {
    count = await store.hit(key, rule.windowSec);
  } catch (error) {
    logOnce("store", error);
    return { ok: true, remaining: rule.limit, retryAfterSec: 0 };
  }
  return {
    ok: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSec: count <= rule.limit ? 0 : retryAfterSec,
  };
}

export function hashId(id: string): string {
  return createHash("sha256").update(id).digest("base64url").slice(0, 22);
}

// Geliştirmede modül yeniden yüklenince bağlantı/sayaçlar çoğalmasın.
const globalStore = globalThis as typeof globalThis & { __kartplanRateLimit?: RateLimitStore };

function defaultStore(): RateLimitStore {
  globalStore.__kartplanRateLimit ??= process.env.REDIS_URL
    ? createRedisStore(process.env.REDIS_URL)
    : createMemoryStore();
  return globalStore.__kartplanRateLimit;
}

/** İzleme: Redis yapılandırılmamışsa "disabled". */
export async function pingRateLimitStore(): Promise<"ok" | "down" | "disabled"> {
  const store = defaultStore();
  if (!store.ping) return "disabled";
  try {
    await store.ping();
    return "ok";
  } catch {
    return "down";
  }
}

/** Adlandırılmış sınırı uygular: `id` kullanıcı id'si, e-posta ya da IP olabilir. */
export function rateLimit(name: RateLimitName, id: string): Promise<RateLimitResult> {
  return checkRateLimit(defaultStore(), name, RATE_LIMITS[name], id);
}

/** 429 yanıtı (API ve proxy). */
export function tooManyRequests(result: RateLimitResult): Response {
  return Response.json(
    { error: RATE_LIMIT_MESSAGE },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  );
}

/**
 * İsteğin istemci IP'si. Vercel `x-forwarded-for`'u kendisi yazar (istemcinin gönderdiği değer
 * ezilir); başka bir barındırmada önündeki vekil sunucunun da aynı şeyi yaptığından emin ol.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
