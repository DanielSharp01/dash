import { asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Activity, ActivityInput, Burn } from "@dash/core";
import { activitiesTable } from "../db/schema";
import type { Executor } from "../providers/db";
import type { WriteState } from "./food.repo";
import { opt } from "./mapping";

export type ActivityRow = typeof activitiesTable.$inferSelect;

export const activitiesVisibleTo = (userId: string) => or(eq(activitiesTable.userId, userId), isNull(activitiesTable.userId));

function toBurn(row: ActivityRow): Burn | undefined {
  const f = row.burnFactor;
  if (f === null) return undefined;
  switch (row.burnBasis) {
    case "distance":
      return { basis: "distance", kcalPerKgKm: f };
    case "reps":
      return { basis: "reps", kcalPerKgRep: f };
    case "duration":
      return { basis: "duration", met: f };
    default:
      return undefined;
  }
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    iconAuto: row.iconAuto,
    measures: row.measures,
    ...opt("burn", toBurn(row)),
    ...opt("originId", row.originId),
    revision: row.revision,
    deleted: row.deletedAt !== null,
    public: row.userId === null,
    starter: row.starter,
  };
}

export async function loadActivities(ex: Executor, where: SQL | undefined) {
  const rows = await ex.select().from(activitiesTable).where(where).orderBy(asc(activitiesTable.createdAt), asc(activitiesTable.id));
  return rows.map(toActivity);
}

export async function loadActivity(ex: Executor, id: string) {
  const [a] = await loadActivities(ex, eq(activitiesTable.id, id));
  return a;
}

export async function lockActivity(ex: Executor, id: string): Promise<ActivityRow | undefined> {
  const [row] = await ex.select().from(activitiesTable).where(eq(activitiesTable.id, id)).for("update");
  return row;
}

export function activityRefRows(ex: Executor, ids: string[]) {
  if (!ids.length) return Promise.resolve([]);
  return ex
    .select({ id: activitiesTable.id, userId: activitiesTable.userId, deletedAt: activitiesTable.deletedAt })
    .from(activitiesTable)
    .where(inArray(activitiesTable.id, ids));
}

function activityValues(input: ActivityInput) {
  const b = input.burn;
  return {
    name: input.name,
    icon: input.icon,
    iconAuto: input.iconAuto,
    measures: input.measures,
    burnBasis: b?.basis ?? null,
    burnFactor: !b ? null : b.basis === "distance" ? b.kcalPerKgKm : b.basis === "reps" ? b.kcalPerKgRep : b.met,
    originId: input.originId ?? null,
  };
}

export async function insertActivity(
  ex: Executor,
  owner: { userId: string | null; publicKey?: string; starter?: boolean },
  input: ActivityInput,
  state: WriteState = { revision: 1, deleted: false },
) {
  await ex.insert(activitiesTable).values({
    id: input.id,
    userId: owner.userId,
    publicKey: owner.publicKey ?? null,
    starter: owner.starter ?? false,
    ...activityValues(input),
    revision: state.revision,
    deletedAt: state.deleted ? new Date() : null,
  });
}

export async function updateActivity(ex: Executor, input: ActivityInput, state: WriteState, extra: { starter?: boolean } = {}) {
  await ex
    .update(activitiesTable)
    .set({
      ...activityValues(input),
      ...extra,
      revision: state.revision,
      deletedAt: state.deleted ? sql`coalesce(${activitiesTable.deletedAt}, now())` : null,
      updatedAt: new Date(),
    })
    .where(eq(activitiesTable.id, input.id));
}

export async function setActivityDeleted(ex: Executor, id: string, deleted: boolean, revision: number) {
  await ex
    .update(activitiesTable)
    .set({ deletedAt: deleted ? sql`coalesce(${activitiesTable.deletedAt}, now())` : null, revision, updatedAt: new Date() })
    .where(eq(activitiesTable.id, id));
}

export async function activitiesVersion(ex: Executor, userId: string) {
  const [row] = await ex
    .select({ count: sql<number>`count(*)::int`, latest: sql<string | null>`max(${activitiesTable.updatedAt})::text` })
    .from(activitiesTable)
    .where(activitiesVisibleTo(userId));
  return row!;
}
