import { describe, expect, it } from "vitest";

import {
  scrubAnalyticsEvent,
  scrubBreadcrumb,
  scrubSentryEvent,
  scrubText,
  scrubUrl,
} from "./scrub";

describe("scrubText", () => {
  it("e-posta ve uzun rakam dizilerini siler", () => {
    expect(scrubText("ali.veli+test@ornek.com.tr için hata")).toBe("[e-posta] için hata");
    expect(scrubText("kart 4111 1111 1111 1111 reddedildi")).toBe("kart [sayı] reddedildi");
    expect(scrubText("tel 0532-123-45-67")).toBe("tel 0532-123-45-67"); // 11 hane: kısa
    expect(scrubText("2.500 TL, 2026-11-30")).toBe("2.500 TL, 2026-11-30");
  });
});

describe("scrubUrl", () => {
  it("giriş bağlantısının belirteci ve e-postası gitmez", () =>
    expect(
      scrubUrl(
        "https://kartplan.app/api/auth/callback/nodemailer?callbackUrl=%2Fplan&token=abc&email=a%40b.com",
      ),
    ).toBe("https://kartplan.app/api/auth/callback/nodemailer"));

  it("filtre parametreleri kalır, diğerleri ve parça silinir", () => {
    expect(scrubUrl("https://kartplan.app/kampanyalar?program=bonus&kategori=market&x=1#y")).toBe(
      "https://kartplan.app/kampanyalar?program=bonus&kategori=market",
    );
    expect(scrubUrl("/abonelik?u=cmabc&t=weekly&sig=deadbeef")).toBe("/abonelik");
    expect(scrubUrl("/kampanyalarim?kart=cm1&sirala=kazanc")).toBe(
      "/kampanyalarim?kart=cm1&sirala=kazanc",
    );
  });

  it("yolda e-posta varsa silinir; adres değilse metin olarak temizlenir", () => {
    expect(scrubUrl("https://x.test/kisi/a%40b.com")).toBe("https://x.test/kisi/[e-posta]");
    expect(scrubUrl("mailto:a@b.com")).toBe("mailto:[e-posta]");
  });
});

describe("Sentry", () => {
  it("kullanıcı, çerez, başlık ve gövde silinir; mesajlar temizlenir", () => {
    const event = scrubSentryEvent({
      message: "a@b.com bulunamadı",
      user: { email: "a@b.com", ip_address: "1.2.3.4" },
      request: {
        url: "https://kartplan.app/abonelik?sig=x",
        cookies: { "authjs.session-token": "gizli" },
        headers: { cookie: "gizli" },
        data: { email: "a@b.com" },
        query_string: "sig=x",
      },
      exception: { values: [{ value: "Kullanıcı a@b.com" }] },
      breadcrumbs: [{ message: "gezinme", data: { from: "/giris?email=a@b.com", to: "/plan" } }],
      extra: { note: "kart 4111111111111111" },
    });
    expect(event).toEqual({
      message: "[e-posta] bulunamadı",
      request: { url: "https://kartplan.app/abonelik" },
      exception: { values: [{ value: "Kullanıcı [e-posta]" }] },
      breadcrumbs: [{ message: "gezinme", data: { from: "/giris", to: "/plan" } }],
      extra: { note: "kart [sayı]" },
    });
  });

  it("breadcrumb tek başına", () =>
    expect(scrubBreadcrumb({ data: { url: "https://x.test/a?token=1" } })).toEqual({
      data: { url: "https://x.test/a" },
    }));
});

describe("PostHog", () => {
  it("adresler ve metinler temizlenir, IP silinir, kimlik alanları korunur", () => {
    const distinct = "019a1234-5678-7000-8000-123456789012";
    const event = scrubAnalyticsEvent({
      event: "$pageview",
      properties: {
        distinct_id: distinct,
        $session_id: "0192000000000000",
        $current_url: "https://kartplan.app/abonelik?u=cm1&sig=abc",
        $pathname: "/abonelik",
        $referrer: "https://mail.ornek.com/?q=a@b.com",
        $ip: "1.2.3.4",
        $set_once: { $initial_current_url: "https://kartplan.app/?hesap=silindi&e=a@b.com" },
        $screen_width: 1280,
      },
    });
    expect(event?.properties).toEqual({
      distinct_id: distinct,
      $session_id: "0192000000000000",
      $current_url: "https://kartplan.app/abonelik",
      $pathname: "/abonelik",
      $referrer: "https://mail.ornek.com/",
      $set_once: { $initial_current_url: "https://kartplan.app/?hesap=silindi" },
      $screen_width: 1280,
    });
    expect(scrubAnalyticsEvent(null)).toBeNull();
  });
});
