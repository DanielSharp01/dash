import { describe, expect, it, vi } from "vitest";
import { BEGINNING } from "@dash/core";
import { openFoodFacts } from "../../src/providers/openFoodFacts";
import { publicFoodId } from "../../src/seeds";
import { combo, foodEntry, item, recipe } from "../support/fixtures";
import { newUser, uuid } from "../support/helpers";

const water = publicFoodId("water");

describe("catalogue", () => {
  it("lists the person's foods with every public item, and answers 304 while nothing changed", async () => {
    const u = await newUser();
    const first = await u.get("/foods");
    expect(first.status).toBe(200);
    const publicWater = first.body.foods.find((f: any) => f.id === water);
    expect(publicWater).toMatchObject({ name: "Water", public: true, starter: true, labels: [{ from: BEGINNING }] });

    const etag = first.headers.get("etag")!;
    expect((await u.get("/foods", { "if-none-match": etag })).status).toBe(304);

    await u.post("/foods", item());
    const after = await u.get("/foods", { "if-none-match": etag });
    expect(after.status).toBe(200);
    expect(after.body.foods.filter((f: any) => !f.public)).toHaveLength(1);
  });

  it("never shows one person's foods to another", async () => {
    const a = await newUser();
    const b = await newUser();
    await a.post("/foods", item());
    expect((await b.get("/foods")).body.foods.every((f: any) => f.public)).toBe(true);
  });
});

describe("creating", () => {
  it("returns 201, then the stored food with 200 on a retry, and 409 for someone else's id", async () => {
    const u = await newUser();
    const milk = item();
    const created = await u.post("/foods", milk);
    expect(created.status).toBe(201);
    expect(created.body.food).toMatchObject({ ...milk, revision: 1, deleted: false, public: false, starter: false });

    const retry = await u.post("/foods", { ...milk, name: "Changed" });
    expect(retry.status).toBe(200);
    expect(retry.body.food.name).toBe("Oat milk");

    expect((await (await newUser()).post("/foods", milk)).status).toBe(409);
  });

  it("creates new foods sent along, so a combo can use a new item", async () => {
    const u = await newUser();
    const bread = item({ name: "Bread", unit: "g", labels: [], servings: [] });
    const sandwich = combo([{ foodId: bread.id, amount: { value: 2, unit: "slice" } }, { foodId: water, amount: { value: 1, unit: "glass" } }]);
    const res = await u.post("/foods", { ...sandwich, newFoods: [bread] });
    expect(res.status).toBe(201);
    expect(res.body.newFoods.map((f: any) => f.id)).toEqual([bread.id]);
    expect(res.body.food.parts).toEqual(sandwich.parts);
  });

  it("refuses references to someone else's food", async () => {
    const a = await newUser();
    const b = await newUser();
    const secret = item();
    await a.post("/foods", secret);
    const res = await b.post("/foods", combo([{ foodId: secret.id, amount: {} }]));
    expect(res.status).toBe(422);
    expect(res.body.field).toBe("parts.0.foodId");
  });

  it("refuses a duplicated label start and a combo inside a combo", async () => {
    const u = await newUser();
    const label = item().labels[0]!;
    expect((await u.post("/foods", item({ labels: [label, label] }))).status).toBe(400);
    const inner = combo([]);
    await u.post("/foods", inner);
    expect((await u.post("/foods", combo([{ foodId: inner.id, amount: {} }]))).status).toBe(422);
  });

  it("duplicates a public item into a personal one", async () => {
    const u = await newUser();
    const copy = item({ name: "Water", origin: undefined, originId: water } as any);
    const res = await u.post("/foods", copy);
    expect(res.body.food).toMatchObject({ originId: water, public: false });
  });
});

describe("replacing", () => {
  it("bumps the revision, refuses a stale one with the current food, and keeps the kind", async () => {
    const u = await newUser();
    const milk = item();
    await u.post("/foods", milk);
    const later = { from: "2026-09-01", per: "100", values: { kcal: 45 }, source: "package" };
    const saved = await u.put(`/foods/${milk.id}`, { ...milk, labels: [...milk.labels, later], revision: 1 });
    expect(saved.status).toBe(200);
    expect(saved.body.food.revision).toBe(2);
    expect(saved.body.food.labels.map((l: any) => l.from)).toEqual([BEGINNING, "2026-09-01"]);
    expect(saved.body.undoToken).toBeTypeOf("string");

    const stale = await u.put(`/foods/${milk.id}`, { ...milk, revision: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.current.revision).toBe(2);

    expect((await u.put(`/foods/${milk.id}`, { ...recipe({ id: milk.id }), revision: 2 })).status).toBe(422);
  });

  it("treats public items as read-only and someone else's as missing", async () => {
    const u = await newUser();
    const stored = (await u.get("/foods")).body.foods.find((f: any) => f.id === water);
    const { revision, deleted, public: _p, starter, ...input } = stored;
    expect((await u.put(`/foods/${water}`, { ...input, name: "Mine", revision })).status).toBe(403);
    expect((await u.delete(`/foods/${water}`)).status).toBe(403);

    const other = await newUser();
    const milk = item();
    await other.post("/foods", milk);
    expect((await u.put(`/foods/${milk.id}`, { ...milk, revision: 1 })).status).toBe(404);
  });

  it("previews a label change on every day that used it, then rolls back", async () => {
    const u = await newUser();
    const milk = item();
    await u.post("/foods", milk);
    await u.post("/entries", foodEntry([{ foodId: milk.id, amount: { value: 1, unit: "glass" }, base: 200 }], "2026-09-10"));
    const preview = await u.put(`/foods/${milk.id}?preview=true`, { ...milk, labels: [{ ...milk.labels[0], values: { kcal: 100, protein: 1, carbs: 7, fat: 1.5 } }], revision: 1 });
    expect(preview.status).toBe(200);
    expect(preview.body.days).toEqual([expect.objectContaining({ date: "2026-09-10", before: expect.objectContaining({ kcal: { value: 100, missing: 0 } }), after: expect.objectContaining({ kcal: { value: 200, missing: 0 } }) })]);
    expect((await u.get("/foods")).body.foods.find((f: any) => f.id === milk.id).revision).toBe(1);
  });

  it("undoes a save, and refuses once the food moved on", async () => {
    const u = await newUser();
    const milk = item();
    await u.post("/foods", milk);
    const saved = await u.put(`/foods/${milk.id}`, { ...milk, name: "Soy milk", revision: 1 });
    const undone = await u.post(`/undo/${saved.body.undoToken}`);
    expect(undone.status).toBe(200);
    expect(undone.body.foods[0]).toMatchObject({ name: "Oat milk", revision: 3 });
    expect((await u.post(`/undo/${saved.body.undoToken}`)).status).toBe(410);

    const again = await u.put(`/foods/${milk.id}`, { ...milk, name: "Rice milk", revision: 3 });
    await u.put(`/foods/${milk.id}`, { ...milk, name: "Almond milk", revision: 4 });
    expect((await u.post(`/undo/${again.body.undoToken}`)).status).toBe(409);
  });
});

describe("deleting", () => {
  it("hides a food but keeps it for the entries that use it", async () => {
    const u = await newUser();
    const milk = item();
    await u.post("/foods", milk);
    await u.post("/entries", foodEntry([{ foodId: milk.id, amount: { value: 1, unit: "glass" } }]));
    expect((await u.delete(`/foods/${milk.id}`)).status).toBe(204);
    const listed = (await u.get("/foods")).body.foods.find((f: any) => f.id === milk.id);
    expect(listed).toMatchObject({ deleted: true, revision: 2 });
    expect((await u.post("/foods", combo([{ foodId: milk.id, amount: {} }]))).status).toBe(422);
    const restored = await u.post(`/foods/${milk.id}/restore`);
    expect(restored.body).toMatchObject({ deleted: false, revision: 3 });
  });
});

describe("batches", () => {
  it("creates a draft with revision 0, finishes it, and guards later saves", async () => {
    const u = await newUser();
    const beans = item({ name: "Beans", unit: "g" });
    const chili = recipe();
    await u.post("/foods", chili);
    const batch = { id: uuid(), madeOn: "2026-09-09", ingredients: [{ foodId: beans.id, amount: { value: 400, unit: "g" }, base: 400 }], gone: false };
    const draft = await u.put(`/foods/${chili.id}/batches/${batch.id}`, { ...batch, revision: 0, newFoods: [beans] });
    expect(draft.status).toBe(200);
    expect(draft.body.batch).toMatchObject({ revision: 1, deleted: false });
    expect(draft.body.batch.yield).toBeUndefined();

    const done = await u.put(`/foods/${chili.id}/batches/${batch.id}`, { ...batch, yield: { portions: 4 }, revision: 1 });
    expect(done.body.batch).toMatchObject({ yield: { portions: 4 }, revision: 2 });
    expect((await u.put(`/foods/${chili.id}/batches/${batch.id}`, { ...batch, gone: true, revision: 1 })).status).toBe(409);

    const listed = (await u.get("/foods")).body.foods.find((f: any) => f.id === chili.id);
    expect(listed.batches).toHaveLength(1);
    expect((await u.delete(`/foods/${chili.id}/batches/${batch.id}`)).status).toBe(204);
    expect((await u.get("/foods")).body.foods.find((f: any) => f.id === chili.id).batches[0].deleted).toBe(true);
  });

  it("only takes items as ingredients", async () => {
    const u = await newUser();
    const chili = recipe();
    const other = recipe({ name: "Rice" });
    await u.post("/foods", chili);
    await u.post("/foods", other);
    const res = await u.put(`/foods/${chili.id}/batches/${uuid()}`, { id: uuid(), madeOn: "2026-09-09", ingredients: [{ foodId: other.id, amount: {} }], gone: false, revision: 0 });
    expect(res.status).toBe(400);
  });
});

describe("usage", () => {
  it("counts the food each entry was logged as, and remembers the usual amount", async () => {
    const u = await newUser();
    const milk = item();
    await u.post("/foods", milk);
    const today = new Date().toISOString().slice(0, 10);
    await u.post("/entries", foodEntry([{ foodId: milk.id, amount: { value: 1, unit: "glass" } }], today));
    await u.post("/entries", { ...foodEntry([{ foodId: milk.id, amount: { value: 2, unit: "glass" } }], today), via: "drank" });
    await u.post("/entries", foodEntry([{ foodId: milk.id, amount: { value: 5, unit: "glass" } }, { foodId: water, amount: {} }], today));
    const usage = (await u.get("/foods/usage")).body.usage;
    expect(usage).toEqual([expect.objectContaining({ foodId: milk.id, ate30d: 1, drank30d: 1, usualAmount: { value: 2, unit: "glass" } })]);
  });
});

describe("barcodes", () => {
  it("lists the person's items before public ones and skips Open Food Facts when something matches", async () => {
    const u = await newUser();
    const spy = vi.spyOn(openFoodFacts, "lookup");
    const mine = item({ barcode: "5990000000001" });
    await u.post("/foods", mine);
    const res = await u.get("/barcodes/5990000000001");
    expect(res.body.foods.map((f: any) => f.id)).toEqual([mine.id]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("asks Open Food Facts on a miss and caches the answer", async () => {
    const u = await newUser();
    const code = String(Date.now());
    const spy = vi.spyOn(openFoodFacts, "lookup").mockResolvedValue({ name: "Kefir", unit: "ml", servings: [] });
    expect((await u.get(`/barcodes/${code}`)).body).toEqual({ foods: [], openFoodFacts: { name: "Kefir", unit: "ml", servings: [] } });
    expect((await u.get(`/barcodes/${code}`)).body.openFoodFacts.name).toBe("Kefir");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("icons", () => {
  it("serves the keyword list with an ETag", async () => {
    const u = await newUser();
    const res = await u.get("/icons");
    expect(res.body.icons.find((i: any) => i.names.includes("onion"))).toMatchObject({ icon: "🧅", group: "food" });
    expect((await u.get("/icons", { "if-none-match": res.headers.get("etag")! })).status).toBe(304);
  });
});
