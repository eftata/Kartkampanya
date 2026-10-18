import { afterEach, describe, expect, it, vi } from "vitest";

import { analyticsId, captureConfig, sendEvent, track } from "./analytics";

afterEach(() => vi.unstubAllEnvs());

describe("analyticsId", () => {
  it("kararlı, kullanıcı kimliğini içermez, anahtara bağlı", () => {
    const id = analyticsId("cmuser123", "gizli");
    expect(id).toBe(analyticsId("cmuser123", "gizli"));
    expect(id).toMatch(/^u_[A-Za-z0-9_-]{22}$/);
    expect(id).not.toContain("cmuser123");
    expect(analyticsId("cmuser123", "baska")).not.toBe(id);
    expect(analyticsId("cmuser124", "gizli")).not.toBe(id);
  });
});

describe("captureConfig", () => {
  it("anahtar yoksa kapalı; varsayılan sunucu AB", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    expect(captureConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    expect(captureConfig()).toEqual({ key: "phc_test", host: "https://eu.i.posthog.com" });
  });
});

describe("sendEvent", () => {
  it("capture API'sine kişisel veri içermeyen olay gönderir", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    await sendEvent(
      { key: "phc_test", host: "https://ph.test" },
      {
        name: "card_added",
        distinctId: "u_abc",
        properties: { cards: 2 },
        at: new Date("2026-10-18T10:00:00Z"),
      },
      fetchImpl,
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://ph.test/capture/");
    expect(JSON.parse(String(init?.body))).toEqual({
      api_key: "phc_test",
      event: "card_added",
      distinct_id: "u_abc",
      timestamp: "2026-10-18T10:00:00.000Z",
      properties: { cards: 2, $lib: "kartplan-server", $geoip_disable: true },
    });
  });

  it("başarısız yanıt hata fırlatır", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 500 }));
    await expect(
      sendEvent(
        { key: "k", host: "https://ph.test" },
        { name: "plan_viewed", distinctId: "u", properties: {}, at: new Date() },
        fetchImpl,
      ),
    ).rejects.toThrow("PostHog 500");
  });
});

describe("track", () => {
  it("anahtar yokken ağa çıkmaz", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const spy = vi.spyOn(globalThis, "fetch");
    track("cmuser", "plan_viewed");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
