import { and, asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  nutrientKeys,
  type Batch,
  type Food,
  type FoodInput,
  type Label,
  type Nutrients,
  type Portion,
  type StoredBatch,
} from "@dash/core";
import {
  batchesTable,
  batchIngredientsTable,
  comboPartsTable,
  foodsTable,
  labelsTable,
  servingsTable,
} from "../db/schema";
import type { Executor } from "../providers/db";
import { opt, toAmount } from "./mapping";

export type FoodRow = typeof foodsTable.$inferSelect;
type LabelRow = typeof labelsTable.$inferSelect;
type BatchRow = typeof batchesTable.$inferSelect;
type IngredientRow = typeof batchIngredientsTable.$inferSelect;

/** Everything a person can see: their own foods and every public one. */
export const visibleTo = (userId: string) => or(eq(foodsTable.userId, userId), isNull(foodsTable.userId));

/** How a write lands: the revision to store and whether the row is soft-deleted. */
export type WriteState = { revision: number; deleted: boolean };

function toLabel(row: LabelRow): Label {
  const values: Nutrients = {};
  for (const k of nutrientKeys) {
    const v = row[k];
    if (v !== null) values[k] = v;
  }
  return {
    from: row.effectiveFrom,
    per: row.per,
    ...opt("servingSize", row.servingSize),
    ...opt("servingName", row.servingName),
    ...(row.servingPiecesCount !== null && row.servingPiecesName !== null
      ? { servingPieces: { count: row.servingPiecesCount, name: row.servingPiecesName } }
      : {}),
    values,
    source: row.source,
  };
}

function toPortion(row: { foodId: string; amountValue: number | null; amountUnit: string | null; base?: number | null }): Portion {
  return { foodId: row.foodId, amount: toAmount(row.amountValue, row.amountUnit), ...opt("base", row.base) };
}

export function toBatch(row: BatchRow, ingredients: IngredientRow[]): StoredBatch {
  const y = row.yieldGrams !== null ? { yield: { grams: row.yieldGrams } } : row.yieldPortions !== null ? { yield: { portions: row.yieldPortions } } : {};
  return {
    id: row.id,
    madeOn: row.madeOn,
    ingredients: ingredients.map(toPortion),
    ...y,
    gone: row.gone,
    revision: row.revision,
    deleted: row.deletedAt !== null,
  };
}

/** Loads whole aggregates: labels and servings, combo parts, and every batch with its ingredients. */
export async function loadFoods(ex: Executor, where: SQL | undefined): Promise<Food[]> {
  const rows = await ex.select().from(foodsTable).where(where).orderBy(asc(foodsTable.createdAt), asc(foodsTable.id));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const labels = await ex.select().from(labelsTable).where(inArray(labelsTable.foodId, ids)).orderBy(asc(labelsTable.effectiveFrom));
  const servings = await ex.select().from(servingsTable).where(inArray(servingsTable.foodId, ids)).orderBy(asc(servingsTable.position));
  const parts = await ex.select().from(comboPartsTable).where(inArray(comboPartsTable.comboId, ids)).orderBy(asc(comboPartsTable.position));
  const batches = await ex
    .select()
    .from(batchesTable)
    .where(inArray(batchesTable.recipeId, ids))
    .orderBy(asc(batchesTable.madeOn), asc(batchesTable.createdAt), asc(batchesTable.id));
  const ingredients = batches.length
    ? await ex
        .select()
        .from(batchIngredientsTable)
        .where(
          inArray(
            batchIngredientsTable.batchId,
            batches.map((b) => b.id),
          ),
        )
        .orderBy(asc(batchIngredientsTable.position))
    : [];

  const labelsBy = Map.groupBy(labels, (l) => l.foodId);
  const servingsBy = Map.groupBy(servings, (s) => s.foodId);
  const partsBy = Map.groupBy(parts, (p) => p.comboId);
  const batchesBy = Map.groupBy(batches, (b) => b.recipeId);
  const ingredientsBy = Map.groupBy(ingredients, (i) => i.batchId);
  return rows.map((row) => toFood(row, {
    labels: labelsBy.get(row.id) ?? [],
    servings: servingsBy.get(row.id) ?? [],
    parts: partsBy.get(row.id) ?? [],
    batches: (batchesBy.get(row.id) ?? []).map((b) => toBatch(b, ingredientsBy.get(b.id) ?? [])),
  }));
}

function toFood(
  row: FoodRow,
  children: { labels: LabelRow[]; servings: (typeof servingsTable.$inferSelect)[]; parts: (typeof comboPartsTable.$inferSelect)[]; batches: StoredBatch[] },
): Food {
  const common = {
    id: row.id,
    name: row.name,
    icon: row.icon,
    iconAuto: row.iconAuto,
    catalogued: row.catalogued,
    ...opt("originId", row.originId),
    revision: row.revision,
    deleted: row.deletedAt !== null,
    public: row.userId === null,
    starter: row.starter,
  };
  if (row.kind === "recipe") return { ...common, kind: "recipe", batches: children.batches };
  if (row.kind === "combo") return { ...common, kind: "combo", parts: children.parts.map((p) => ({ foodId: p.foodId, amount: toAmount(p.amountValue, p.amountUnit) })) };
  return {
    ...common,
    kind: "item",
    unit: row.unit!,
    ...opt("variant", row.variant),
    ...opt("barcode", row.barcode),
    notFluid: row.notFluid,
    unsure: row.unsure,
    labels: children.labels.map(toLabel),
    servings: children.servings.map((s) => ({ name: s.name, ...opt("size", s.size) })),
  };
}

export async function loadFood(ex: Executor, id: string): Promise<Food | undefined> {
  const [food] = await loadFoods(ex, eq(foodsTable.id, id));
  return food;
}

export async function lockFood(ex: Executor, id: string): Promise<FoodRow | undefined> {
  const [row] = await ex.select().from(foodsTable).where(eq(foodsTable.id, id)).for("update");
  return row;
}

export function foodRefRows(ex: Executor, ids: string[]) {
  if (!ids.length) return Promise.resolve([]);
  return ex
    .select({ id: foodsTable.id, userId: foodsTable.userId, kind: foodsTable.kind, deletedAt: foodsTable.deletedAt })
    .from(foodsTable)
    .where(inArray(foodsTable.id, ids));
}

function foodValues(input: FoodInput) {
  const common = {
    kind: input.kind,
    catalogued: input.catalogued,
    name: input.name,
    icon: input.icon,
    iconAuto: input.iconAuto,
    originId: input.originId ?? null,
  };
  if (input.kind !== "item") return { ...common, unit: null, variant: null, barcode: null, notFluid: false, unsure: false };
  return {
    ...common,
    unit: input.unit,
    variant: input.variant || null,
    barcode: input.barcode ?? null,
    notFluid: input.notFluid,
    unsure: input.unsure,
  };
}

const deletedAtFor = (deleted: boolean) => (deleted ? sql`coalesce(${foodsTable.deletedAt}, now())` : null);

export async function insertFood(
  ex: Executor,
  owner: { userId: string | null; publicKey?: string; starter?: boolean },
  input: FoodInput,
  state: WriteState = { revision: 1, deleted: false },
) {
  await ex.insert(foodsTable).values({
    id: input.id,
    userId: owner.userId,
    publicKey: owner.publicKey ?? null,
    starter: owner.starter ?? false,
    ...foodValues(input),
    revision: state.revision,
    deletedAt: state.deleted ? new Date() : null,
  });
  await writeChildren(ex, input);
}

/** Replaces the food and its labels, servings or parts; a recipe's batches are saved on their own. */
export async function updateFood(ex: Executor, input: FoodInput, state: WriteState, extra: { starter?: boolean } = {}) {
  await ex
    .update(foodsTable)
    .set({ ...foodValues(input), ...extra, revision: state.revision, deletedAt: deletedAtFor(state.deleted), updatedAt: new Date() })
    .where(eq(foodsTable.id, input.id));
  await ex.delete(labelsTable).where(eq(labelsTable.foodId, input.id));
  await ex.delete(servingsTable).where(eq(servingsTable.foodId, input.id));
  await ex.delete(comboPartsTable).where(eq(comboPartsTable.comboId, input.id));
  await writeChildren(ex, input);
}

async function writeChildren(ex: Executor, input: FoodInput) {
  if (input.kind === "item") {
    if (input.labels.length) await ex.insert(labelsTable).values(input.labels.map((l) => labelValues(input.id, l)));
    if (input.servings.length)
      await ex.insert(servingsTable).values(input.servings.map((s, position) => ({ foodId: input.id, name: s.name, size: s.size ?? null, position })));
  }
  if (input.kind === "combo" && input.parts.length) {
    await ex.insert(comboPartsTable).values(
      input.parts.map((p, position) => ({
        comboId: input.id,
        foodId: p.foodId,
        amountValue: p.amount.value ?? null,
        amountUnit: p.amount.unit ?? null,
        position,
      })),
    );
  }
}

function labelValues(foodId: string, l: Label) {
  const nutrients = Object.fromEntries(nutrientKeys.map((k) => [k, l.values[k] ?? null])) as Record<(typeof nutrientKeys)[number], number | null>;
  return {
    foodId,
    effectiveFrom: l.from,
    per: l.per,
    servingSize: l.servingSize ?? null,
    servingName: l.servingName ?? null,
    servingPiecesCount: l.servingPieces?.count ?? null,
    servingPiecesName: l.servingPieces?.name ?? null,
    source: l.source,
    ...nutrients,
  };
}

export async function setFoodDeleted(ex: Executor, id: string, deleted: boolean, revision: number) {
  await ex
    .update(foodsTable)
    .set({ deletedAt: deletedAtFor(deleted), revision, updatedAt: new Date() })
    .where(eq(foodsTable.id, id));
}

/** Moves the catalogue's ETag, for changes that live outside the foods row, such as a batch. */
export async function touchFood(ex: Executor, id: string) {
  await ex.update(foodsTable).set({ updatedAt: new Date() }).where(eq(foodsTable.id, id));
}

export async function hardDeleteFood(ex: Executor, id: string) {
  await ex.delete(foodsTable).where(eq(foodsTable.id, id));
}

export async function catalogueVersion(ex: Executor, userId: string) {
  const [row] = await ex
    .select({ count: sql<number>`count(*)::int`, latest: sql<string | null>`max(${foodsTable.updatedAt})::text` })
    .from(foodsTable)
    .where(visibleTo(userId));
  return row!;
}

export type BatchRef = { recipeId: string; batch: StoredBatch };

export async function loadBatch(ex: Executor, id: string, opts: { lock?: boolean } = {}): Promise<BatchRef | undefined> {
  const query = ex.select().from(batchesTable).where(eq(batchesTable.id, id));
  const [row] = opts.lock ? await query.for("update") : await query;
  if (!row) return undefined;
  const ingredients = await ex.select().from(batchIngredientsTable).where(eq(batchIngredientsTable.batchId, id)).orderBy(asc(batchIngredientsTable.position));
  return { recipeId: row.recipeId, batch: toBatch(row, ingredients) };
}

export function batchRefRows(ex: Executor, ids: string[]) {
  if (!ids.length) return Promise.resolve([]);
  return ex
    .select({ id: batchesTable.id, recipeId: batchesTable.recipeId, deletedAt: batchesTable.deletedAt })
    .from(batchesTable)
    .where(inArray(batchesTable.id, ids));
}

function batchValues(batch: Batch) {
  return {
    madeOn: batch.madeOn,
    yieldGrams: batch.yield && "grams" in batch.yield ? batch.yield.grams : null,
    yieldPortions: batch.yield && "portions" in batch.yield ? batch.yield.portions : null,
    gone: batch.gone,
  };
}

export async function insertBatch(ex: Executor, recipeId: string, batch: Batch, state: WriteState = { revision: 1, deleted: false }) {
  await ex.insert(batchesTable).values({
    id: batch.id,
    recipeId,
    ...batchValues(batch),
    revision: state.revision,
    deletedAt: state.deleted ? new Date() : null,
  });
  await writeIngredients(ex, batch);
  await touchFood(ex, recipeId);
}

export async function updateBatch(ex: Executor, recipeId: string, batch: Batch, state: WriteState) {
  await ex
    .update(batchesTable)
    .set({ ...batchValues(batch), revision: state.revision, deletedAt: state.deleted ? sql`coalesce(${batchesTable.deletedAt}, now())` : null })
    .where(and(eq(batchesTable.id, batch.id), eq(batchesTable.recipeId, recipeId)));
  await ex.delete(batchIngredientsTable).where(eq(batchIngredientsTable.batchId, batch.id));
  await writeIngredients(ex, batch);
  await touchFood(ex, recipeId);
}

async function writeIngredients(ex: Executor, batch: Batch) {
  if (!batch.ingredients.length) return;
  await ex.insert(batchIngredientsTable).values(
    batch.ingredients.map((p, position) => ({
      batchId: batch.id,
      foodId: p.foodId,
      amountValue: p.amount.value ?? null,
      amountUnit: p.amount.unit ?? null,
      base: p.base ?? null,
      position,
    })),
  );
}

export async function hardDeleteBatch(ex: Executor, recipeId: string, id: string) {
  await ex.delete(batchesTable).where(eq(batchesTable.id, id));
  await touchFood(ex, recipeId);
}

/** Batches whose ingredients include the food, with their recipe. */
export async function batchIdsUsing(ex: Executor, foodId: string) {
  const rows = await ex
    .selectDistinct({ id: batchIngredientsTable.batchId })
    .from(batchIngredientsTable)
    .where(eq(batchIngredientsTable.foodId, foodId));
  return rows.map((r) => r.id);
}

export async function comboIdsUsing(ex: Executor, foodId: string) {
  const rows = await ex.selectDistinct({ id: comboPartsTable.comboId }).from(comboPartsTable).where(eq(comboPartsTable.foodId, foodId));
  return rows.map((r) => r.id);
}
