import type { EntryInput, FoodInput, StoredBatch } from "@dash/core";
import { activityRefRows } from "../repositories/activity.repo";
import { batchRefRows, foodRefRows } from "../repositories/food.repo";
import type { Executor } from "../providers/db";
import { unprocessable } from "./common";

type FoodKind = "item" | "recipe" | "combo";

export type FoodRef = { id: string; kinds: readonly FoodKind[]; field: string };

/**
 * Every referenced row must be the person's or public, of the right kind, and live. A deleted row
 * stays referable where the saved version already pointed at it, so old entries remain editable.
 */
export async function checkFoodRefs(ex: Executor, userId: string, refs: FoodRef[], alreadyReferenced: ReadonlySet<string> = new Set()) {
  if (!refs.length) return;
  const rows = new Map((await foodRefRows(ex, [...new Set(refs.map((r) => r.id))])).map((r) => [r.id, r]));
  for (const ref of refs) {
    const row = rows.get(ref.id);
    if (!row || (row.userId !== null && row.userId !== userId)) throw unprocessable("Refers to a food that doesn't exist", { field: ref.field, id: ref.id });
    if (!ref.kinds.includes(row.kind)) throw unprocessable(`Must refer to ${ref.kinds.join(" or ")}, not ${row.kind}`, { field: ref.field, id: ref.id });
    if (row.deletedAt && !alreadyReferenced.has(ref.id)) throw unprocessable("Refers to a deleted food", { field: ref.field, id: ref.id });
  }
}

export async function checkActivityRef(ex: Executor, userId: string, id: string, alreadyReferenced: boolean) {
  const [row] = await activityRefRows(ex, [id]);
  if (!row || (row.userId !== null && row.userId !== userId)) throw unprocessable("Refers to an activity that doesn't exist", { field: "activityId", id });
  if (row.deletedAt && !alreadyReferenced) throw unprocessable("Refers to a deleted activity", { field: "activityId", id });
}

/** A line's batch must be a batch of the line's recipe. */
export async function checkBatchRefs(ex: Executor, refs: { batchId: string; recipeId: string | undefined; field: string }[], alreadyReferenced: ReadonlySet<string>) {
  if (!refs.length) return;
  const rows = new Map((await batchRefRows(ex, refs.map((r) => r.batchId))).map((r) => [r.id, r]));
  for (const ref of refs) {
    const row = rows.get(ref.batchId);
    if (!row || row.recipeId !== ref.recipeId) throw unprocessable("Refers to a batch of another recipe, or none", { field: ref.field, id: ref.batchId });
    if (row.deletedAt && !alreadyReferenced.has(ref.batchId)) throw unprocessable("Refers to a deleted batch", { field: ref.field, id: ref.batchId });
  }
}

export function foodInputRefs(input: FoodInput): FoodRef[] {
  const refs: FoodRef[] = input.originId ? [{ id: input.originId, kinds: ["item", "recipe", "combo"], field: "originId" }] : [];
  if (input.kind === "combo") input.parts.forEach((p, i) => refs.push({ id: p.foodId, kinds: ["item", "recipe"], field: `parts.${i}.foodId` }));
  return refs;
}

export function foodDocRefIds(food: FoodInput | undefined): Set<string> {
  return new Set(food ? foodInputRefs(food).map((r) => r.id) : []);
}

export const batchInputRefs = (batch: Pick<StoredBatch, "ingredients">): FoodRef[] =>
  batch.ingredients.map((p, i) => ({ id: p.foodId, kinds: ["item"], field: `ingredients.${i}.foodId` }));

export function entryFoodRefs(input: EntryInput): FoodRef[] {
  if (input.kind !== "food") return [];
  const refs: FoodRef[] = input.comboId ? [{ id: input.comboId, kinds: ["combo"], field: "comboId" }] : [];
  input.lines.forEach((l, i) => {
    if (l.foodId) refs.push({ id: l.foodId, kinds: ["item", "recipe"], field: `lines.${i}.foodId` });
  });
  return refs;
}

export function entryBatchRefs(input: EntryInput) {
  if (input.kind !== "food") return [];
  return input.lines.flatMap((l, i) => (l.batchId ? [{ batchId: l.batchId, recipeId: l.foodId, field: `lines.${i}.batchId` }] : []));
}

/** Ids an entry already points at, so a deleted food, batch or activity in it stays referable. */
export function entryRefIds(entry: EntryInput | undefined): Set<string> {
  if (!entry) return new Set();
  if (entry.kind === "exercise") return new Set([entry.activityId]);
  return new Set([...(entry.comboId ? [entry.comboId] : []), ...entry.lines.flatMap((l) => [l.foodId, l.batchId].filter((x): x is string => !!x))]);
}

