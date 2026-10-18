import { describe, expect, it } from "vitest";

import {
  checkRateLimit,
  clientIp,
  createMemoryStore,
  createRedisStore,
  hashId,
} from "./rate-limit";
import type { RateLimitStore } from "./rate-limit";

const rule = { limit: 3, windowSec: 60 };
const T0 = Date.parse("2026-10-18T12:00:10Z");

describe("checkRateLimit (bellek)", () => {
  it("sınıra kadar geçer, sonra pencere bitimine kadar reddeder", async () => {
    let now = T0;
    const store = createMemoryStore(() => now);
    const hit = () => checkRateLimit(store, "t", rule, "kullanici", now);
    expect(await hit()).toEqual({ ok: true, remaining: 2, retryAfterSec: 0 });
    await hit();
    expect(await hit()).toEqual({ ok: true, remaining: 0, retryAfterSec: 0 });
    // Pencere 12:00:00–12:01:00; 12:00:10'da 50 sn kaldı.
    expect(await hit()).toEqual({ ok: false, remaining: 0, retryAfterSec: 50 });
    now = T0 + 50_000; // yeni pencere
    expect((await checkRateLimit(store, "t", rule, "kullanici", now)).ok).toBe(true);
  });

  it("kimlikler ve sınır adları birbirinden bağımsız", async () => {
    const store = createMemoryStore(() => T0);
    for (let i = 0; i < 3; i++) await checkRateLimit(store, "t", rule, "a", T0);
    expect((await checkRateLimit(store, "t", rule, "a", T0)).ok).toBe(false);
    expect((await checkRateLimit(store, "t", rule, "b", T0)).ok).toBe(true);
    expect((await checkRateLimit(store, "u", rule, "a", T0)).ok).toBe(true);
  });

  it("depo hata verirse istek geçer", async () => {
    const broken: RateLimitStore = { hit: () => Promise.reject(new Error("bağlantı yok")) };
    expect(await checkRateLimit(broken, "t", rule, "a", T0)).toEqual({
      ok: true,
      remaining: 3,
      retryAfterSec: 0,
    });
  });

  it("anahtarda kimliğin kendisi değil özeti durur", async () => {
    const keys: string[] = [];
    const spy: RateLimitStore = { hit: (key) => (keys.push(key), Promise.resolve(1)) };
    await checkRateLimit(spy, "magicLinkEmail", rule, "ali@ornek.com", T0);
    expect(keys[0]).not.toContain("ali");
    expect(keys[0]).toContain(hashId("ali@ornek.com"));
  });
});

describe("clientIp", () => {
  it("x-forwarded-for'un ilk adresi, yoksa x-real-ip", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

// Redis gerektirir: `docker compose up -d` (REDIS_URL kök .env'de).
describe.skipIf(!process.env.REDIS_URL)("Redis deposu", () => {
  it("sayaç artar ve süre yalnızca ilk vuruşta konur", async () => {
    const store = createRedisStore(process.env.REDIS_URL!);
    const id = crypto.randomUUID();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(store, "test", rule, id));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
  });

  it("ulaşılamayan Redis isteği bekletmez ve geçirir", async () => {
    const store = createRedisStore("redis://127.0.0.1:1");
    const started = Date.now();
    expect((await checkRateLimit(store, "test", rule, "x")).ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
