import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { codecs } from "@danielsharp/redis";
import { dayTotals, deepEqual, lookupOf, type Entry, type Food, type Preview, type StoredBatch } from "@dash/core";
import { entriesTable } from "../db/schema";
import { db, type Tx } from "../providers/db";
import { redis } from "../providers/redis";
import { loadEntries, loadEntry } from "../repositories/entry.repo";
import { loadBatch, loadFood, loadFoods, visibleTo } from "../repositories/food.repo";

export const UNDO_TTL_MS = 15 * 60 * 1000;

/** Foods are kept without their batches, which undo tracks as units of their own. */
export type UndoUnit =
  | { kind: "food"; id: string; before: Food | null; revisionAfter: number }
  | { kind: "batch"; id: string; recipeId: string; before: StoredBatch | null; revisionAfter: number }
  | { kind: "entry"; id: string; before: Entry | null; revisionAfter: number };

export type UndoRecord = { units: UndoUnit[] };
type PendingUnit = UndoUnit extends infer U ? (U extends UndoUnit ? Omit<U, "revisionAfter"> : never) : never;

export const undoKey = (userId: string, token: string) => `undo:${userId}:${token}`;

const withoutBatches = (f: Food): Food => (f.kind === "recipe" ? { ...f, batches: [] } : f);

/**
 * Collects a before-image of every row a write touches. Capture before changing a row; mark a
 * row created when the write inserted it, so undo removes it.
 */
export class UndoRecorder {
  private readonly units = new Map<string, PendingUnit>();

  constructor(private readonly tx: Tx) {}

  async food(id: string) {
    if (this.units.has(`food:${id}`)) return;
    const before = await loadFood(this.tx, id);
    this.units.set(`food:${id}`, { kind: "food", id, before: before ? withoutBatches(before) : null });
  }

  async batch(id: string, recipeId: string) {
    if (this.units.has(`batch:${id}`)) return;
    const before = await loadBatch(this.tx, id);
    this.units.set(`batch:${id}`, { kind: "batch", id, recipeId, before: before?.batch ?? null });
  }

  async entry(id: string) {
    if (this.units.has(`entry:${id}`)) return;
    this.units.set(`entry:${id}`, { kind: "entry", id, before: (await loadEntry(this.tx, id)) ?? null });
  }

  createdFood(id: string) {
    if (!this.units.has(`food:${id}`)) this.units.set(`food:${id}`, { kind: "food", id, before: null });
  }

  touchedFoodIds() {
    const ids = new Set<string>();
    for (const u of this.units.values()) {
      if (u.kind === "food") ids.add(u.id);
      if (u.kind === "batch") ids.add(u.recipeId);
    }
    return [...ids];
  }

  touchedEntryIds() {
    return [...this.units.values()].filter((u) => u.kind === "entry").map((u) => u.id);
  }

  /** Reads the revision each row was left at, which undo later insists is still current. */
  async finish(): Promise<UndoRecord> {
    const units: UndoUnit[] = [];
    for (const u of this.units.values()) {
      const after = u.kind === "food" ? await loadFood(this.tx, u.id) : u.kind === "batch" ? (await loadBatch(this.tx, u.id))?.batch : await loadEntry(this.tx, u.id);
      units.push({ ...u, revisionAfter: after?.revision ?? 0 } as UndoUnit);
    }
    return { units };
  }
}

class PreviewRollback extends Error {
  constructor(readonly preview: Preview) {
    super("Preview rolled back");
  }
}

type Snapshot = { foods: Food[]; entries: Entry[] };

async function snapshot(tx: Tx, userId: string): Promise<Snapshot> {
  return {
    foods: await loadFoods(tx, visibleTo(userId)),
    entries: await loadEntries(tx, and(eq(entriesTable.userId, userId), isNull(entriesTable.deletedAt))),
  };
}

/** Every day whose entries or totals differ between the two states. */
function previewOf(before: Snapshot, after: Snapshot): Preview {
  const byDate = (entries: Entry[]) => Map.groupBy(entries, (e) => e.when.date);
  const b = byDate(before.entries);
  const a = byDate(after.entries);
  const lookBefore = lookupOf(before.foods);
  const lookAfter = lookupOf(after.foods);
  const dates = [...new Set([...b.keys(), ...a.keys()])].sort();
  const days: Preview["days"] = [];
  for (const date of dates) {
    const eb = b.get(date) ?? [];
    const ea = a.get(date) ?? [];
    const tb = dayTotals(eb, lookBefore);
    const ta = dayTotals(ea, lookAfter);
    if (!deepEqual(tb, ta) || !deepEqual(eb, ea)) days.push({ date, before: tb, after: ta });
  }
  return { days };
}

export type WriteResult<T> =
  | { kind: "preview"; preview: Preview }
  | { kind: "done"; result: T; undo?: { undoToken: string; undoExpiresAt: string } };

/**
 * Runs a write in one transaction. A preview runs it fully, measures every affected day before
 * and after, and rolls back. Otherwise the before-images go to Redis under an undo token once
 * the transaction has committed.
 */
export async function runWrite<T>(
  userId: string,
  opts: { preview?: boolean; undo?: boolean },
  write: (tx: Tx, undo: UndoRecorder) => Promise<T>,
): Promise<WriteResult<T>> {
  let record: UndoRecord | undefined;
  let result: T;
  try {
    result = await db.transaction(async (tx) => {
      const before = opts.preview ? await snapshot(tx, userId) : undefined;
      const recorder = new UndoRecorder(tx);
      const out = await write(tx, recorder);
      if (before) throw new PreviewRollback(previewOf(before, await snapshot(tx, userId)));
      if (opts.undo) record = await recorder.finish();
      return out;
    });
  } catch (error) {
    if (error instanceof PreviewRollback) return { kind: "preview", preview: error.preview };
    throw error;
  }
  if (!record) return { kind: "done", result };
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + UNDO_TTL_MS);
  await redis.set(undoKey(userId, token), record, codecs.json<UndoRecord>(), { expiration: { type: "PX", value: UNDO_TTL_MS } });
  return { kind: "done", result, undo: { undoToken: token, undoExpiresAt: expiresAt.toISOString() } };
}
