import { describe, expect, it } from "vitest";
import { BEGINNING, dayRecap, dayResult, defaultPlan, lookupOf, pendingRecapDay, recapWorthShowing, shiftDate, weekStart, type DailyTargets, type Entry, type FoodItem } from "../../src/index";

let counter = 500;
const uid = () => `00000000-0000-4000-8000-${String(counter++).padStart(12, "0")}`;

const oats: FoodItem = {
  revision: 1,
  deleted: false,
  public: false,
  starter: false,
  iconAuto: true,
  catalogued: true,
  id: "00000000-0000-4000-8000-000000000002",
  kind: "item",
  name: "Oats",
  icon: "🥣",
  unit: "g",
  notFluid: false,
  unsure: false,
  labels: [{ from: BEGINNING, per: "100", values: { kcal: 400, protein: 13, carbs: 60, fat: 7 }, source: "package" }],
  servings: [],
};
const lookup = lookupOf([oats]);

const targets: DailyTargets = {
  kcal: 1950,
  protein: 115,
  carbs: 200,
  fat: 60,
  calc: { bmr: 2080, maintenance: 2500, deficit: 550, clamped: false, bodyKg: 80 },
  fluidMl: 2000,
  plan: defaultPlan,
  missing: [],
};
const targetsOn = () => targets;

const meta = { revision: 1, deleted: false, createdAt: "2026-10-01T10:00:00Z" };
const ate = (date: string, kcal: number): Entry => {
  const grams = kcal / 4;
  return { ...meta, id: uid(), kind: "food", when: { date, kind: "day" }, via: "ate", lines: [{ id: uid(), foodId: oats.id, amount: { value: grams, unit: "g" }, base: grams }] };
};
const ran = (date: string, kcal: number, duration?: { value: number; unit: string }): Entry => ({
  ...meta,
  id: uid(),
  kind: "exercise",
  when: { date, kind: "day" },
  activityId: uid(),
  measures: duration ? { duration } : {},
  kcal,
  kcalManual: true,
});
const unknown = (date: string): Entry => ({ ...meta, id: uid(), kind: "food", when: { date, kind: "day" }, via: "ate", lines: [{ id: uid(), rawName: "soup", amount: { value: 1, unit: "bowl" } }] });

/** 2026-10-05 is a Monday. */
const MON = "2026-10-05";
const day = (offset: number) => shiftDate(MON, offset);

describe("dayResult", () => {
  const tone = (kcal: number) => dayResult(MON, [ate(MON, kcal)], targets, lookup).tone;

  it("tells the kind of day from what was eaten against the budget", () => {
    expect(tone(1890)).toBe("great");
    expect(tone(1950)).toBe("great");
    expect(tone(2070)).toBe("close");
    expect(tone(3100)).toBe("over");
    expect(tone(700)).toBe("light");
    expect(dayResult(MON, [], targets, lookup).tone).toBe("empty");
  });

  it("keeps a day over budget a close call while it's still under maintenance", () => {
    expect(tone(2500)).toBe("close");
    expect(tone(2501)).toBe("over");
    expect(dayResult(MON, [ate(MON, 2700), ran(MON, 300)], targets, lookup).tone).toBe("close");
  });

  it("judges a big day by the estimated maintenance while the real one is unknown", () => {
    const estimated = { ...targets, calc: undefined, estimatedMaintenance: 2300 };
    expect(dayResult(MON, [ate(MON, 2300)], estimated, lookup).tone).toBe("close");
    expect(dayResult(MON, [ate(MON, 2301)], estimated, lookup).tone).toBe("over");
    expect(dayResult(MON, [ate(MON, 2300)], estimated, lookup).deficit).toBeUndefined();
  });

  it("draws the big-day line a tenth over budget when no maintenance is given", () => {
    const noCalc = { ...targets, calc: undefined };
    expect(dayResult(MON, [ate(MON, 2140)], noCalc, lookup).tone).toBe("close");
    expect(dayResult(MON, [ate(MON, 2150)], noCalc, lookup).tone).toBe("over");
  });

  it("still allows a tenth over a budget that sits at maintenance", () => {
    const maintaining = { ...targets, kcal: 2500, calc: { ...targets.calc!, deficit: 0 } };
    expect(dayResult(MON, [ate(MON, 2740)], maintaining, lookup).tone).toBe("close");
    expect(dayResult(MON, [ate(MON, 2760)], maintaining, lookup).tone).toBe("over");
  });

  it("measures the deficit from maintenance, so a day slightly over budget can still be one", () => {
    expect(dayResult(MON, [ate(MON, 1890)], targets, lookup)).toMatchObject({ deficit: 610, goalDeficit: 550, budget: 1950 });
    expect(dayResult(MON, [ate(MON, 2070)], targets, lookup).deficit).toBe(430);
  });

  it("adds exercise to the budget and the deficit", () => {
    const r = dayResult(MON, [ate(MON, 2200), ran(MON, 300)], targets, lookup);
    expect(r).toMatchObject({ budget: 2250, burned: 300, tone: "great", deficit: 600 });
  });

  it("adds up how long the exercise took, only when every workout says", () => {
    expect(dayResult(MON, [ran(MON, 200, { value: 30, unit: "min" }), ran(MON, 300, { value: 1, unit: "h" })], targets, lookup).exerciseMinutes).toBe(90);
    expect(dayResult(MON, [ran(MON, 200, { value: 30, unit: "min" }), ran(MON, 300)], targets, lookup).exerciseMinutes).toBeUndefined();
    expect(dayResult(MON, [ate(MON, 1800)], targets, lookup).exerciseMinutes).toBeUndefined();
  });

  it("counts an exercise-only day as logged but light", () => {
    expect(dayResult(MON, [ran(MON, 300)], targets, lookup)).toMatchObject({ logged: true, tone: "light" });
  });

  it("says how many things have no calories yet", () => {
    expect(dayResult(MON, [ate(MON, 1800), unknown(MON)], targets, lookup).missing).toBe(1);
  });

  it("leaves the deficit out while maintenance is unknown", () => {
    const r = dayResult(MON, [ate(MON, 1500)], { ...targets, calc: undefined }, lookup);
    expect(r.deficit).toBeUndefined();
    expect(r.tone).toBe("great");
  });
});

describe("dayRecap", () => {
  it("counts logging and on-target runs ending on the day", () => {
    const entries = [ate(day(-3), 1800), ate(day(-2), 1800), ate(day(-1), 2500), ate(day(0), 1800), ate(day(1), 1800)];
    const r = dayRecap(day(1), entries, targetsOn, lookup);
    expect(r.streak).toMatchObject({ logged: 5, onTarget: 2, loggedBefore: 4, onTargetBefore: 1, best: 5 });
    expect(r.first).toBe(false);
  });

  it("keeps the run that just ended, for a day with nothing logged", () => {
    const entries = [ate(day(0), 1800), ate(day(1), 1800), ate(day(2), 1800)];
    const r = dayRecap(day(3), entries, targetsOn, lookup);
    expect(r.day.tone).toBe("empty");
    expect(r.streak).toMatchObject({ logged: 0, onTarget: 0, loggedBefore: 3, onTargetBefore: 3, best: 3 });
  });

  it("marks the first logged day", () => {
    expect(dayRecap(day(2), [ate(day(2), 1800)], targetsOn, lookup).first).toBe(true);
    expect(dayRecap(day(2), [ate(day(0), 1800), ate(day(2), 1800)], targetsOn, lookup).first).toBe(false);
  });

  it("ignores deleted entries", () => {
    const r = dayRecap(day(0), [{ ...ate(day(0), 1800), deleted: true }], targetsOn, lookup);
    expect(r.day.logged).toBe(false);
  });

  it("totals the week from Monday, leaving out days with nothing logged", () => {
    const entries = [ate(day(0), 1800), ate(day(2), 2800), ate(day(3), 1950)];
    const r = dayRecap(day(3), entries, targetsOn, lookup);
    expect(r.week.from).toBe(MON);
    expect(r.week.days.map((d) => d.date)).toEqual([day(0), day(1), day(2), day(3)]);
    expect(r.week.complete).toBe(false);
    // 700 + (−300) + 550; Tuesday has nothing logged and counts as neither.
    expect(r.week.deficit).toBe(950);
    expect(r.week.goal).toBe(3850);
  });

  it("calls a Sunday's week complete", () => {
    const r = dayRecap(day(6), [ate(day(6), 1800)], targetsOn, lookup);
    expect(r.week.complete).toBe(true);
    expect(r.week.days).toHaveLength(7);
  });
});

describe("weekStart", () => {
  it("goes back to Monday", () => {
    expect(weekStart(MON)).toBe(MON);
    expect(weekStart(day(6))).toBe(MON);
    expect(weekStart(day(7))).toBe(day(7));
  });
});

describe("pendingRecapDay", () => {
  it("plays yesterday's recap once", () => {
    expect(pendingRecapDay("2026-10-10", undefined)).toBe("2026-10-09");
    expect(pendingRecapDay("2026-10-10", "2026-10-08")).toBe("2026-10-09");
    expect(pendingRecapDay("2026-10-10", "2026-10-09")).toBeUndefined();
  });

  it("only offers yesterday after days away, never the days in between", () => {
    expect(pendingRecapDay("2026-10-10", "2026-10-01")).toBe("2026-10-09");
  });
});

describe("recapWorthShowing", () => {
  it("skips an empty day unless it ended a logging run", () => {
    expect(recapWorthShowing(dayRecap(day(3), [ate(day(2), 1800)], targetsOn, lookup))).toBe(true);
    expect(recapWorthShowing(dayRecap(day(3), [ate(day(0), 1800)], targetsOn, lookup))).toBe(false);
    expect(recapWorthShowing(dayRecap(day(3), [ate(day(3), 1800)], targetsOn, lookup))).toBe(true);
  });
});
