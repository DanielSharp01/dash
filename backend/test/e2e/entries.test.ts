import { describe, expect, it } from "vitest";
import { publicActivityId, publicFoodId } from "../../src/seeds";
import { combo, foodEntry, item, recipe, unsureItem } from "../support/fixtures";
import { newUser, uuid } from "../support/helpers";

const walk = publicActivityId("walk");
const water = publicFoodId("water");

const exercise = (activityId: string, extra: Record<string, unknown> = {}) => ({
  id: uuid(),
  kind: "exercise" as const,
  when: { date: "2026-09-10", kind: "part" as const, part: "evening" as const },
  activityId,
  measures: { distance: { value: 5, unit: "km" } },
  kcal: 200,
  kcalManual: false,
  ...extra,
});

describe("food entries", () => {
  it("creates, retries, lists by range and by food", async () => {
    const u = await newUser();
    const milk = item();
    const entry = foodEntry([{ foodId: milk.id, amount: { value: 1, unit: "glass" }, base: 200 }, { rawName: "biscuit", amount: { value: 2 } }]);
    const created = await u.post("/entries", { ...entry, newFoods: [milk] });
    expect(created.status).toBe(201);
    expect(created.body.entry).toMatchObject({ ...entry, revision: 1, deleted: false });
    expect(created.body.newFoods[0].id).toBe(milk.id);
    expect((await u.post("/entries", entry)).status).toBe(200);

    await u.post("/entries", foodEntry([{ foodId: water, amount: { value: 1, unit: "glass" } }], "2026-09-12"));
    expect((await u.get("/entries?from=2026-09-10&to=2026-09-11")).body.entries.map((e: any) => e.id)).toEqual([entry.id]);
    expect((await u.get(`/entries?from=2026-01-01&to=2026-12-31&foodId=${water}`)).body.entries).toHaveLength(1);
  });

  it("logs a one-off combo as an uncatalogued combo", async () => {
    const u = await newUser();
    const sandwich = combo([{ foodId: water, amount: { value: 1, unit: "glass" } }], { catalogued: false, name: "Sandwich" });
    const res = await u.post("/entries", { ...foodEntry([{ foodId: water, amount: { value: 1, unit: "glass" } }]), comboId: sandwich.id, newFoods: [sandwich] });
    expect(res.status).toBe(201);
    expect(res.body.entry.comboId).toBe(sandwich.id);
    expect(res.body.newFoods[0].catalogued).toBe(false);
  });

  it("checks lines: a batch must be of the line's recipe, and a combo can't be a line", async () => {
    const u = await newUser();
    const chili = recipe();
    const soup = recipe({ name: "Soup" });
    await u.post("/foods", chili);
    await u.post("/foods", soup);
    const batchId = uuid();
    await u.put(`/foods/${chili.id}/batches/${batchId}`, { id: batchId, madeOn: "2026-09-09", ingredients: [], yield: { portions: 4 }, gone: false, revision: 0 });

    expect((await u.post("/entries", foodEntry([{ foodId: chili.id, batchId, amount: { value: 1, unit: "portion" } }]))).status).toBe(201);
    expect((await u.post("/entries", foodEntry([{ foodId: soup.id, batchId, amount: { value: 1, unit: "portion" } }]))).status).toBe(422);
    const c = combo([]);
    await u.post("/foods", c);
    expect((await u.post("/entries", foodEntry([{ foodId: c.id, amount: {} }]))).status).toBe(422);
  });

  it("keeps an old entry editable after its food was deleted", async () => {
    const u = await newUser();
    const milk = item();
    await u.post("/foods", milk);
    const entry = foodEntry([{ foodId: milk.id, amount: { value: 1, unit: "glass" } }]);
    await u.post("/entries", entry);
    await u.delete(`/foods/${milk.id}`);
    const edited = await u.put(`/entries/${entry.id}`, { ...entry, when: { date: "2026-09-11", kind: "day" }, revision: 1 });
    expect(edited.status).toBe(200);
    expect(edited.body.entry).toMatchObject({ when: { date: "2026-09-11", kind: "day" }, revision: 2 });
    expect((await u.post("/entries", foodEntry([{ foodId: milk.id, amount: {} }]))).status).toBe(422);
  });

  it("guards revisions, kinds and ownership", async () => {
    const u = await newUser();
    const entry = foodEntry([{ rawName: "toast", amount: {} }]);
    await u.post("/entries", entry);
    await u.put(`/entries/${entry.id}`, { ...entry, via: "drank", revision: 1 });
    const stale = await u.put(`/entries/${entry.id}`, { ...entry, revision: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.current.via).toBe("drank");
    expect((await u.put(`/entries/${entry.id}`, { ...exercise(walk), id: entry.id, revision: 2 })).status).toBe(422);
    expect((await (await newUser()).put(`/entries/${entry.id}`, { ...entry, revision: 2 })).status).toBe(404);
    expect((await u.put(`/entries/${uuid()}`, { ...entry, revision: 2 })).status).toBe(400);
  });

  it("deletes and restores", async () => {
    const u = await newUser();
    const entry = foodEntry([{ rawName: "toast", amount: {} }]);
    await u.post("/entries", entry);
    expect((await u.delete(`/entries/${entry.id}`)).status).toBe(204);
    expect((await u.get("/entries?from=2026-09-10&to=2026-09-10")).body.entries).toEqual([]);
    expect((await u.post(`/entries/${entry.id}/restore`)).body).toMatchObject({ deleted: false, revision: 3 });
  });
});

describe("exercise entries", () => {
  it("logs a public activity, keeps measures and kcal", async () => {
    const u = await newUser();
    const e = exercise(walk);
    const res = await u.post("/entries", e);
    expect(res.body.entry).toMatchObject({ activityId: walk, measures: e.measures, kcal: 200, kcalManual: false, when: e.when });
  });

  it("creates an activity typed during capture", async () => {
    const u = await newUser();
    const padel = { id: uuid(), name: "Padel", icon: "🎾", iconAuto: true, measures: ["duration"] };
    const { kcal: _, ...withoutKcal } = exercise(padel.id, { measures: { duration: { value: 60, unit: "min" } } });
    const res = await u.post("/entries", { ...withoutKcal, newActivities: [padel] });
    expect(res.status).toBe(201);
    expect(res.body.newActivities[0]).toMatchObject({ name: "Padel", public: false });
    expect(res.body.entry.kcal).toBeUndefined();
  });
});

describe("activities", () => {
  it("lists public ones with an ETag, creates, edits and deletes personal ones", async () => {
    const u = await newUser();
    const first = await u.get("/activities");
    expect(first.body.activities.map((a: any) => a.name).sort()).toEqual(["Cycling", "Run", "Walk"]);
    const etag = first.headers.get("etag")!;
    expect((await u.get("/activities", { "if-none-match": etag })).status).toBe(304);

    const rowing = { id: uuid(), name: "Rowing", icon: "🚣", iconAuto: false, measures: ["distance", "duration"], burn: { basis: "distance", kcalPerKgKm: 0.8 } };
    expect((await u.post("/activities", rowing)).status).toBe(201);
    const edited = await u.put(`/activities/${rowing.id}`, { ...rowing, burn: { basis: "duration", met: 7 }, revision: 1 });
    expect(edited.body).toMatchObject({ burn: { basis: "duration", met: 7 }, revision: 2 });
    expect((await u.get("/activities", { "if-none-match": etag })).status).toBe(200);
    expect((await u.delete(`/activities/${rowing.id}`)).status).toBe(204);
    expect((await u.put(`/activities/${walk}`, { ...rowing, id: walk, revision: 1 })).status).toBe(403);
  });
});

describe("follow-up", () => {
  it("lists unsure items in use and entries missing calories, but not lines of unsure items", async () => {
    const u = await newUser();
    const stew = unsureItem();
    const unused = unsureItem("Abandoned");
    await u.post("/foods", unused);
    const viaItem = foodEntry([{ foodId: stew.id, amount: { value: 1, unit: "bowl" } }]);
    await u.post("/entries", { ...viaItem, newFoods: [stew] });
    const bare = foodEntry([{ rawName: "cake", amount: { value: 1, unit: "slice" } }]);
    await u.post("/entries", bare);
    const known = foodEntry([{ foodId: water, amount: { value: 1, unit: "glass" }, base: 250 }]);
    await u.post("/entries", known);
    const { kcal: _, ...noKcal } = exercise(walk);
    await u.post("/entries", noKcal);

    const res = await u.get("/follow-up");
    expect(res.body.unsureItems).toEqual([{ foodId: stew.id, entryIds: [viaItem.id], usedByFoodIds: [] }]);
    expect(res.body.entries.map((e: any) => e.id).sort()).toEqual([bare.id, noKcal.id].sort());
  });
});
