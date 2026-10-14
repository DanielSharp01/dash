import { describe, expect, it } from "vitest";
import { BEGINNING, defaultPlan } from "@dash/core";
import { publicActivityId } from "../../src/seeds";
import { newUser, uuid } from "../support/helpers";

function prototypeExport() {
  const milk = uuid();
  const chili = uuid();
  const batch = uuid();
  const breakfast = uuid();
  const own = { unit: "g", labels: [{ from: "", per: "100", values: { kcal: 300 }, source: "typed" }], servings: [] };
  return {
    ids: { milk, chili, batch, breakfast },
    body: {
      app: "dash",
      version: 2,
      exportedAt: "2026-10-01T10:00:00Z",
      data: {
        "dash.foods.v1": [
          { id: "seed-water", kind: "item", name: "Water", icon: "💧", unit: "ml", labels: [{ from: "", per: "100", values: { kcal: 0 }, source: "reference" }], servings: [{ name: "glass", size: 250 }] },
          { id: milk, kind: "item", name: "Milk", unit: "ml", labels: [{ from: "", per: "100", values: { kcal: 64 }, source: "package" }], servings: [] },
          { id: chili, kind: "recipe", name: "Chili", batches: [{ id: batch, madeOn: "2026-09-01", ingredients: [{ foodId: milk, amount: { value: 100, unit: "ml" }, base: 100 }], yield: { portions: 4 } }] },
          { id: breakfast, kind: "combo", name: "Breakfast", parts: [{ foodId: milk, amount: { value: 200, unit: "ml" } }, { foodId: "removed-food", amount: {} }] },
        ],
        "dash.entries.v1": [
          { id: uuid(), kind: "food", when: { date: "2026-09-02", kind: "day" }, createdAt: "2026-09-02T08:00:00.000Z", via: "drank", lines: [{ id: uuid(), itemId: "seed-water", amount: { value: 1, unit: "glass" }, base: 250 }] },
          { id: uuid(), kind: "food", when: { date: "2026-09-02", kind: "part", part: "evening" }, createdAt: "2026-09-02T19:00:00.000Z", via: "ate", lines: [{ id: uuid(), recipeId: chili, batchId: batch, amount: { value: 1, unit: "portion" } }] },
          { id: uuid(), kind: "food", when: { date: "2026-09-03", kind: "exact", time: "12:15" }, createdAt: "2026-09-03T12:15:00.000Z", via: "ate", title: "Lunch", lines: [{ id: uuid(), rawName: "Kebab", amount: { value: 150, unit: "g" }, own }, { id: uuid(), itemId: milk, amount: { value: 100, unit: "ml" } }] },
          { id: uuid(), kind: "exercise", when: { date: "2026-09-03", kind: "day" }, createdAt: "2026-09-03T18:00:00.000Z", activityId: "walk", measures: { distance: { value: 3, unit: "km" } }, kcal: 112 },
          { id: uuid(), kind: "exercise", when: { date: "2026-09-04", kind: "day" }, createdAt: "2026-09-04T18:00:00.000Z", activityId: "swim", measures: { laps: { value: 20, unit: "laps" } } },
          { id: uuid(), kind: "exercise", when: { date: "2026-09-05", kind: "day" }, createdAt: "2026-09-05T18:00:00.000Z", rawName: "Padel", measures: { duration: { value: 60, unit: "min" } }, kcal: 400, kcalManual: true },
        ],
        "dash.activities.v1": [],
        "dash.profile.v1": {
          units: "metric",
          heightCm: 175,
          dayEndsAt: 2,
          ...defaultPlan,
          planHistory: [
            { from: "", plan: defaultPlan },
            { from: "2026-09-01", plan: { ...defaultPlan, goal: { kgPerWeek: 0.25 } } },
          ],
          pots: [{ id: "pot-1", name: "Big pot", grams: 1400 }],
        },
        "dash.weighIns.v1": [{ id: uuid(), date: "2026-09-01", kg: 82 }],
        "dash.seedsApplied.v1": ["seed-water"],
      },
    },
  };
}

describe("import", () => {
  it("moves a prototype export into an empty account", async () => {
    const u = await newUser();
    const { ids, body } = prototypeExport();
    const res = await u.post("/import", body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ foods: 6, entries: 6, activities: 2, weighIns: 1, pots: 1 });

    const foods = (await u.get("/foods")).body.foods.filter((f: any) => !f.public);
    const water = foods.find((f: any) => f.name === "Water");
    expect(water.id).not.toBe("seed-water");
    expect(foods.find((f: any) => f.id === ids.milk)).toMatchObject({ labels: [{ from: BEGINNING, verified: true }], iconAuto: true, icon: expect.any(String) });
    expect(foods.find((f: any) => f.id === ids.milk).labels[0].origin).toBeUndefined();
    expect(water.labels[0]).toMatchObject({ verified: false, origin: "usda" });
    expect(foods.find((f: any) => f.id === ids.breakfast).parts).toHaveLength(1);
    expect(foods.find((f: any) => f.id === ids.chili).batches[0]).toMatchObject({ id: ids.batch, yield: { portions: 4 } });
    const kebab = foods.find((f: any) => f.name === "Kebab");
    expect(kebab).toMatchObject({ catalogued: false, unit: "g", labels: [{ verified: false, origin: "estimate" }] });
    const lunch = foods.find((f: any) => f.name === "Lunch");
    expect(lunch).toMatchObject({ kind: "combo", catalogued: false });

    const entries = (await u.get("/entries?from=2026-09-01&to=2026-09-30")).body.entries;
    expect(entries.find((e: any) => e.comboId === lunch.id).lines[0].foodId).toBe(kebab.id);
    expect(entries.find((e: any) => e.lines?.[0]?.foodId === water.id).createdAt).toBe("2026-09-02T08:00:00.000Z");
    const exercise = entries.filter((e: any) => e.kind === "exercise");
    expect(exercise[0].activityId).toBe(publicActivityId("walk"));
    const activities = (await u.get("/activities")).body.activities.filter((a: any) => !a.public);
    expect(activities.map((a: any) => a.name).sort()).toEqual(["Padel", "Swim"]);

    const me = (await u.get("/me")).body;
    expect(me.profile).toMatchObject({ heightCm: 175, dayEndsAt: 2 });
    expect(me.plan.versions.map((v: any) => v.from)).toEqual([BEGINNING, "2026-09-01"]);
    expect(me.pots[0].name).toBe("Big pot");
  });

  it("refuses an account that already has data, and an unreadable export", async () => {
    const u = await newUser();
    await u.post("/weigh-ins", { id: uuid(), date: "2026-09-01", kg: 80 });
    expect((await u.post("/import", prototypeExport().body)).status).toBe(409);

    const empty = await newUser();
    const broken = prototypeExport().body;
    broken.data["dash.entries.v1"] = [{ id: "x", kind: "food" } as any];
    expect((await empty.post("/import", broken)).status).toBe(400);
  });
});
