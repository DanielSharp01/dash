import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Batch, Food, FoodInput, StoredBatch } from "@dash/core";
import { foodsTable } from "../db/schema";
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
} from "../repositories/food.repo";
import { weakEtag } from "../http/respond";
import { claimId, expectRevision, notFound, sameId, unprocessable, writable } from "./common";
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
  return { foods: await loadFoods(db, visibleTo(userId)), etag: weakEtag("foods", userId, version.count, version.latest) };
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
    const row = writable(await lockFood(tx, id), userId);
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

export async function setFoodDeletedFor(userId: string, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    const row = writable(await lockFood(tx, id), userId);
    if ((row.deletedAt !== null) !== deleted) await setFoodDeleted(tx, id, deleted, row.revision + 1);
    return (await loadFood(tx, id))!;
  });
}

async function recipeFor(ex: Executor, userId: string, recipeId: string) {
  const row = writable(await lockFood(ex, recipeId), userId);
  if (row.kind !== "recipe") throw notFound();
  return row;
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
    const existing = await loadBatch(tx, batchId, { lock: true });
    if (existing && existing.recipeId !== recipeId) throw notFound();
    const batch: Batch = { id: req.id, madeOn: req.madeOn, ingredients: req.ingredients, gone: req.gone, ...(req.yield ? { yield: req.yield } : {}) };
    if (!existing) {
      if (req.revision !== 0) throw notFound();
      await checkFoodRefs(tx, userId, batchInputRefs(batch));
      await insertBatch(tx, recipeId, batch);
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
    const existing = await loadBatch(tx, batchId, { lock: true });
    if (!existing || existing.recipeId !== recipeId) throw notFound();
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
