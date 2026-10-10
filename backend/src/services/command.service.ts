import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  comboAsLines,
  currentBatch,
  lookupOf,
  withBase,
  type Amount,
  type Combo,
  type ComboInput,
  type Entry,
  type Food,
  type FoodInput,
  type FoodItem,
  type Line,
  type Portion,
  type Recipe,
} from "@dash/core";
import { entriesTable, foodsTable } from "../db/schema";
import type { Tx } from "../providers/db";
import { lineOwners, loadEntries, updateEntry, usingFoods, withLines } from "../repositories/entry.repo";
import {
  batchIdsUsing,
  comboIdsUsing,
  loadBatch,
  loadFood,
  loadFoods,
  lockFood,
  setFoodDeleted,
  updateBatch,
  updateFood,
} from "../repositories/food.repo";
import { notFound, unprocessable, visible, writable } from "./common";
import { createFoodRow, createNewFoods } from "./food.service";
import { runWrite, type UndoRecorder } from "./write";

/** Every food and entry a command changed, in their new state. */
async function changed(tx: Tx, undo: UndoRecorder): Promise<{ foods: Food[]; entries: Entry[] }> {
  const foodIds = undo.touchedFoodIds();
  const entryIds = undo.touchedEntryIds();
  return {
    foods: foodIds.length ? await loadFoods(tx, inArray(foodsTable.id, foodIds)) : [],
    entries: entryIds.length ? await loadEntries(tx, inArray(entriesTable.id, entryIds)) : [],
  };
}

const scaled = (amount: Amount, times: number): Amount => (amount.value === undefined ? { ...amount } : { ...amount, value: amount.value * times });

/** A line of the merged item, now pointing at what it really was; "1 bowl" of a recipe in portions becomes 1 portion. */
function moveLine(l: Line, source: FoodItem, target: FoodItem | Recipe): Line {
  const rawName = l.rawName ?? source.name;
  const { batchId: _, base: __, ...rest } = l;
  if (target.kind === "item") return withBase({ ...rest, foodId: target.id, rawName }, target);
  const batch = currentBatch(target);
  const inPortions = batch?.yield && "portions" in batch.yield;
  const unit = l.amount.unit === "g" || l.amount.unit === "portion" ? l.amount.unit : inPortions ? "portion" : l.amount.unit;
  return { ...rest, foodId: target.id, ...(batch ? { batchId: batch.id } : {}), rawName, amount: { ...l.amount, ...(unit ? { unit } : {}) } };
}

/**
 * Moves everything that uses the item over to the target, then soft-deletes the item. Into a
 * combo, each use expands into the combo's parts, scaled by the amount that was logged.
 */
async function mergeItem(tx: Tx, userId: string, undo: UndoRecorder, source: FoodItem, target: Food) {
  const lookup = lookupOf(await loadFoods(tx, inArray(foodsTable.id, partFoodIds(target))));
  const find = (id: string | undefined) => (id === target.id ? target : lookup(id));
  if (target.kind === "combo" && target.parts.some((p) => p.foodId === source.id)) throw unprocessable("The combo contains the item being merged");

  const entries = await loadEntries(tx, and(eq(entriesTable.userId, userId), usingFoods([source.id])));
  for (const entry of entries) {
    if (entry.kind !== "food") continue;
    await undo.entry(entry.id);
    const lines =
      target.kind === "combo"
        ? entry.lines.flatMap((l) => (l.foodId === source.id ? comboAsLines(target, l.amount.value ?? 1, find, randomUUID) : [l]))
        : entry.lines.map((l) => (l.foodId === source.id ? moveLine(l, source, target) : l));
    const comboId = target.kind === "combo" && entry.lines.length === 1 ? target.id : entry.comboId;
    await updateEntry(tx, { ...entry, lines, ...(comboId ? { comboId } : {}) }, { revision: entry.revision + 1, deleted: entry.deleted });
  }

  for (const batchId of await batchIdsUsing(tx, source.id)) {
    const ref = (await loadBatch(tx, batchId, { lock: true }))!;
    await undo.batch(batchId, ref.recipeId);
    const ingredients = ref.batch.ingredients.flatMap((p): Portion[] => {
      if (p.foodId !== source.id) return [p];
      if (target.kind === "item") return [withBase({ ...p, foodId: target.id }, target)];
      if (target.kind === "recipe") throw unprocessable("A recipe can't be an ingredient, and the item is one");
      return target.parts.map((part) => {
        const item = find(part.foodId);
        if (item?.kind !== "item") throw unprocessable("The combo has a recipe in it, and the item is an ingredient");
        return withBase({ foodId: item.id, amount: scaled(part.amount, p.amount.value ?? 1) }, item);
      });
    });
    await updateBatch(tx, ref.recipeId, { ...ref.batch, ingredients }, { revision: ref.batch.revision + 1, deleted: ref.batch.deleted });
  }

  for (const comboId of await comboIdsUsing(tx, source.id)) {
    const combo = (await loadFood(tx, comboId)) as Combo;
    await undo.food(comboId);
    const parts = combo.parts.flatMap((p) => {
      if (p.foodId !== source.id) return [p];
      if (target.kind !== "combo") return [{ foodId: target.id, amount: p.amount }];
      return target.parts.map((part) => ({ foodId: part.foodId, amount: scaled(part.amount, p.amount.value ?? 1) }));
    });
    await updateFood(tx, { ...combo, parts }, { revision: combo.revision + 1, deleted: combo.deleted });
  }

  // A scanned barcode is the one useful thing the merged item knew that the target may not.
  if (target.kind === "item" && !target.public && source.barcode && !target.barcode) {
    await undo.food(target.id);
    await updateFood(tx, { ...target, barcode: source.barcode }, { revision: target.revision + 1, deleted: target.deleted });
  }

  await undo.food(source.id);
  await setFoodDeleted(tx, source.id, true, source.revision + 1);
}

const partFoodIds = (target: Food) => (target.kind === "combo" ? target.parts.map((p) => p.foodId) : []);

async function lockSourceItem(tx: Tx, userId: string, id: string) {
  const row = writable(await lockFood(tx, id), userId);
  if (row.kind !== "item") throw unprocessable("Only items can be merged into something else");
  if (row.deletedAt) throw unprocessable("The item is already deleted");
  return (await loadFood(tx, id)) as FoodItem;
}

export async function merge(userId: string, sourceId: string, targetId: string, preview: boolean) {
  if (sourceId === targetId) throw unprocessable("An item can't be merged into itself");
  const out = await runWrite(userId, { preview, undo: true }, async (tx, undo) => {
    const source = await lockSourceItem(tx, userId, sourceId);
    const targetRow = visible(await lockFood(tx, targetId), userId);
    if (targetRow.deletedAt) throw unprocessable("The target is deleted");
    await mergeItem(tx, userId, undo, source, (await loadFood(tx, targetId))!);
    return changed(tx, undo);
  });
  return commandResult(out);
}

/** The unsure item was things had together: the combo is created and the item merged into it. */
export async function completeAsCombo(userId: string, sourceId: string, req: { combo: ComboInput; newFoods?: FoodInput[] | undefined }, preview: boolean) {
  const out = await runWrite(userId, { preview, undo: true }, async (tx, undo) => {
    const source = await lockSourceItem(tx, userId, sourceId);
    await createNewFoods(tx, userId, req.newFoods, undo);
    await createFoodRow(tx, userId, req.combo, undo);
    const combo = visible(await lockFood(tx, req.combo.id), userId);
    if (combo.kind !== "combo") throw unprocessable("The id belongs to a food that isn't a combo");
    await mergeItem(tx, userId, undo, source, (await loadFood(tx, req.combo.id))!);
    return changed(tx, undo);
  });
  return commandResult(out);
}

/** Lines picked by id, with their entries; every line must be the person's. */
async function entriesWithLines(tx: Tx, userId: string, lineIds: string[]) {
  const owners = await lineOwners(tx, lineIds);
  if (owners.length !== new Set(lineIds).size || owners.some((o) => o.userId !== userId)) throw notFound();
  const entries = await loadEntries(tx, withLines(lineIds));
  for (const e of entries) await tx.select().from(entriesTable).where(eq(entriesTable.id, e.id)).for("update");
  return entries;
}

/** Recomputes base on the chosen lines from their item's current servings. */
export async function reconvert(userId: string, lineIds: string[], preview: boolean) {
  const out = await runWrite(userId, { preview, undo: true }, async (tx, undo) => {
    const entries = await entriesWithLines(tx, userId, lineIds);
    const chosen = new Set(lineIds);
    const foodIds = entries.flatMap((e) => (e.kind === "food" ? e.lines.filter((l) => chosen.has(l.id)).map((l) => l.foodId) : []));
    const lookup = lookupOf(await loadFoods(tx, inArray(foodsTable.id, foodIds.filter((id): id is string => !!id))));
    for (const e of entries) {
      if (e.kind !== "food") continue;
      await undo.entry(e.id);
      const lines = e.lines.map((l) => {
        const item = lookup(l.foodId);
        return chosen.has(l.id) && item?.kind === "item" ? withBase(l, item) : l;
      });
      await updateEntry(tx, { ...e, lines }, { revision: e.revision + 1, deleted: e.deleted });
    }
    return changed(tx, undo);
  });
  return commandResult(out);
}

/** Points the chosen recipe lines at another batch of the same recipe. */
export async function moveToBatch(userId: string, lineIds: string[], batchId: string, preview: boolean) {
  const out = await runWrite(userId, { preview, undo: true }, async (tx, undo) => {
    const ref = await loadBatch(tx, batchId);
    if (!ref) throw notFound();
    writable(await lockFood(tx, ref.recipeId), userId);
    if (ref.batch.deleted) throw unprocessable("The batch is deleted");
    const entries = await entriesWithLines(tx, userId, lineIds);
    const chosen = new Set(lineIds);
    for (const e of entries) {
      if (e.kind !== "food") continue;
      if (e.lines.some((l) => chosen.has(l.id) && l.foodId !== ref.recipeId)) throw unprocessable("A chosen line isn't of the batch's recipe");
      await undo.entry(e.id);
      const lines = e.lines.map((l) => (chosen.has(l.id) ? { ...l, batchId } : l));
      await updateEntry(tx, { ...e, lines }, { revision: e.revision + 1, deleted: e.deleted });
    }
    return changed(tx, undo);
  });
  return commandResult(out);
}

function commandResult(out: Awaited<ReturnType<typeof runWrite<{ foods: Food[]; entries: Entry[] }>>>) {
  if (out.kind === "preview") return out;
  return { kind: "done" as const, result: { ...out.result, ...out.undo! } };
}

