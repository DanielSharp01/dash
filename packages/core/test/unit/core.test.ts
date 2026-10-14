import { describe, expect, it } from "vitest";
import {
  applyPlanChange,
  BEGINNING,
  comboAsLines,
  dailyTargets,
  restingBurn,
  dayTotals,
  defaultPlan,
  entryNeedsFollowUp,
  foodInputSchema,
  labelSchema,
  provenanceChips,
  lookupOf,
  unsureItemsInUse,
  type Entry,
  type Food,
  type FoodItem,
  type Recipe,
  quantity,
} from "../../src/index";

let counter = 100;
const uid = () => `00000000-0000-4000-8000-${String(counter++).padStart(12, "0")}`;

const flags = { revision: 1, deleted: false, public: false, starter: false, iconAuto: true, catalogued: true } as const;

const milk: FoodItem = {
  ...flags,
  id: "00000000-0000-4000-8000-000000000001",
  kind: "item",
  name: "Milk",
  icon: "🥛",
  unit: "ml",
  notFluid: false,
  unsure: false,
  labels: [
    { from: BEGINNING, per: "100", values: { kcal: 50, protein: 3, carbs: 5, fat: 2 }, verified: true },
    { from: "2026-06-01", per: "100", values: { kcal: 60, protein: 3, carbs: 5, fat: 3 }, verified: true },
  ],
  servings: [{ name: "glass", size: 200 }],
};

const oats: FoodItem = {
  ...milk,
  id: "00000000-0000-4000-8000-000000000002",
  name: "Oats",
  unit: "g",
  labels: [{ from: BEGINNING, per: "100", values: { kcal: 380, protein: 13, carbs: 60, fat: 7 }, verified: true }],
  servings: [],
};

const porridge: Recipe = {
  ...flags,
  id: "00000000-0000-4000-8000-000000000003",
  kind: "recipe",
  name: "Porridge",
  icon: "🥣",
  batches: [
    {
      id: "00000000-0000-4000-8000-000000000004",
      madeOn: "2026-07-01",
      ingredients: [
        { foodId: oats.id, amount: { value: 100, unit: "g" }, base: 100 },
        { foodId: milk.id, amount: { value: 1, unit: "glass" }, base: 200 },
      ],
      yield: { portions: 2 },
      gone: false,
      revision: 1,
      deleted: false,
    },
  ],
};

const unsure: FoodItem = { ...milk, id: "00000000-0000-4000-8000-000000000005", name: "Mystery", unsure: true, labels: [] };

const foods: Food[] = [milk, oats, porridge, unsure];
const lookup = lookupOf(foods);

const entry = (date: string, lines: Extract<Entry, { kind: "food" }>["lines"], via: "ate" | "drank" = "ate"): Entry => ({
  id: uid(),
  kind: "food",
  when: { date, kind: "day" },
  via,
  lines,
  revision: 1,
  deleted: false,
  createdAt: "2026-07-01T10:00:00Z",
});

describe("quantity", () => {
  it("sizes a serving named like a common unit of another dimension", () => {
    const toast = { ...oats, servings: [{ name: "piece", size: 40 }] };
    expect(quantity(toast, { value: 2, unit: "piece" })).toBe(80);
    expect(quantity(oats, { value: 2, unit: "piece" })).toBeUndefined();
  });
});

describe("dayTotals", () => {
  it("uses the label valid on the day and the recorded base", () => {
    const before = dayTotals([entry("2026-05-01", [{ id: uid(), foodId: milk.id, amount: { value: 1, unit: "glass" }, base: 200 }])], lookup);
    const after = dayTotals([entry("2026-06-02", [{ id: uid(), foodId: milk.id, amount: { value: 1, unit: "glass" }, base: 200 }])], lookup);
    expect(before.kcal).toEqual({ value: 100, missing: 0 });
    expect(after.kcal).toEqual({ value: 120, missing: 0 });
    expect(after.fluid).toEqual({ value: 200, missing: 0 });
  });

  it("sizes a recipe portion from its batch on the day it was made", () => {
    const t = dayTotals([entry("2026-07-02", [{ id: uid(), foodId: porridge.id, batchId: porridge.batches[0]!.id, amount: { value: 1, unit: "portion" } }])], lookup);
    // (380 + 200 ml milk at the June label: 120) / 2 portions
    expect(t.kcal.value).toBeCloseTo(250);
    expect(t.kcal.missing).toBe(0);
  });

  it("counts a line with no label as missing, never as zero", () => {
    const t = dayTotals([entry("2026-07-02", [{ id: uid(), rawName: "soup", amount: { value: 1, unit: "bowl" } }])], lookup);
    expect(t.kcal).toEqual({ value: 0, missing: 1 });
  });
});

describe("follow-up", () => {
  it("leaves lines of an unsure item to the item and lists the item once used", () => {
    const e = entry("2026-07-02", [{ id: uid(), foodId: unsure.id, amount: { value: 1, unit: "glass" } }]);
    expect(entryNeedsFollowUp(e, lookup)).toBe(false);
    expect(unsureItemsInUse(foods, [e])).toEqual([{ foodId: unsure.id, entryIds: [e.id], usedByFoodIds: [] }]);
  });
});

describe("comboAsLines", () => {
  it("scales parts and records base", () => {
    let n = 0;
    const lines = comboAsLines({ parts: [{ foodId: milk.id, amount: { value: 1, unit: "glass" } }] }, 2, lookup, () => `id-${n++}`);
    expect(lines).toEqual([{ id: "id-0", foodId: milk.id, amount: { value: 2, unit: "glass" }, base: 400 }]);
  });
});

describe("applyPlanChange", () => {
  const v1 = [{ from: BEGINNING, plan: defaultPlan }];
  const faster = { ...defaultPlan, goal: { kgPerWeek: 0.75 } };

  it("is a no-op for the current plan", () => {
    expect(applyPlanChange(v1, { ...defaultPlan }, "fix")).toBeUndefined();
  });

  it("starts a version on a date and drops later ones", () => {
    const v2 = applyPlanChange(v1, faster, { from: "2026-08-01" })!;
    expect(v2.map((v) => v.from)).toEqual([BEGINNING, "2026-08-01"]);
    const v3 = applyPlanChange(v2, defaultPlan, { from: "2026-07-01" })!;
    // Back to the first plan from July: neighbours collapse into the first version.
    expect(v3).toEqual([{ from: BEGINNING, plan: defaultPlan }]);
  });
});

describe("schemas", () => {
  it("rejects two labels on the same day", () => {
    const { revision: _r, deleted: _d, public: _p, starter: _s, ...input } = milk;
    expect(foodInputSchema.safeParse(input).success).toBe(true);
    expect(foodInputSchema.safeParse({ ...input, labels: [milk.labels[0], milk.labels[0]] }).success).toBe(false);
  });

  it("keeps provenance consistent: only a package or a prefill can be verified, and nothing unverified lacks an origin", () => {
    const label = { from: BEGINNING, per: "100", values: { kcal: 64 } } as const;
    const ok = (p: object) => labelSchema.safeParse({ ...label, ...p }).success;
    expect(ok({ verified: true })).toBe(true);
    expect(ok({ verified: true, origin: "open-food-facts", originRev: 12 })).toBe(true);
    expect(ok({ verified: false, origin: "online", url: "https://example.com/menu" })).toBe(true);
    expect(ok({ verified: false })).toBe(false);
    expect(ok({ verified: true, origin: "usda" })).toBe(false);
    expect(ok({ verified: true, origin: "estimate" })).toBe(false);
    expect(ok({ verified: false, origin: "usda", originRev: 3 })).toBe(false);
    expect(ok({ verified: false, origin: "estimate", url: "https://example.com" })).toBe(false);
    expect(ok({ verified: false, origin: "online", url: "javascript:alert(1)" })).toBe(false);
  });

  it("shows verification and origin as separate chips", () => {
    expect(provenanceChips({ verified: true })).toEqual(["Label verified"]);
    expect(provenanceChips({ verified: true, origin: "open-food-facts" })).toEqual(["Label verified", "Open Food Facts"]);
    expect(provenanceChips({ verified: false, origin: "open-food-facts" })).toEqual(["Open Food Facts"]);
  });
});

describe("dailyTargets", () => {
  const profile = { units: "metric", heightCm: 180, birthday: "1990-01-01", dayEndsAt: 0, clock: "24h", autoRecap: true } as const;
  const weighIns = [{ id: uid(), date: "2026-01-01", kg: 110 }];
  const withPlan = (patch: Partial<typeof defaultPlan>) => [{ from: BEGINNING, plan: { ...defaultPlan, ...patch } }];

  it("caps a target weight at the healthy maximum for protein, like the current weight", () => {
    const capped = dailyTargets(profile, withPlan({ goal: { kgPerWeek: 0.5, targetKg: 95 } }), weighIns, "2026-06-01");
    const healthyMaxKg = 25 * 1.8 ** 2;
    expect(capped.protein).toBe(Math.round(defaultPlan.macroPlan.proteinPerKg * healthyMaxKg));
  });

  it("shrinks fat rather than letting the macros outgrow the calories", () => {
    const t = dailyTargets(profile, withPlan({ macroPlan: { preset: "high-protein", proteinPerKg: 4, fatPct: 0.3 } }), weighIns, "2026-06-01");
    expect(t.carbs).toBe(0);
    expect(Math.abs(t.protein * 4 + t.fat * 9 + t.carbs * 4 - t.kcal)).toBeLessThanOrEqual(10);
  });

  it("estimates maintenance from what's known while a body detail is missing", () => {
    const t = dailyTargets({ ...profile, heightCm: undefined }, withPlan({}), weighIns, "2026-06-01");
    expect(t.calc).toBeUndefined();
    expect(t.estimatedMaintenance).toBe(restingBurn(110, 170, 36) * defaultPlan.metabolismMultiplier);
  });
});
