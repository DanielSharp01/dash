import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { asItem, type Batch, type Food, type FoodInput, type FoodItemInput, isFinished, type Recipe, type StoredBatch } from "@dash/core";
import { batchesTable, batchIngredientsTable, comboPartsTable, entriesTable, entryLinesTable, foodsTable } from "../db/schema";
import { db, type Executor, type Tx } from "../providers/db";
import {
  catalogueVersion,
  foodRefRows,
  insertBatch,
  insertFood,
  loadBatch,
  loadFood,
  loadFoodUsage,
  loadFoods,
  lockFood,
  setFoodDeleted,
  updateBatch,
  updateFood,
  visibleTo,
  loadYourFoods,
  searchShared,
  type BatchRef,
} from "../repositories/food.repo";
import { weakEtag } from "../http/respond";
import { claimId, editableFood, expectRevision, notFound, readOnly, sameId, unprocessable, visible, writable } from "./common";
import { batchInputRefs, checkFoodRefs, foodDocRefIds, foodInputRefs } from "./refs";
import { runWrite, type UndoRecorder } from "./write";

const kindOrder = { item: 0, recipe: 1, combo: 2 } as const;

/**
 * Creates foods sent along with a write (`newFoods`). Items go first, so a new combo can use a
 * new item. A food that already exists for this person is left as stored, like any create retry.
 */
export async function createNewFoods(tx: Tx, userId: string, inputs: FoodInput[] = [], undo?: UndoRecorder): Promise<Food[]> {
  const sorted = [...inputs].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]);
  for (const input of sorted) await createFoodRow(tx, userId, input, undo);
  const foods = await loadFoods(tx, inArray(foodsTable.id, inputs.map((f) => f.id)));
  return inputs.map((i) => foods.find((f) => f.id === i.id)!);
}

/** Returns whether a row was inserted; false means a retry of an earlier create. */
export async function createFoodRow(tx: Tx, userId: string, input: FoodInput, undo?: UndoRecorder) {
  const [row] = await foodRefRows(tx, [input.id]);
  if (claimId(row, userId) === "retry") return false;
  if (input.kind === "combo" && input.parts.some((p) => p.foodId === input.id)) throw unprocessable("A combo can't contain itself");
  await checkFoodRefs(tx, userId, foodInputRefs(input));
  await insertFood(tx, { userId }, input);
  undo?.createdFood(input.id);
  return true;
}

export async function listFoods(userId: string) {
  const version = await catalogueVersion(db, userId);
  return { foods: await loadYourFoods(db, userId), etag: weakEtag("foods", userId, version.count, version.latest) };
}

export async function searchFoods(userId: string, query: string) {
  return { foods: await searchShared(db, userId, query) };
}

export async function createFood(userId: string, req: FoodInput & { newFoods?: FoodInput[] | undefined }) {
  return db.transaction(async (tx) => {
    const newFoods = await createNewFoods(tx, userId, req.newFoods);
    const isNew = await createFoodRow(tx, userId, req);
    return { isNew, body: { food: (await loadFood(tx, req.id))!, newFoods, newActivities: [] } };
  });
}

export async function updateFoodDoc(
  userId: string,
  id: string,
  req: FoodInput & { revision: number; newFoods?: FoodInput[] | undefined },
  preview: boolean,
) {
  sameId(id, req.id);
  return runWrite(userId, { preview, undo: true }, async (tx, undo) => {
    const row = editableFood(await lockFood(tx, id), userId);
    if (row.kind !== req.kind) throw unprocessable("A food's kind can't change");
    await expectRevision(row.revision, req.revision, () => loadFood(tx, id));
    const newFoods = await createNewFoods(tx, userId, req.newFoods, undo);
    if (req.kind === "combo" && req.parts.some((p) => p.foodId === id)) throw unprocessable("A combo can't contain itself");
    const before = await loadFood(tx, id);
    await checkFoodRefs(tx, userId, foodInputRefs(req), foodDocRefIds(before));
    await undo.food(id);
    await updateFood(tx, req, { revision: row.revision + 1, deleted: row.deletedAt !== null });
    return { food: (await loadFood(tx, id))!, newFoods, newActivities: [] };
  });
}

/**
 * Makes one of the person's items public for everyone, with them recorded as its publisher.
 * Final through the app: others may be logging it straight away.
 */
export async function publishFood(userId: string, id: string, referenceBatchId?: string) {
  return db.transaction(async (tx) => {
    const row = writable(await lockFood(tx, id), userId);
    if (!row.catalogued || row.unsure || row.deletedAt) throw unprocessable("Only a filled-in food in the catalogue can be published");
    if (row.kind === "recipe") await publishReferenceBatch(tx, id, referenceBatchId);
    if (row.kind === "combo") {
      // Everyone must be able to see every part, so a private part has to be published first.
      const parts = await tx
        .select({ name: foodsTable.name, userId: foodsTable.userId })
        .from(comboPartsTable)
        .innerJoin(foodsTable, eq(foodsTable.id, comboPartsTable.foodId))
        .where(eq(comboPartsTable.comboId, id));
      const own = parts.filter((p) => p.userId !== null).map((p) => p.name);
      if (own.length) throw unprocessable("Publish its parts first", { private: own });
    }
    await tx.update(foodsTable).set({ userId: null, publishedBy: userId, revision: row.revision + 1, updatedAt: new Date() }).where(eq(foodsTable.id, id));
    return { food: (await loadFood(tx, id, userId))! };
  });
}

/**
 * A published recipe gets a reference batch everyone logs and cooks from until they make it
 * themselves: a copy of the chosen finished batch, the latest by default, so the publisher's own
 * batch and the entries pointing at it stay theirs.
 */
async function publishReferenceBatch(tx: Tx, recipeId: string, batchId?: string) {
  const recipe = (await loadFood(tx, recipeId)) as Recipe;
  const finished = recipe.batches.filter((b) => !b.deleted && isFinished(b));
  const chosen = batchId ? finished.find((b) => b.id === batchId) : finished.at(-1);
  if (!chosen) throw unprocessable(batchId ? "Pick a finished batch of this recipe" : "Cook it once before publishing, so others have a batch to start from");
  const ingredients = await tx
    .select({ name: foodsTable.name, userId: foodsTable.userId })
    .from(foodsTable)
    .where(inArray(foodsTable.id, chosen.ingredients.map((i) => i.foodId)));
  const own = ingredients.filter((i) => i.userId !== null).map((i) => i.name);
  if (own.length) throw unprocessable("Publish its ingredients first", { private: own });
  const { revision: _r, deleted: _d, shared: _s, ...batch } = chosen;
  await insertBatch(tx, recipeId, { ...batch, id: randomUUID(), gone: false }, null);
}

/**
 * "Make my own version": a private copy of a public item or combo. The person's entries, combos
 * and batches move onto it, so it's theirs from the first day; fixes to the shared one no longer
 * reach it.
 */
export async function copyFood(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const row = visible(await lockFood(tx, id), userId);
    if (row.userId !== null || row.kind === "recipe") throw unprocessable("Only a shared item or combo can be copied; recipes keep your own batches instead");
    const shared = (await loadFood(tx, id))!;
    const { revision: _r, deleted: _d, public: _p, starter: _s, ...input } = shared as Exclude<Food, Recipe>;
    const copyId = randomUUID();
    await insertFood(tx, { userId }, { ...input, id: copyId, originId: id });
    await moveUses(tx, userId, id, copyId);
    return { food: (await loadFood(tx, copyId, userId))! };
  });
}

async function moveUses(tx: Tx, userId: string, from: string, to: string) {
  const entryIds = (
    await tx
      .select({ id: entriesTable.id })
      .from(entriesTable)
      .innerJoin(entryLinesTable, eq(entryLinesTable.entryId, entriesTable.id))
      .where(and(eq(entriesTable.userId, userId), eq(entryLinesTable.foodId, from)))
  ).map((e) => e.id);
  if (entryIds.length) {
    await tx.update(entryLinesTable).set({ foodId: to }).where(and(eq(entryLinesTable.foodId, from), inArray(entryLinesTable.entryId, entryIds)));
    await tx.update(entriesTable).set({ revision: sql`${entriesTable.revision} + 1`, updatedAt: new Date() }).where(inArray(entriesTable.id, entryIds));
  }
  const combos = tx.select({ id: foodsTable.id }).from(foodsTable).where(eq(foodsTable.userId, userId));
  await tx.update(comboPartsTable).set({ foodId: to }).where(and(eq(comboPartsTable.foodId, from), inArray(comboPartsTable.comboId, combos)));
  const batches = tx.select({ id: batchesTable.id }).from(batchesTable).where(eq(batchesTable.userId, userId));
  await tx.update(batchIngredientsTable).set({ foodId: to }).where(and(eq(batchIngredientsTable.foodId, from), inArray(batchIngredientsTable.batchId, batches)));
}

/** Public items too: retiring one is soft, so past entries keep it and it can be restored. */
export async function setFoodDeletedFor(userId: string, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    const row = editableFood(await lockFood(tx, id), userId);
    if ((row.deletedAt !== null) !== deleted) await setFoodDeleted(tx, id, deleted, row.revision + 1);
    return (await loadFood(tx, id, userId))!;
  });
}

/** One's own recipes and public ones, which everyone cooks in their own batches. */
async function recipeFor(ex: Executor, userId: string, recipeId: string) {
  const row = visible(await lockFood(ex, recipeId), userId);
  if (row.kind !== "recipe") throw notFound();
  return row;
}

/** A batch is its cook's; a reference batch belongs to nobody and isn't changed through the app. */
function ownBatch(existing: BatchRef | undefined, recipeId: string, userId: string) {
  if (!existing || existing.recipeId !== recipeId) return undefined;
  if (existing.owner !== userId) throw existing.owner === null ? readOnly() : notFound();
  return existing;
}

/** I cooked writes a draft at every step, so a batch is created and replaced on its own. */
export async function saveBatch(
  userId: string,
  recipeId: string,
  batchId: string,
  req: Batch & { revision: number; newFoods?: FoodInput[] | undefined },
) {
  sameId(batchId, req.id);
  return db.transaction(async (tx) => {
    const newFoods = await createNewFoods(tx, userId, req.newFoods);
    await recipeFor(tx, userId, recipeId);
    const found = await loadBatch(tx, batchId, { lock: true });
    if (found && found.recipeId !== recipeId) throw notFound();
    const existing = ownBatch(found, recipeId, userId);
    const batch: Batch = { id: req.id, madeOn: req.madeOn, ingredients: req.ingredients, gone: req.gone, ...(req.yield ? { yield: req.yield } : {}) };
    if (!existing) {
      if (req.revision !== 0) throw notFound();
      await checkFoodRefs(tx, userId, batchInputRefs(batch));
      await insertBatch(tx, recipeId, batch, userId);
    } else {
      await expectRevision(existing.batch.revision, req.revision, async () => existing.batch);
      await checkFoodRefs(tx, userId, batchInputRefs(batch), new Set(existing.batch.ingredients.map((i) => i.foodId)));
      await updateBatch(tx, recipeId, batch, { revision: existing.batch.revision + 1, deleted: existing.batch.deleted });
    }
    return { batch: (await loadBatch(tx, batchId))!.batch, newFoods, newActivities: [] };
  });
}

export async function setBatchDeleted(userId: string, recipeId: string, batchId: string, deleted: boolean): Promise<StoredBatch> {
  return db.transaction(async (tx) => {
    await recipeFor(tx, userId, recipeId);
    const existing = ownBatch(await loadBatch(tx, batchId, { lock: true }), recipeId, userId);
    if (!existing) throw notFound();
    if (existing.batch.deleted !== deleted) await updateBatch(tx, recipeId, existing.batch, { revision: existing.batch.revision + 1, deleted });
    return (await loadBatch(tx, batchId))!.batch;
  });
}

export async function foodUsage(userId: string) {
  return { usage: await loadFoodUsage(db, userId) };
}

/** Live catalogued items with the barcode: the person's own first, then public ones. */
export async function foodsWithBarcode(userId: string, code: string) {
  const foods = await loadFoods(
    db,
    and(visibleTo(userId), eq(foodsTable.barcode, code), eq(foodsTable.catalogued, true), isNull(foodsTable.deletedAt)),
  );
  return [...foods.filter((f) => !f.public), ...foods.filter((f) => f.public)];
}
