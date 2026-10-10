import { inArray } from "drizzle-orm";
import { codecs } from "@danielsharp/redis";
import { Conflict, Gone } from "@danielsharp/typeline-http";
import { entriesTable, foodsTable } from "../db/schema";
import { db, type Tx } from "../providers/db";
import { redis } from "../providers/redis";
import { loadEntries, lockEntry, updateEntry } from "../repositories/entry.repo";
import { hardDeleteBatch, hardDeleteFood, loadBatch, loadFoods, lockFood, updateBatch, updateFood } from "../repositories/food.repo";
import { undoKey, type UndoRecord, type UndoUnit } from "./write";

const edited = () => new Conflict({ reason: "Something it changed has been edited since" });

/** The row's current revision, or 0 when it's gone; also refuses rows that aren't the person's. */
async function currentRevision(tx: Tx, userId: string, unit: UndoUnit) {
  if (unit.kind === "entry") {
    const row = await lockEntry(tx, unit.id);
    if (row && row.userId !== userId) throw edited();
    return row?.revision ?? 0;
  }
  if (unit.kind === "batch") {
    const recipe = await lockFood(tx, unit.recipeId);
    if (!recipe || recipe.userId !== userId) throw edited();
    return (await loadBatch(tx, unit.id, { lock: true }))?.batch.revision ?? 0;
  }
  const row = await lockFood(tx, unit.id);
  if (row && row.userId !== userId) throw edited();
  return row?.revision ?? 0;
}

// Entries first, since they point at batches and foods.
const order: Record<UndoUnit["kind"], number> = { entry: 0, batch: 1, food: 2 };

/** Restores the before-image of everything a command or food save touched, if none of it moved on since. */
export async function undo(userId: string, token: string) {
  const key = undoKey(userId, token);
  const record = await redis.get(key, codecs.json<UndoRecord>());
  if (!record) throw new Gone({ reason: "The undo has expired" });

  const result = await db.transaction(async (tx) => {
    const revisions = new Map<UndoUnit, number>();
    for (const unit of record.units) {
      const current = await currentRevision(tx, userId, unit);
      if (current !== unit.revisionAfter) throw edited();
      revisions.set(unit, current);
    }
    const restores = record.units.filter((u) => u.before).sort((a, b) => order[a.kind] - order[b.kind]);
    // Rows the write created go last, newest first, since a later one may point at an earlier one.
    const removals = record.units.filter((u) => !u.before).reverse();
    for (const unit of restores) {
      const revision = revisions.get(unit)! + 1;
      if (unit.kind === "entry") await updateEntry(tx, unit.before!, { revision, deleted: unit.before!.deleted });
      if (unit.kind === "batch") await updateBatch(tx, unit.recipeId, unit.before!, { revision, deleted: unit.before!.deleted });
      if (unit.kind === "food") await updateFood(tx, unit.before!, { revision, deleted: unit.before!.deleted });
    }
    for (const unit of removals) {
      if (unit.kind === "batch") await hardDeleteBatch(tx, unit.recipeId, unit.id);
      if (unit.kind === "food") await hardDeleteFood(tx, unit.id);
    }
    const foodIds = [...new Set(restores.flatMap((u) => (u.kind === "food" ? [u.id] : u.kind === "batch" ? [u.recipeId] : [])))];
    const entryIds = restores.filter((u) => u.kind === "entry").map((u) => u.id);
    return {
      foods: foodIds.length ? await loadFoods(tx, inArray(foodsTable.id, foodIds)) : [],
      entries: entryIds.length ? await loadEntries(tx, inArray(entriesTable.id, entryIds)) : [],
    };
  });
  await redis.del(key);
  return result;
}
