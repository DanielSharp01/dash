import { describe, expect, it } from "vitest";
import { estimateBurn, logicalDateIn, sortKey } from "../../src/index";

describe("estimateBurn", () => {
  it("scales distance by body weight and converts the unit", () => {
    expect(estimateBurn({ burn: { basis: "distance", kcalPerKgKm: 1 } }, { distance: { value: 2, unit: "mi" } }, 70)?.kcal).toBeCloseTo(225.26);
  });

  it("counts reps per set, and takes reps as the total without sets", () => {
    const pushups = { burn: { basis: "reps" as const, kcalPerKgRep: 0.005 } };
    expect(estimateBurn(pushups, { sets: { value: 3, unit: "sets" }, reps: { value: 10, unit: "reps" } }, 80)).toEqual({ kcal: 12, from: "3 × 10 reps" });
    expect(estimateBurn(pushups, { reps: { value: 10, unit: "reps" } }, 80)?.kcal).toBe(4);
  });

  it("leaves out resting burn from a MET, and is undefined without the basis measure", () => {
    const yoga = { burn: { basis: "duration" as const, met: 3 } };
    expect(estimateBurn(yoga, { duration: { value: 30, unit: "min" } }, 60)?.kcal).toBe(60);
    expect(estimateBurn(yoga, {}, 60)).toBeUndefined();
  });
});

describe("sortKey", () => {
  it("puts times past midnight but before the rollover at the end of their day", () => {
    const late = sortKey({ date: "2026-09-01", kind: "exact", time: "01:30" }, 3);
    const evening = sortKey({ date: "2026-09-01", kind: "part", part: "evening" }, 3);
    const unknown = sortKey({ date: "2026-09-01", kind: "day" }, 3);
    expect([unknown, late, evening].sort()).toEqual([evening, late, unknown]);
    expect(sortKey({ date: "2026-09-01", kind: "exact", time: "01:30" }, 0) < evening).toBe(true);
  });
});

describe("logicalDateIn", () => {
  // 22:30 UTC on 9 October is already 00:30 on the 10th in Budapest (UTC+2 in October).
  const lateEvening = new Date("2026-10-09T22:30:00Z");

  it("reads the date on the person's wall clock, not the server's", () => {
    expect(logicalDateIn(lateEvening, "Europe/Budapest", 0)).toBe("2026-10-10");
    expect(logicalDateIn(lateEvening, "America/New_York", 0)).toBe("2026-10-09");
  });

  it("keeps the previous day until the rollover hour", () => {
    expect(logicalDateIn(lateEvening, "Europe/Budapest", 3)).toBe("2026-10-09");
  });
});
