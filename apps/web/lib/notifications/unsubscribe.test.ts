import { describe, expect, it } from "vitest";

import { unsubscribeParams, verifyUnsubscribe } from "./unsubscribe";

const SECRET = "test-sırrı";

describe("abonelikten çıkma imzası", () => {
  it("imzalı bağlantı doğrulanır", () => {
    const params = Object.fromEntries(unsubscribeParams("user1", "weeklySummary", SECRET));
    expect(verifyUnsubscribe(params, SECRET)).toEqual({ userId: "user1", target: "weeklySummary" });
  });

  it("başka kullanıcı, başka tür, bozuk imza ya da başka anahtar reddedilir", () => {
    const params = Object.fromEntries(unsubscribeParams("user1", "endingSoon", SECRET));
    expect(verifyUnsubscribe({ ...params, u: "user2" }, SECRET)).toBeNull();
    expect(verifyUnsubscribe({ ...params, k: "all" }, SECRET)).toBeNull();
    expect(verifyUnsubscribe({ ...params, t: "x" }, SECRET)).toBeNull();
    expect(verifyUnsubscribe(params, "baska-sir")).toBeNull();
    expect(verifyUnsubscribe({ ...params, k: "bilinmeyen" }, SECRET)).toBeNull();
    expect(verifyUnsubscribe({}, SECRET)).toBeNull();
  });
});
