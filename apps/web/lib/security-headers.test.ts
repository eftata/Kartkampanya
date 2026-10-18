import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "./security-headers";

const byKey = (headers: { key: string; value: string }[]) =>
  Object.fromEntries(headers.map((h) => [h.key, h.value]));

describe("güvenlik başlıkları", () => {
  it("üretim: sıkı CSP, HSTS ve https yükseltmesi", () => {
    const headers = byKey(securityHeaders({ dev: false, appUrl: "https://kartplan.app" }));
    const csp = headers["Content-Security-Policy"]!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("APP_URL tanımsız (CI build) üretim gibi davranır", () =>
    expect(contentSecurityPolicy({ dev: false })).toContain("upgrade-insecure-requests"));

  it("yerel http ve geliştirme: yükseltme yok, geliştirmede eval ve HMR izinli, HSTS yok", () => {
    expect(contentSecurityPolicy({ dev: false, appUrl: "http://localhost:3100" })).not.toContain(
      "upgrade-insecure-requests",
    );
    const dev = byKey(securityHeaders({ dev: true }));
    expect(dev["Content-Security-Policy"]).toContain("'unsafe-eval'");
    expect(dev["Content-Security-Policy"]).toContain("connect-src 'self' ws:");
    expect(dev["Strict-Transport-Security"]).toBeUndefined();
  });
});
