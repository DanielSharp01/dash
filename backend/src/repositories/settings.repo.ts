import { and, asc, eq, isNull } from "drizzle-orm";
import { BEGINNING, defaultPlan, type Plan, type PlanVersion, type Pot, type Profile, type ProfileInput, type WeighIn } from "@dash/core";
import { planVersionsTable, potsTable, profilesTable, weighInsTable } from "../db/schema";
import type { Executor } from "../providers/db";
import { opt } from "./mapping";

type ProfileRow = typeof profilesTable.$inferSelect;
type PlanRow = typeof planVersionsTable.$inferSelect;

const toProfile = (row: ProfileRow): Profile => ({
  units: row.units,
  ...opt("heightCm", row.heightCm),
  ...opt("birthday", row.birthday),
  ...opt("sex", row.sex),
  dayEndsAt: row.dayEndsAt,
  clock: row.clock,
  revision: row.revision,
});

function toPlanVersion(row: PlanRow): PlanVersion {
  const plan: Plan = {
    goal: { kgPerWeek: row.goalKgPerWeek, ...opt("targetKg", row.goalTargetKg) },
    metabolismMultiplier: row.metabolismMultiplier,
    ...(row.calibratedMaintenanceKcal !== null && row.calibratedExerciseKcal !== null
      ? { calibratedFrom: { maintenanceKcal: row.calibratedMaintenanceKcal, loggedExerciseKcal: row.calibratedExerciseKcal } }
      : {}),
    fluidGoalMl: row.fluidGoalMl,
    macroPlan: { preset: row.macroPreset, proteinPerKg: row.proteinPerKg, ...opt("fatPct", row.fatPct), ...opt("carbPct", row.carbPct) },
  };
  return { from: row.effectiveFrom, plan };
}

function planValues(userId: string, v: PlanVersion) {
  const p = v.plan;
  return {
    userId,
    effectiveFrom: v.from,
    goalKgPerWeek: p.goal.kgPerWeek,
    goalTargetKg: p.goal.targetKg ?? null,
    metabolismMultiplier: p.metabolismMultiplier,
    calibratedMaintenanceKcal: p.calibratedFrom?.maintenanceKcal ?? null,
    calibratedExerciseKcal: p.calibratedFrom?.loggedExerciseKcal ?? null,
    fluidGoalMl: p.fluidGoalMl,
    macroPreset: p.macroPlan.preset,
    proteinPerKg: p.macroPlan.proteinPerKg,
    fatPct: p.macroPlan.fatPct ?? null,
    carbPct: p.macroPlan.carbPct ?? null,
  };
}

/** Every account has a profile and a plan; signing in creates them the first time. */
export async function ensureProfile(ex: Executor, userId: string) {
  const inserted = await ex.insert(profilesTable).values({ userId }).onConflictDoNothing().returning({ userId: profilesTable.userId });
  if (inserted.length) await ex.insert(planVersionsTable).values(planValues(userId, { from: BEGINNING, plan: defaultPlan }));
}

export async function getProfileRow(ex: Executor, userId: string, opts: { lock?: boolean } = {}) {
  const query = ex.select().from(profilesTable).where(eq(profilesTable.userId, userId));
  const [row] = opts.lock ? await query.for("update") : await query;
  return row;
}

export async function getProfile(ex: Executor, userId: string) {
  const row = await getProfileRow(ex, userId);
  return row && toProfile(row);
}

export async function updateProfile(ex: Executor, userId: string, input: ProfileInput, revision: number) {
  const [row] = await ex
    .update(profilesTable)
    .set({
      units: input.units,
      heightCm: input.heightCm ?? null,
      birthday: input.birthday ?? null,
      sex: input.sex ?? null,
      dayEndsAt: input.dayEndsAt,
      clock: input.clock,
      revision,
    })
    .where(eq(profilesTable.userId, userId))
    .returning();
  return toProfile(row!);
}

export async function getPlanVersions(ex: Executor, userId: string) {
  const rows = await ex.select().from(planVersionsTable).where(eq(planVersionsTable.userId, userId)).orderBy(asc(planVersionsTable.effectiveFrom));
  return rows.map(toPlanVersion);
}

export async function replacePlanVersions(ex: Executor, userId: string, versions: PlanVersion[], planRevision: number) {
  await ex.delete(planVersionsTable).where(eq(planVersionsTable.userId, userId));
  if (versions.length) await ex.insert(planVersionsTable).values(versions.map((v) => planValues(userId, v)));
  await ex.update(profilesTable).set({ planRevision }).where(eq(profilesTable.userId, userId));
}

export async function listWeighIns(ex: Executor, userId: string): Promise<WeighIn[]> {
  return ex
    .select({ id: weighInsTable.id, date: weighInsTable.date, kg: weighInsTable.kg })
    .from(weighInsTable)
    .where(and(eq(weighInsTable.userId, userId), isNull(weighInsTable.deletedAt)))
    .orderBy(asc(weighInsTable.date));
}

export async function findWeighIn(ex: Executor, id: string) {
  const [row] = await ex.select().from(weighInsTable).where(eq(weighInsTable.id, id));
  return row;
}

export async function listPots(ex: Executor, userId: string): Promise<Pot[]> {
  return ex
    .select({ id: potsTable.id, name: potsTable.name, grams: potsTable.grams })
    .from(potsTable)
    .where(and(eq(potsTable.userId, userId), isNull(potsTable.deletedAt)))
    .orderBy(asc(potsTable.name));
}

export async function findPot(ex: Executor, id: string) {
  const [row] = await ex.select().from(potsTable).where(eq(potsTable.id, id));
  return row;
}
