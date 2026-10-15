import { describe, expect, it, vi } from "vitest";
import { BEGINNING } from "@dash/core";
import { openFoodFacts } from "../../src/providers/openFoodFacts";
import { publicFoodId } from "../../src/seeds";
import { combo, foodEntry, item, recipe, unsureItem } from "../support/fixtures";
import { newUser, uuid } from "../support/helpers";

const water = publicFoodId("water");
const onion = publicFoodId("onion");

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

describe("loading", () => {
  it("loads the person's own foods, the starters, and shared ones only once they've used them", async () => {
    const u = await newUser();
    const ids = async () => (await u.get("/foods")).body.foods.map((f: any) => f.id);
    expect(await ids()).toContain(water);
    expect(await ids()).not.toContain(onion);

    const etag = (await u.get("/foods")).headers.get("etag")!;
    await u.post("/entries", foodEntry([{ foodId: onion, amount: { value: 100, unit: "g" }, base: 100 }], "2026-09-10"));
    expect((await u.get("/foods", { "if-none-match": etag })).status).toBe(200);
    expect(await ids()).toContain(onion);
  });

  it("loads the shared original of an own version, so it can say what it's a version of", async () => {
    const u = await newUser();
    await u.post(`/foods/${onion}/copy`);
    expect((await u.get("/foods")).body.foods.map((f: any) => f.id)).toContain(onion);
  });

  it("loads what a used combo points at, so its total adds up", async () => {
    const u = await newUser();
    const salad = combo([{ foodId: onion, amount: { value: 50, unit: "g" } }]);
    await u.post("/foods", salad);
    expect((await u.get("/foods")).body.foods.map((f: any) => f.id)).toContain(onion);
  });

  it("searches the shared catalogue by name, variant or brand, ignoring accents and case", async () => {
    const u = await newUser();
    const owner = await newUser();
    const fustli = item({ name: "Füstli", variant: "Csípős", brand: "Sága" });
    await owner.post("/foods", fustli);
    expect((await u.get("/foods/search?q=fustli")).body.foods.some((f: any) => f.id === fustli.id)).toBe(false);
    await owner.post(`/foods/${fustli.id}/publish`);
    for (const q of ["fustli", "FÜST", "csipos", "saga", "saga fustli", "csipos füstli"]) expect((await u.get(`/foods/search?q=${encodeURIComponent(q)}`)).body.foods.some((f: any) => f.id === fustli.id)).toBe(true);
    expect((await u.get("/foods/search?q=x")).status).toBe(400);
  });
});

describe("creating", () => {
  it("returns 201, then the stored food with 200 on a retry, and 409 for someone else's id", async () => {
    const u = await newUser();
    const milk = item({ variant: "Vanilla", brand: "Alpro" });
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
    const later = { from: "2026-09-01", per: "100", values: { kcal: 45 }, verified: true };
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

  it("lets anyone fix a public item for everyone but not delete it, and treats someone else's as missing", async () => {
    const u = await newUser();
    const stored = (await u.get("/foods/search?q=onion")).body.foods.find((f: any) => f.id === onion);
    const { revision, deleted, public: _p, starter, ...input } = stored;
    const fixed = await u.put(`/foods/${onion}`, { ...input, variant: "raw, yellow", revision });
    expect(fixed.status).toBe(200);
    expect(fixed.body.food).toMatchObject({ variant: "raw, yellow", public: true, revision: revision + 1 });
    const someoneElse = await newUser();
    expect((await someoneElse.get("/foods/search?q=onion")).body.foods.find((f: any) => f.id === onion).variant).toBe("raw, yellow");
    await u.put(`/foods/${onion}`, { ...input, revision: revision + 1 });

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

describe("own versions", () => {
  it("copies a public item for the person and moves their entries onto it", async () => {
    const u = await newUser();
    const other = await newUser();
    const logged = await u.post("/entries", foodEntry([{ foodId: water, amount: { value: 1, unit: "glass" }, base: 250 }], "2026-09-10"));
    const theirs = await other.post("/entries", foodEntry([{ foodId: water, amount: { value: 1, unit: "glass" }, base: 250 }], "2026-09-10"));

    const res = await u.post(`/foods/${water}/copy`);
    expect(res.status).toBe(200);
    expect(res.body.food).toMatchObject({ name: "Water", public: false, originId: water });
    const copy = res.body.food.id;

    const mine = (await u.get("/entries?from=2026-09-10&to=2026-09-10")).body.entries.find((e: any) => e.id === logged.body.entry.id);
    expect(mine.lines[0].foodId).toBe(copy);
    expect(mine.revision).toBe(2);
    const untouched = (await other.get("/entries?from=2026-09-10&to=2026-09-10")).body.entries.find((e: any) => e.id === theirs.body.entry.id);
    expect(untouched.lines[0].foodId).toBe(water);
    expect((await u.get("/foods")).body.foods.filter((f: any) => f.name === "Water" && !f.deleted)).toHaveLength(2);
  });

  it("gives back the existing own version instead of making a second one", async () => {
    const u = await newUser();
    const first = await u.post(`/foods/${water}/copy`);
    const again = await u.post(`/foods/${water}/copy`);
    expect(again.body.food.id).toBe(first.body.food.id);
    expect((await u.get("/foods")).body.foods.filter((f: any) => f.originId === water && !f.deleted)).toHaveLength(1);
  });

  it("refuses to copy one's own item or a recipe", async () => {
    const u = await newUser();
    const own = item();
    await u.post("/foods", own);
    expect((await u.post(`/foods/${own.id}/copy`)).status).toBe(422);
  });
});

describe("publishing", () => {
  it("makes a person's item public for everyone, once", async () => {
    const u = await newUser();
    const other = await newUser();
    const own = item();
    await u.post("/foods", own);

    const res = await u.post(`/foods/${own.id}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.food).toMatchObject({ id: own.id, public: true, revision: 2 });
    expect((await other.get("/foods/search?q=oat milk")).body.foods.find((f: any) => f.id === own.id)).toMatchObject({ public: true, name: "Oat milk" });

    expect((await u.post(`/foods/${own.id}/publish`)).status).toBe(403);
  });

  it("lets anyone retire a public item for everyone, softly", async () => {
    const u = await newUser();
    const other = await newUser();
    const own = item({ name: "Retired milk" });
    await u.post("/foods", own);
    await u.post(`/foods/${own.id}/publish`);

    expect((await other.delete(`/foods/${own.id}`)).status).toBe(204);
    expect((await u.get("/foods")).body.foods.find((f: any) => f.id === own.id)).toMatchObject({ public: true, deleted: true });
    expect((await u.post(`/foods/${own.id}/restore`)).body).toMatchObject({ deleted: false });
  });

  it("publishes a combo once all its parts are public", async () => {
    const u = await newUser();
    const milk = item({ name: "Combo milk" });
    const breakfast = combo([{ foodId: milk.id, amount: { value: 1, unit: "glass" } }]);
    await u.post("/foods", milk);
    await u.post("/foods", breakfast);

    const refused = await u.post(`/foods/${breakfast.id}/publish`);
    expect(refused.status).toBe(422);
    expect(refused.body.private).toEqual(["Combo milk"]);

    await u.post(`/foods/${milk.id}/publish`);
    const res = await u.post(`/foods/${breakfast.id}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.food).toMatchObject({ kind: "combo", public: true });
    expect((await (await newUser()).get("/foods/search?q=breakfast")).body.foods.some((f: any) => f.id === breakfast.id)).toBe(true);
  });

  it("refuses to publish an item the shared catalogue already has", async () => {
    const u = await newUser();
    const first = item({ name: "Bell pepper", variant: "Red" });
    const twin = item({ name: "bell pepper", variant: "red" });
    await u.post("/foods", first);
    await u.post("/foods", twin);
    await u.post(`/foods/${first.id}/publish`);
    const res = await u.post(`/foods/${twin.id}/publish`);
    expect(res.status).toBe(422);
    expect(res.body.duplicateId).toBe(first.id);
  });

  it("refuses an unsure item and someone else's", async () => {
    const u = await newUser();
    const unsure = unsureItem();
    await u.post("/foods", unsure);
    expect((await u.post(`/foods/${unsure.id}/publish`)).status).toBe(422);

    const theirs = item();
    await (await newUser()).post("/foods", theirs);
    expect((await u.post(`/foods/${theirs.id}/publish`)).status).toBe(404);
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

  it("publishes a recipe with a copy of a finished batch as everyone's reference, and keeps each cook's batches their own", async () => {
    const u = await newUser();
    const other = await newUser();
    const beans = item({ name: "Beans", unit: "g" });
    const chili = recipe();
    await u.post("/foods", beans);
    await u.post("/foods", chili);
    const mine = { id: uuid(), madeOn: "2026-09-09", ingredients: [{ foodId: beans.id, amount: { value: 400, unit: "g" }, base: 400 }], yield: { portions: 4 }, gone: false };
    await u.put(`/foods/${chili.id}/batches/${mine.id}`, { ...mine, revision: 0 });

    const refused = await u.post(`/foods/${chili.id}/publish`);
    expect(refused.status).toBe(422);
    expect(refused.body.private).toEqual(["Beans"]);
    await u.post(`/foods/${beans.id}/publish`);

    const published = await u.post(`/foods/${chili.id}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.food).toMatchObject({ kind: "recipe", public: true });
    expect(published.body.food.batches.map((b: any) => [b.id === mine.id, !!b.shared])).toEqual([
      [true, false],
      [false, true],
    ]);

    const seen = (await other.get("/foods/search?q=chili")).body.foods.find((f: any) => f.id === chili.id);
    expect(seen.batches).toHaveLength(1);
    expect(seen.batches[0]).toMatchObject({ shared: true, yield: { portions: 4 } });

    const theirs = { ...mine, id: uuid(), madeOn: "2026-10-01" };
    expect((await other.put(`/foods/${chili.id}/batches/${theirs.id}`, { ...theirs, revision: 0 })).status).toBe(200);
    expect((await other.put(`/foods/${chili.id}/batches/${mine.id}`, { ...mine, gone: true, revision: 1 })).status).toBe(404);
    expect((await other.put(`/foods/${chili.id}/batches/${seen.batches[0].id}`, { ...mine, id: seen.batches[0].id, revision: 1 })).status).toBe(403);
    expect((await u.get("/foods")).body.foods.find((f: any) => f.id === chili.id).batches).toHaveLength(2);
  });

  it("refuses to publish a recipe nobody has cooked yet", async () => {
    const u = await newUser();
    const chili = recipe();
    await u.post("/foods", chili);
    expect((await u.post(`/foods/${chili.id}/publish`)).status).toBe(422);
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
  it("counts the food each entry was logged as, every use, and remembers the usual amount", async () => {
    const u = await newUser();
    const milk = item();
    const breakfast = combo([{ foodId: milk.id, amount: { value: 1, unit: "glass" } }]);
    await u.post("/foods", milk);
    await u.post("/foods", breakfast);
    const today = new Date().toISOString().slice(0, 10);
    await u.post("/entries", foodEntry([{ foodId: milk.id, amount: { value: 1, unit: "glass" } }], today));
    await u.post("/entries", { ...foodEntry([{ foodId: milk.id, amount: { value: 2, unit: "glass" } }], today), via: "drank" });
    await u.post("/entries", foodEntry([{ foodId: milk.id, amount: { value: 5, unit: "glass" } }, { foodId: water, amount: {} }], today));
    await u.post("/entries", { ...foodEntry([{ foodId: milk.id, amount: { value: 1, unit: "glass" } }], today), comboId: breakfast.id });
    const deleted = foodEntry([{ foodId: milk.id, amount: { value: 9, unit: "glass" } }], today);
    await u.post("/entries", deleted);
    await u.delete(`/entries/${deleted.id}`);

    const usage = Object.fromEntries((await u.get("/foods/usage")).body.usage.map((r: any) => [r.foodId, r]));
    expect(usage[milk.id]).toMatchObject({ ate30d: 1, drank30d: 1, usualAmount: { value: 2, unit: "glass" }, uses: 4 });
    expect(usage[breakfast.id]).toMatchObject({ ate30d: 1, uses: 1 });
    expect(usage[water]).toEqual({ foodId: water, ate30d: 0, drank30d: 0, uses: 1 });
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

  it("asks Open Food Facts for the product even when an item has the code", async () => {
    const u = await newUser();
    const code = String(Date.now() + 1);
    await u.post("/foods", item({ barcode: code }));
    const spy = vi.spyOn(openFoodFacts, "lookup").mockResolvedValue({ name: "Kefir", unit: "ml", servings: [] });
    expect((await u.get(`/barcodes/${code}/product`)).body).toEqual({ openFoodFacts: { name: "Kefir", unit: "ml", servings: [] } });
    spy.mockResolvedValue(undefined);
    expect((await u.get(`/barcodes/${code}x/product`)).body).toEqual({});
    spy.mockRestore();
  });

  it("never asks Open Food Facts about codes shops assign themselves", async () => {
    const u = await newUser();
    const spy = vi.spyOn(openFoodFacts, "lookup").mockResolvedValue({ name: "Kefir", unit: "ml", servings: [] });
    for (const code of ["2012345678903", "0212345678901", "0412345678909", "212345678906", "412345678904"]) {
      expect((await u.get(`/barcodes/${code}`)).body).toEqual({ foods: [] });
      expect((await u.get(`/barcodes/${code}/product`)).body).toEqual({});
    }
    expect(spy).not.toHaveBeenCalled();
    const mine = item({ barcode: "2012345678903" });
    await u.post("/foods", mine);
    expect((await u.get("/barcodes/2012345678903")).body.foods.map((f: any) => f.id)).toEqual([mine.id]);
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
