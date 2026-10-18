import { describe, expect, it } from "vitest";

import { overallState, runHealth } from "./system-health";
import type { ComponentState } from "./system-health";

const NOW = new Date("2026-10-18T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
const check = (state: ComponentState) => ({ state, ms: 1 });

describe("overallState", () => {
  it("veritabanı ve motor şart, Redis yalnızca uyarı", () => {
    const ok = { database: check("ok"), redis: check("ok"), engine: check("ok") };
    expect(overallState(ok)).toBe("ok");
    expect(overallState({ ...ok, redis: check("disabled") })).toBe("ok");
    expect(overallState({ ...ok, redis: check("down") })).toBe("degraded");
    expect(overallState({ ...ok, database: check("down") })).toBe("down");
    expect(overallState({ ...ok, engine: check("disabled") })).toBe("down");
  });
});

describe("runHealth", () => {
  const run = (status: "RUNNING" | "SUCCEEDED" | "FAILED", hours: number) => ({
    status,
    startedAt: hoursAgo(hours),
    finishedAt: status === "RUNNING" ? null : hoursAgo(hours - 0.1),
  });

  it.each([
    [null, "never"],
    [run("SUCCEEDED", 3), "ok"],
    [run("SUCCEEDED", 25.9), "ok"],
    [run("SUCCEEDED", 27), "late"],
    [run("FAILED", 1), "failed"],
    [run("RUNNING", 0.5), "ok"],
    [run("RUNNING", 2), "stuck"],
  ] as const)("%o → %s", (last, expected) => expect(runHealth(last, NOW, 26)).toBe(expected));
});
