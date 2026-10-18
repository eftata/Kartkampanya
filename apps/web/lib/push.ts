import "server-only";

import { getPrisma } from "@kartplan/db";
import type { PushPayload, PushStatusDto, PushSubscriptionInput } from "@kartplan/shared";
import webpush from "web-push";

import type { MutationResult } from "@/lib/result";

/**
 * Web push (Faz 2; ADR 0031). Cihaz başına abonelik `PushSubscription`'da; gönderim VAPID ile
 * imzalı, yük RFC 8291 ile uçtan uca şifreli (push servisi içeriği göremez). Push, e-posta
 * bildirimlerinin ek kanalıdır: aynı tercihler, aynı tek sefer kaydı.
 */

export type PushConfig = { publicKey: string; privateKey: string; subject: string };

/**
 * VAPID anahtarları ve iletişim adresi (`mailto:` ya da `https:`; push servisleri sorun olursa
 * buraya yazar) tanımlı değilse push kapalı.
 */
export function pushConfig(
  env: Record<string, string | undefined> = process.env,
): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Tarayıcıların push servisleri. Abonelik adresi kullanıcıdan gelir ve sunucu oraya istek atar:
 * izin listesi dışındaki adres kabul edilmez (SSRF). `PUSH_EXTRA_ORIGINS` yalnızca e2e'deki sahte
 * servis içindir; üretimde boş.
 */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome, Android
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari, iOS (ana ekrana eklenmiş)
];
const PUSH_SERVICE_SUFFIXES = [".notify.windows.com", ".push.apple.com"]; // Edge (WNS), Apple

export function isAllowedPushEndpoint(
  endpoint: string,
  extraOrigins = process.env.PUSH_EXTRA_ORIGINS ?? "",
): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  const extra = extraOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (extra.includes(url.origin)) return true;
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  return (
    PUSH_SERVICE_HOSTS.includes(url.hostname) ||
    PUSH_SERVICE_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
  );
}

/** Kullanıcı başına en fazla bu kadar cihaz (eskiler silinir). */
export const PUSH_MAX_DEVICES = 10;

export async function getPushStatus(userId: string): Promise<PushStatusDto> {
  const config = pushConfig();
  const devices = await getPrisma().pushSubscription.count({ where: { userId } });
  return { enabled: config !== null, publicKey: config?.publicKey ?? null, devices };
}

export async function savePushSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<MutationResult> {
  if (!pushConfig()) {
    return { ok: false, code: "conflict", error: "Anlık bildirimler şu an kapalı." };
  }
  if (!isAllowedPushEndpoint(input.endpoint)) {
    return {
      ok: false,
      code: "conflict",
      error: "Bu tarayıcının bildirim servisi desteklenmiyor.",
    };
  }
  const prisma = getPrisma();
  const data = { userId, p256dh: input.keys.p256dh, auth: input.keys.auth };
  await prisma.$transaction(async (tx) => {
    // Aynı tarayıcıda başka hesaba geçildiyse abonelik yeni hesaba taşınır.
    await tx.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { endpoint: input.endpoint, ...data },
      update: data,
    });
    const extra = await tx.pushSubscription.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: PUSH_MAX_DEVICES,
      select: { id: true },
    });
    if (extra.length) {
      await tx.pushSubscription.deleteMany({ where: { id: { in: extra.map((row) => row.id) } } });
    }
  });
  return { ok: true, data: undefined };
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await getPrisma().pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
/** Tek cihaza gönderim; HTTP durum kodunu döner (2xx değilse `statusCode`'lu hata fırlatabilir). */
export type PushSender = (target: PushTarget, payload: string) => Promise<{ statusCode: number }>;

/**
 * İstek web-push ile hazırlanır (VAPID imzası + aes128gcm şifreleme), `fetch` ile gönderilir:
 * yönlendirme izlenmez (izin listesi atlatılamasın), 10 sn zaman aşımı.
 */
export function webPushSender(config: PushConfig, fetchImpl: typeof fetch = fetch): PushSender {
  return async (target, payload) => {
    const request = webpush.generateRequestDetails(target, payload, {
      vapidDetails: config,
      TTL: 24 * 60 * 60, // cihaz kapalıysa en fazla bir gün bekler
      urgency: "normal",
    });
    const response = await fetchImpl(request.endpoint, {
      method: request.method,
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [key, String(value)]),
      ),
      body: request.body ? new Uint8Array(request.body) : null,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    return { statusCode: response.status };
  };
}

export type PushResult = { sent: number; removed: number; failed: number };

const statusOf = (error: unknown) =>
  error !== null && typeof error === "object" && "statusCode" in error
    ? Number((error as { statusCode: unknown }).statusCode)
    : null;

/**
 * Kullanıcının tüm cihazlarına gönderir. Servis aboneliğin bittiğini söylerse (404/410) kayıt
 * silinir; diğer hatalar sayılır, gönderimi durdurmaz. Push kapalıysa hiçbir şey yapmaz.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  send?: PushSender,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };
  const config = pushConfig();
  const sender = send ?? (config ? webPushSender(config) : null);
  if (!sender) return result;
  const prisma = getPrisma();
  const devices = await prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const body = JSON.stringify(payload);
  for (const device of devices) {
    const target = {
      endpoint: device.endpoint,
      keys: { p256dh: device.p256dh, auth: device.auth },
    };
    let status: number | null;
    try {
      status = (await sender(target, body)).statusCode;
    } catch (error) {
      status = statusOf(error);
      if (status !== 404 && status !== 410) {
        result.failed += 1;
        console.error(`push gönderilemedi (kullanıcı ${userId}): durum ${status ?? "?"}`);
        continue;
      }
    }
    if (status === 404 || status === 410) {
      await prisma.pushSubscription.deleteMany({ where: { id: device.id } });
      result.removed += 1;
    } else if (status !== null && status >= 200 && status < 300) {
      await prisma.pushSubscription.update({
        where: { id: device.id },
        data: { lastSentAt: new Date() },
      });
      result.sent += 1;
    } else {
      result.failed += 1;
    }
  }
  return result;
}

/** "Deneme bildirimi gönder" (Profilim). */
export async function sendTestPush(
  userId: string,
  send?: PushSender,
): Promise<MutationResult<PushResult>> {
  if (!send && !pushConfig()) {
    return { ok: false, code: "conflict", error: "Anlık bildirimler şu an kapalı." };
  }
  const result = await sendPushToUser(
    userId,
    {
      title: "KartPlan bildirimleri açık",
      body: "Kampanya hatırlatmaları bu cihaza da gelecek.",
      url: "/profil",
      tag: "test",
    },
    send,
  );
  if (result.sent === 0) {
    return {
      ok: false,
      code: "not_found",
      error: "Bildirim gönderilemedi. Bu cihazda bildirimleri yeniden aç.",
    };
  }
  return { ok: true, data: result };
}
