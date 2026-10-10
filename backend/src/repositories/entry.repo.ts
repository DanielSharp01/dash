import { asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Entry, EntryInput, Line, MeasureKey, When } from "@dash/core";
import { entriesTable, entryLinesTable, exerciseMeasuresTable } from "../db/schema";
import type { Executor } from "../providers/db";
import type { WriteState } from "./food.repo";
import { iso, opt, toAmount } from "./mapping";

export type EntryRow = typeof entriesTable.$inferSelect;
type LineRow = typeof entryLinesTable.$inferSelect;
type MeasureRow = typeof exerciseMeasuresTable.$inferSelect;

function toWhen(row: EntryRow): When {
  const date = row.whenDate;
  switch (row.whenKind) {
    case "part":
      return { date, kind: "part", part: row.whenPart! };
    case "day":
      return { date, kind: "day" };
    default:
      // Postgres returns time as HH:MM:SS; the API speaks HH:MM.
      return { date, kind: row.whenKind, time: row.whenTime!.slice(0, 5) };
  }
}

function toLine(row: LineRow): Line {
  return {
    id: row.id,
    ...opt("foodId", row.foodId),
    ...opt("batchId", row.batchId),
    ...opt("rawName", row.rawName),
    ...opt("barcode", row.barcode),
    amount: toAmount(row.amountValue, row.amountUnit),
    ...opt("base", row.base),
  };
}

function toEntry(row: EntryRow, lines: LineRow[], measures: MeasureRow[]): Entry {
  const stored = { revision: row.revision, deleted: row.deletedAt !== null, createdAt: iso(row.createdAt) };
  if (row.kind === "food") {
    return { id: row.id, kind: "food", when: toWhen(row), via: row.via!, ...opt("comboId", row.comboId), lines: lines.map(toLine), ...stored };
  }
  return {
    id: row.id,
    kind: "exercise",
    when: toWhen(row),
    activityId: row.activityId!,
    measures: Object.fromEntries(measures.map((m) => [m.key, { value: m.value, unit: m.unit }])) as Partial<Record<MeasureKey, { value: number; unit: string }>>,
    ...opt("kcal", row.kcal),
    kcalManual: row.kcalManual,
    ...stored,
  };
}

export async function loadEntries(ex: Executor, where: SQL | undefined): Promise<Entry[]> {
  const rows = await ex
    .select()
    .from(entriesTable)
    .where(where)
    .orderBy(asc(entriesTable.whenDate), asc(entriesTable.createdAt), asc(entriesTable.id));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const lines = await ex.select().from(entryLinesTable).where(inArray(entryLinesTable.entryId, ids)).orderBy(asc(entryLinesTable.position));
  const measures = await ex.select().from(exerciseMeasuresTable).where(inArray(exerciseMeasuresTable.entryId, ids));
  const linesBy = Map.groupBy(lines, (l) => l.entryId);
  const measuresBy = Map.groupBy(measures, (m) => m.entryId);
  return rows.map((r) => toEntry(r, linesBy.get(r.id) ?? [], measuresBy.get(r.id) ?? []));
}

export async function loadEntry(ex: Executor, id: string) {
  const [entry] = await loadEntries(ex, eq(entriesTable.id, id));
  return entry;
}

export async function lockEntry(ex: Executor, id: string): Promise<EntryRow | undefined> {
  const [row] = await ex.select().from(entriesTable).where(eq(entriesTable.id, id)).for("update");
  return row;
}

/** Entries with a line pointing at any of the foods. */
export const usingFoods = (foodIds: string[]) =>
  sql`${entriesTable.id} in (select ${entryLinesTable.entryId} from ${entryLinesTable} where ${inArray(entryLinesTable.foodId, foodIds)})`;

export const withLines = (lineIds: string[]) =>
  sql`${entriesTable.id} in (select ${entryLinesTable.entryId} from ${entryLinesTable} where ${inArray(entryLinesTable.id, lineIds)})`;

function entryValues(input: EntryInput) {
  const w = input.when;
  const when = {
    whenDate: w.date,
    whenKind: w.kind,
    whenTime: w.kind === "now" || w.kind === "exact" ? w.time : null,
    whenPart: w.kind === "part" ? w.part : null,
  };
  if (input.kind === "food") {
    return {
      ...when,
      kind: input.kind,
      via: input.via,
      comboId: input.comboId ?? null,
      comboKind: input.comboId ? ("combo" as const) : null,
      activityId: null,
      kcal: null,
      kcalManual: false,
    };
  }
  return {
    ...when,
    kind: input.kind,
    via: null,
    comboId: null,
    comboKind: null,
    activityId: input.activityId,
    kcal: input.kcal ?? null,
    kcalManual: input.kcalManual,
  };
}

export async function insertEntry(ex: Executor, userId: string, input: EntryInput, state: WriteState = { revision: 1, deleted: false }, createdAt?: Date) {
  await ex.insert(entriesTable).values({
    id: input.id,
    userId,
    ...entryValues(input),
    revision: state.revision,
    deletedAt: state.deleted ? new Date() : null,
    ...(createdAt ? { createdAt } : {}),
  });
  await writeChildren(ex, input);
}

export async function updateEntry(ex: Executor, input: EntryInput, state: WriteState) {
  await ex
    .update(entriesTable)
    .set({
      ...entryValues(input),
      revision: state.revision,
      deletedAt: state.deleted ? sql`coalesce(${entriesTable.deletedAt}, now())` : null,
      updatedAt: new Date(),
    })
    .where(eq(entriesTable.id, input.id));
  await ex.delete(entryLinesTable).where(eq(entryLinesTable.entryId, input.id));
  await ex.delete(exerciseMeasuresTable).where(eq(exerciseMeasuresTable.entryId, input.id));
  await writeChildren(ex, input);
}

async function writeChildren(ex: Executor, input: EntryInput) {
  if (input.kind === "food" && input.lines.length) {
    await ex.insert(entryLinesTable).values(
      input.lines.map((l, position) => ({
        id: l.id,
        entryId: input.id,
        position,
        foodId: l.foodId ?? null,
        batchId: l.batchId ?? null,
        rawName: l.rawName ?? null,
        barcode: l.barcode ?? null,
        amountValue: l.amount.value ?? null,
        amountUnit: l.amount.unit ?? null,
        base: l.base ?? null,
      })),
    );
  }
  if (input.kind === "exercise") {
    const measures = Object.entries(input.measures).filter((m): m is [MeasureKey, { value: number; unit: string }] => m[1] !== undefined);
    if (measures.length) await ex.insert(exerciseMeasuresTable).values(measures.map(([key, m]) => ({ entryId: input.id, key, value: m.value, unit: m.unit })));
  }
}

export async function setEntryDeleted(ex: Executor, id: string, deleted: boolean, revision: number) {
  await ex
    .update(entriesTable)
    .set({ deletedAt: deleted ? sql`coalesce(${entriesTable.deletedAt}, now())` : null, revision, updatedAt: new Date() })
    .where(eq(entriesTable.id, id));
}

export async function lineOwners(ex: Executor, lineIds: string[]) {
  return ex
    .select({ lineId: entryLinesTable.id, entryId: entriesTable.id, userId: entriesTable.userId, deletedAt: entriesTable.deletedAt })
    .from(entryLinesTable)
    .innerJoin(entriesTable, eq(entriesTable.id, entryLinesTable.entryId))
    .where(inArray(entryLinesTable.id, lineIds));
}
