import { and, between, eq, isNull } from "drizzle-orm";
import type { ActivityInput, EntryInput, FoodInput } from "@dash/core";
import { entriesTable } from "../db/schema";
import { db, type Tx } from "../providers/db";
import { insertEntry, loadEntries, loadEntry, lockEntry, setEntryDeleted, updateEntry, usingFoods } from "../repositories/entry.repo";
import { createNewActivities } from "./activity.service";
import { claimId, expectRevision, notFound, sameId, unprocessable } from "./common";
import { createNewFoods } from "./food.service";
import { checkActivityRef, checkBatchRefs, checkFoodRefs, entryBatchRefs, entryFoodRefs, entryRefIds } from "./refs";

type WithNew = { newFoods?: FoodInput[] | undefined; newActivities?: ActivityInput[] | undefined };

export async function listEntries(userId: string, query: { from: string; to: string; foodId?: string | undefined }) {
  const where = and(
    eq(entriesTable.userId, userId),
    isNull(entriesTable.deletedAt),
    between(entriesTable.whenDate, query.from, query.to),
    query.foodId ? usingFoods([query.foodId]) : undefined,
  );
  return { entries: await loadEntries(db, where) };
}

async function checkRefs(tx: Tx, userId: string, input: EntryInput, before?: EntryInput) {
  const already = entryRefIds(before);
  if (input.kind === "exercise") return checkActivityRef(tx, userId, input.activityId, already.has(input.activityId));
  for (const l of input.lines) if (l.batchId && !l.foodId) throw unprocessable("A line with a batch needs its recipe", { id: l.id });
  await checkFoodRefs(tx, userId, entryFoodRefs(input), already);
  await checkBatchRefs(tx, entryBatchRefs(input), already);
}

async function createNew(tx: Tx, userId: string, req: WithNew) {
  const newFoods = await createNewFoods(tx, userId, req.newFoods);
  const newActivities = await createNewActivities(tx, userId, req.newActivities);
  return { newFoods, newActivities };
}

export async function createEntry(userId: string, req: EntryInput & WithNew) {
  return db.transaction(async (tx) => {
    const created = await createNew(tx, userId, req);
    const existing = await lockEntry(tx, req.id);
    const isNew = claimId(existing, userId) === "new";
    if (isNew) {
      await checkRefs(tx, userId, req);
      await insertEntry(tx, userId, req);
    }
    return { isNew, body: { entry: (await loadEntry(tx, req.id))!, ...created } };
  });
}

export async function updateEntryDoc(userId: string, id: string, req: EntryInput & WithNew & { revision: number }) {
  sameId(id, req.id);
  return db.transaction(async (tx) => {
    const row = await lockEntry(tx, id);
    if (!row || row.userId !== userId) throw notFound();
    if (row.kind !== req.kind) throw unprocessable("An entry's kind can't change");
    await expectRevision(row.revision, req.revision, () => loadEntry(tx, id));
    const created = await createNew(tx, userId, req);
    await checkRefs(tx, userId, req, await loadEntry(tx, id));
    await updateEntry(tx, req, { revision: row.revision + 1, deleted: row.deletedAt !== null });
    return { entry: (await loadEntry(tx, id))!, ...created };
  });
}

export async function setEntryDeletedFor(userId: string, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    const row = await lockEntry(tx, id);
    if (!row || row.userId !== userId) throw notFound();
    if ((row.deletedAt !== null) !== deleted) await setEntryDeleted(tx, id, deleted, row.revision + 1);
    return (await loadEntry(tx, id))!;
  });
}
