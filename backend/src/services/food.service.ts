import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Batch, Food, FoodInput, StoredBatch } from "@dash/core";
import { entriesTable, entryLinesTable, foodsTable } from "../db/schema";
import { db, type Executor, type Tx } from "../providers/db";
import {
  catalogueVersion,
  foodRefRows,
  insertBatch,
  insertFood,
  loadBatch,
  loadFood,
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

/**
 * What the cards are ordered by and the catalogue counts. An entry is logged as one food: its
 * combo, or its only line's food. It is a use of every food it has a line on, and of its combo.
 */
export async function foodUsage(userId: string) {
  const result = await db.execute<{
    food_id: string;
    last_logged_at: string | null;
    ate_30d: number;
    drank_30d: number;
    uses: number;
    usual_value: number | null;
    usual_unit: string | null;
  }>(sql`
    with live as (
      select e.id, e.created_at, e.when_date, e.via, e.combo_id
      from ${entriesTable} e
      where e.user_id = ${userId} and e.kind = 'food' and e.deleted_at is null
    ),
    logged as (
      select g.*, coalesce(g.combo_id, (select min(l.food_id::text)::uuid from ${entryLinesTable} l where l.entry_id = g.id having count(*) = 1)) as food_id
      from live g
    ),
    uses as (
      select food_id, count(distinct entry_id)::int as uses from (
        select l.food_id, l.entry_id from ${entryLinesTable} l join live g on g.id = l.entry_id where l.food_id is not null
        union all
        select g.combo_id, g.id from live g where g.combo_id is not null
      ) u
      group by food_id
    ),
    usual as (
      select distinct on (l.food_id) l.food_id, l.amount_value, l.amount_unit
      from logged g
      join ${entryLinesTable} l on l.entry_id = g.id
      where g.combo_id is null and g.food_id = l.food_id and l.amount_value is not null
      order by l.food_id, g.created_at desc
    ),
    counts as (
      select food_id,
        max(created_at) as last_logged_at,
        (count(*) filter (where via = 'ate' and when_date >= current_date - 30))::int as ate_30d,
        (count(*) filter (where via = 'drank' and when_date >= current_date - 30))::int as drank_30d
      from logged
      where food_id is not null
      group by food_id
    )
    select u.food_id, c.last_logged_at, coalesce(c.ate_30d, 0) as ate_30d, coalesce(c.drank_30d, 0) as drank_30d, u.uses,
      s.amount_value as usual_value, s.amount_unit as usual_unit
    from uses u
    left join counts c on c.food_id = u.food_id
    left join usual s on s.food_id = u.food_id
    order by c.last_logged_at desc nulls last, u.food_id
  `);
  return {
    usage: result.rows.map((r) => ({
      foodId: r.food_id,
      ...(r.last_logged_at !== null ? { lastLoggedAt: new Date(r.last_logged_at).toISOString() } : {}),
      ate30d: r.ate_30d,
      drank30d: r.drank_30d,
      ...(r.usual_value !== null || r.usual_unit !== null
        ? { usualAmount: { ...(r.usual_value !== null ? { value: r.usual_value } : {}), ...(r.usual_unit !== null ? { unit: r.usual_unit } : {}) } }
        : {}),
      uses: r.uses,
    })),
  };
}

/** Live catalogued items with the barcode: the person's own first, then public ones. */
export async function foodsWithBarcode(userId: string, code: string) {
  const foods = await loadFoods(
    db,
    and(visibleTo(userId), eq(foodsTable.barcode, code), eq(foodsTable.catalogued, true), isNull(foodsTable.deletedAt)),
  );
  return [...foods.filter((f) => !f.public), ...foods.filter((f) => f.public)];
}
