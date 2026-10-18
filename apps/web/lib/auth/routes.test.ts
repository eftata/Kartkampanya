import { describe, expect, it } from "vitest";

import { isProtectedPath, isRateLimitedRequest } from "./routes";

describe("isProtectedPath", () => {
  it.each([
    "/plan",
    "/baslangic",
    "/kartlarim",
    "/kampanyalarim/abc",
    "/profil",
    "/admin",
    "/admin/katalog",
    "/onay",
  ])("%s korumalıdır", (path) => expect(isProtectedPath(path)).toBe(true));

  it.each([
    "/",
    "/giris",
    "/giris/dogrula",
    "/kampanyalar",
    "/planlar",
    "/api/health",
    "/aydinlatma",
  ])("%s herkese açıktır", (path) => expect(isProtectedPath(path)).toBe(false));
});

describe("isRateLimitedRequest", () => {
  it.each([
    ["GET", "/api/me/plan"],
    ["POST", "/api/unsubscribe"],
    ["POST", "/api/auth/signin/nodemailer"],
    ["POST", "/giris"], // Server Action
    ["DELETE", "/api/me"],
  ])("%s %s sınırlanır", (method, path) => expect(isRateLimitedRequest(method, path)).toBe(true));

  it.each([
    ["GET", "/"],
    ["GET", "/kampanyalar"],
    ["HEAD", "/plan"],
    ["GET", "/api/cron/notifications"],
    ["GET", "/api/health"],
  ])("%s %s sınırlanmaz", (method, path) => expect(isRateLimitedRequest(method, path)).toBe(false));
});
