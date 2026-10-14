import { describe, expect, it } from "vitest";

import { isProtectedPath } from "./routes";

describe("isProtectedPath", () => {
  it.each([
    "/plan",
    "/baslangic",
    "/kartlarim",
    "/kampanyalarim/abc",
    "/profil",
    "/admin",
    "/admin/katalog",
  ])("%s korumalıdır", (path) => expect(isProtectedPath(path)).toBe(true));

  it.each(["/", "/giris", "/giris/dogrula", "/kampanyalar", "/planlar", "/api/health"])(
    "%s herkese açıktır",
    (path) => expect(isProtectedPath(path)).toBe(false),
  );
});
