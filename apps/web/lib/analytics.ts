import "server-only";

import { createHmac } from "node:crypto";

import { after } from "next/server";

/**
 * Sunucu tarafı ürün olayları → PostHog (ADR 0022). Huni: kayıt (ilk KVKK onayı) → kart → harcama
 * profili → plan görüntüleme → kampanyaya katılım; geri dönüş plan görüntülemelerinden ölçülür.
 *
 * Kişisel veri gönderilmez: kullanıcı kimliği yerine `analyticsId` (AUTH_SECRET ile HMAC; PostHog
 * tarafında veritabanımızla eşlenemez), e-posta/ad/tutar yok. `NEXT_PUBLIC_POSTHOG_KEY` yoksa
 * hiçbir şey gönderilmez. Gönderim yanıttan sonra (`after`) yapılır; hata kullanıcıyı etkilemez.
 */

export type AnalyticsEvent =
  | "user_signed_up"
  | "card_added"
  | "spend_profile_saved"
  | "plan_viewed"
  | "campaign_joined"
  | "feedback_sent";

/** Yalnızca sayı, mantıksal değer ya da sabit etiket (ör. ay, plan durumu). */
export type AnalyticsProperties = Record<string, number | boolean | string>;

const DEFAULT_HOST = "https://eu.i.posthog.com";

export function analyticsId(userId: string, secret = process.env.AUTH_SECRET ?? ""): string {
  return `u_${createHmac("sha256", `analytics:${secret}`).update(userId).digest("base64url").slice(0, 22)}`;
}

export type CaptureConfig = { key: string; host: string };

export function captureConfig(): CaptureConfig | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  return { key, host: (process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST).replace(/\/+$/, "") };
}

/** PostHog capture API'sine tek olay. */
export async function sendEvent(
  config: CaptureConfig,
  event: { name: AnalyticsEvent; distinctId: string; properties: AnalyticsProperties; at: Date },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${config.host}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: config.key,
      event: event.name,
      distinct_id: event.distinctId,
      timestamp: event.at.toISOString(),
      // Sunucu olayı: IP ve konum çözümlemesi yapılmasın.
      properties: { ...event.properties, $lib: "kartplan-server", $geoip_disable: true },
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`PostHog ${response.status}`);
}

/** Olayı yanıt gönderildikten sonra yollar. İstek dışında (test, betik) arka planda dener. */
export function track(userId: string, name: AnalyticsEvent, properties: AnalyticsProperties = {}) {
  const config = captureConfig();
  if (!config) return;
  const send = () =>
    sendEvent(config, { name, distinctId: analyticsId(userId), properties, at: new Date() }).catch(
      (error: unknown) =>
        console.error("[analytics]", error instanceof Error ? error.message : error),
    );
  try {
    after(send);
  } catch {
    void send();
  }
}
