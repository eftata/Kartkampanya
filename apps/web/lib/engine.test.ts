import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { optimizePlan } from "./engine";

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));

const request = {
  month: "2026-11",
  budget: [],
  cards: [{ id: "A", limit: null, baseRateBps: { "*": 50 } }],
  campaigns: [],
};
const plan = {
  status: "OPTIMAL",
  allocations: [],
  campaignsHit: [],
  nearMisses: [],
  unallocated: [],
  totalExpected: 0,
  baseline: { strategy: "single_best_card", card: "A", total: 0 },
  solver: { engine: "cp-sat", ms: 3 },
};

describe("optimizePlan", () => {
  beforeEach(() => {
    vi.stubEnv("ENGINE_URL", "http://motor.test");
    vi.stubEnv("ENGINE_TOKEN", "gizli");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("motoru anahtarla çağırır ve yanıtı doğrular", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(plan));
    vi.stubGlobal("fetch", fetch);
    expect(await optimizePlan(request)).toEqual({ ok: true, plan });
    const [url, init] = fetch.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://motor.test/optimize");
    expect(init.headers).toMatchObject({ authorization: "Bearer gizli" });
    expect(JSON.parse(String(init.body))).toEqual(request);
  });

  it.each([
    ["HTTP hatası", () => Promise.resolve(new Response("x", { status: 500 }))],
    ["geçersiz yanıt", () => Promise.resolve(Response.json({ status: "OPTIMAL" }))],
    ["ağ hatası", () => Promise.reject(new Error("ECONNREFUSED"))],
  ])("%s kullanıcıya genel bir hata olarak döner", async (_name, impl) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(impl));
    const result = await optimizePlan(request);
    expect(result.ok).toBe(false);
  });

  it("yapılandırma yoksa motoru çağırmaz", async () => {
    vi.stubEnv("ENGINE_TOKEN", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await optimizePlan(request)).toEqual({
      ok: false,
      error: "Plan servisi yapılandırılmamış.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
