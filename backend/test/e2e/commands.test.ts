import { describe, expect, it } from "vitest";
import { publicFoodId } from "../../src/seeds";
import { combo, foodEntry, item, recipe, unsureItem } from "../support/fixtures";
import { newUser, uuid, type Client } from "../support/helpers";

const water = publicFoodId("water");
const onion = publicFoodId("onion");

async function logUnsure(u: Client, overrides: Parameters<typeof unsureItem>[1] = {}) {
  const stew = unsureItem("onion?", overrides);
  const entry = foodEntry([{ foodId: stew.id, amount: { value: 2, unit: "onion" } }]);
  await u.post("/entries", { ...entry, newFoods: [stew] });
  return { stew, entry };
}

describe("merge", () => {
  it("moves lines to the target with a fresh base, soft-deletes the source, and undoes", async () => {
    const u = await newUser();
    const { stew, entry } = await logUnsure(u);
    const res = await u.post(`/foods/${stew.id}/merge`, { targetId: onion });
    expect(res.status).toBe(200);
    const moved = res.body.entries.find((e: any) => e.id === entry.id);
    expect(moved.lines[0]).toMatchObject({ foodId: onion, rawName: "onion?", base: 220 });
    expect(res.body.foods.find((f: any) => f.id === stew.id).deleted).toBe(true);
    expect((await u.get("/follow-up")).body.unsureItems).toEqual([]);

    const undone = await u.post(`/undo/${res.body.undoToken}`);
    expect(undone.status).toBe(200);
    expect(undone.body.entries[0].lines[0].foodId).toBe(stew.id);
    expect(undone.body.foods[0]).toMatchObject({ id: stew.id, deleted: false });
  });

  it("previews the affected days without changing anything", async () => {
    const u = await newUser();
    const { stew, entry } = await logUnsure(u);
    const res = await u.post(`/foods/${stew.id}/merge?preview=true`, { targetId: onion });
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].before.kcal).toEqual({ value: 0, missing: 1 });
    expect(res.body.days[0].after.kcal.value).toBeCloseTo(88);
    const stored = (await u.get("/entries?from=2026-09-10&to=2026-09-10")).body.entries.find((e: any) => e.id === entry.id);
    expect(stored.lines[0].foodId).toBe(stew.id);
  });

  it("expands into a combo's parts, scaled by the amount logged", async () => {
    const u = await newUser();
    const { stew, entry } = await logUnsure(u);
    const breakfast = combo([{ foodId: water, amount: { value: 1, unit: "glass" } }]);
    await u.post("/foods", breakfast);
    const res = await u.post(`/foods/${stew.id}/merge`, { targetId: breakfast.id });
    const moved = res.body.entries.find((e: any) => e.id === entry.id);
    expect(moved.comboId).toBe(breakfast.id);
    expect(moved.lines).toEqual([expect.objectContaining({ foodId: water, amount: { value: 2, unit: "glass" }, base: 500 })]);
  });

  it("moves ingredients and combo parts, and the barcode when the target has none", async () => {
    const u = await newUser();
    const { stew } = await logUnsure(u, { barcode: "123456" });
    const chili = recipe();
    const meal = combo([{ foodId: stew.id, amount: { value: 1, unit: "onion" } }]);
    const target = item({ name: "Red onion", unit: "g", servings: [{ name: "onion", size: 100 }] });
    await u.post("/foods", chili);
    await u.post("/foods", meal);
    await u.post("/foods", target);
    const batchId = uuid();
    await u.put(`/foods/${chili.id}/batches/${batchId}`, { id: batchId, madeOn: "2026-09-01", ingredients: [{ foodId: stew.id, amount: { value: 1, unit: "onion" } }], gone: false, revision: 0 });

    const res = await u.post(`/foods/${stew.id}/merge`, { targetId: target.id });
    const foods = Object.fromEntries(res.body.foods.map((f: any) => [f.id, f]));
    expect(foods[chili.id].batches[0].ingredients[0]).toMatchObject({ foodId: target.id, base: 100 });
    expect(foods[meal.id].parts[0].foodId).toBe(target.id);
    expect(foods[target.id].barcode).toBe("123456");
  });

  it("only merges the person's own live items", async () => {
    const u = await newUser();
    const { stew } = await logUnsure(u);
    expect((await u.post(`/foods/${onion}/merge`, { targetId: stew.id })).status).toBe(403);
    expect((await u.post(`/foods/${stew.id}/merge`, { targetId: stew.id })).status).toBe(422);
    const other = await newUser();
    expect((await other.post(`/foods/${stew.id}/merge`, { targetId: onion })).status).toBe(404);
    const theirs = item();
    await other.post("/foods", theirs);
    expect((await u.post(`/foods/${stew.id}/merge`, { targetId: theirs.id })).status).toBe(404);
  });
});

describe("complete as combo", () => {
  it("creates the combo with new foods and merges the item into it; undo removes them again", async () => {
    const u = await newUser();
    const { stew, entry } = await logUnsure(u);
    const bread = item({ name: "Bread", unit: "g", servings: [{ name: "slice", size: 40 }] });
    const sandwich = combo([{ foodId: bread.id, amount: { value: 2, unit: "slice" } }], { name: "Sandwich" });
    const res = await u.post(`/foods/${stew.id}/complete-as-combo`, { combo: sandwich, newFoods: [bread] });
    expect(res.status).toBe(200);
    const moved = res.body.entries.find((e: any) => e.id === entry.id);
    expect(moved).toMatchObject({ comboId: sandwich.id, lines: [expect.objectContaining({ foodId: bread.id, amount: { value: 4, unit: "slice" }, base: 160 })] });

    expect((await u.post(`/undo/${res.body.undoToken}`)).status).toBe(200);
    const ids = (await u.get("/foods")).body.foods.map((f: any) => f.id);
    expect(ids).not.toContain(sandwich.id);
    expect(ids).not.toContain(bread.id);
  });
});

describe("reconvert", () => {
  it("recomputes base from the item's current servings", async () => {
    const u = await newUser();
    const chips = item({ name: "Chips", unit: "g", servings: [{ name: "pack" }] });
    const entry = foodEntry([{ foodId: chips.id, amount: { value: 1, unit: "pack" } }]);
    await u.post("/entries", { ...entry, newFoods: [chips] });
    expect((await u.get("/follow-up")).body.entries.map((e: any) => e.id)).toEqual([entry.id]);
    await u.put(`/foods/${chips.id}`, { ...chips, servings: [{ name: "pack", size: 150 }], revision: 1 });

    const res = await u.post("/entries/reconvert", { lineIds: [entry.lines[0]!.id] });
    expect(res.body.entries[0].lines[0].base).toBe(150);
    expect((await u.get("/follow-up")).body.entries).toEqual([]);
    expect((await (await newUser()).post("/entries/reconvert", { lineIds: [entry.lines[0]!.id] })).status).toBe(404);
  });
});

describe("move to batch", () => {
  it("points recipe lines at another batch of the same recipe", async () => {
    const u = await newUser();
    const chili = recipe();
    await u.post("/foods", chili);
    const [b1, b2] = [uuid(), uuid()];
    for (const [id, madeOn] of [[b1, "2026-09-01"], [b2, "2026-09-08"]] as const)
      await u.put(`/foods/${chili.id}/batches/${id}`, { id, madeOn, ingredients: [], yield: { portions: 4 }, gone: false, revision: 0 });
    const entry = foodEntry([{ foodId: chili.id, batchId: b1, amount: { value: 1, unit: "portion" } }]);
    await u.post("/entries", entry);

    const res = await u.post("/entries/move-to-batch", { lineIds: [entry.lines[0]!.id], batchId: b2 });
    expect(res.body.entries[0].lines[0].batchId).toBe(b2);

    const other = recipe({ name: "Soup" });
    await u.post("/foods", other);
    const soupBatch = uuid();
    await u.put(`/foods/${other.id}/batches/${soupBatch}`, { id: soupBatch, madeOn: "2026-09-01", ingredients: [], gone: false, revision: 0 });
    expect((await u.post("/entries/move-to-batch", { lineIds: [entry.lines[0]!.id], batchId: soupBatch })).status).toBe(422);
  });
});
