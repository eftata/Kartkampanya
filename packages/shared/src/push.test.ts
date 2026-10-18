import { describe, expect, it } from "vitest";

import { PushPayload, PushSubscriptionInput } from "./push";

const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };

describe("PushSubscriptionInput", () => {
  it("tarayıcı çıktısını kabul eder", () => {
    const parsed = PushSubscriptionInput.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      expirationTime: null,
      keys,
    });
    expect(parsed.success).toBe(true);
  });

  it("adres ve anahtar biçimi denetlenir", () => {
    const bad = [
      { endpoint: "javascript:alert(1)", keys },
      { endpoint: "ftp://ornek.test/x", keys },
      { endpoint: "https://fcm.googleapis.com/x", keys: { ...keys, auth: "kısa" } },
      { endpoint: "https://fcm.googleapis.com/x", keys: { ...keys, p256dh: "<script>".repeat(4) } },
      { endpoint: `https://fcm.googleapis.com/${"x".repeat(2100)}`, keys },
    ];
    for (const input of bad) expect(PushSubscriptionInput.safeParse(input).success).toBe(false);
  });
});

describe("PushPayload", () => {
  it("yalnızca uygulama içi yol", () => {
    expect(PushPayload.safeParse({ title: "a", body: "b", url: "/plan" }).success).toBe(true);
    expect(PushPayload.safeParse({ title: "a", body: "b", url: "https://kotu.test" }).success).toBe(
      false,
    );
  });
});
