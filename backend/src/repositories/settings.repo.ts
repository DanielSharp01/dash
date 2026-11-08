import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { BEGINNING, type Container, defaultPlan, type PlanArea, type PlanAreas, type Profile, type ProfileInput, splitPlanVersions, type WeighIn } from "@dash/core";
import { containersTable, fluidVersionsTable, goalVersionsTable, macroVersionsTable, metabolismVersionsTable, profilesTable, weighInsTable } from "../db/schema";
import type { Executor } from "../providers/db";
import { opt } from "./mapping";

type ProfileRow = typeof profilesTable.$inferSelect;

const toProfile = (row: ProfileRow): Profile => ({
  ...opt("heightCm", row.heightCm),
  ...opt("birthday", row.birthday),
  ...opt("sex", row.sex),
  dayEndsAt: row.dayEndsAt,
  clock: row.clock,
  autoRecap: row.autoRecap,
  shareVerified: row.shareVerified,
  ...opt("timeZone", row.timeZone),
  ...opt("genericSource", row.genericSource),
  revision: row.revision,
});

/** Every account has a profile and a plan; signing in creates them the first time. */
export async function ensureProfile(ex: Executor, userId: string) {
  const inserted = await ex.insert(profilesTable).values({ userId }).onConflictDoNothing().returning({ userId: profilesTable.userId });
  if (inserted.length) await insertPlanAreas(ex, userId, splitPlanVersions([{ from: BEGINNING, plan: defaultPlan }]));
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
      heightCm: input.heightCm ?? null,
      birthday: input.birthday ?? null,
      sex: input.sex ?? null,
      dayEndsAt: input.dayEndsAt,
      clock: input.clock,
      autoRecap: input.autoRecap,
      shareVerified: input.shareVerified,
      timeZone: input.timeZone ?? null,
      genericSource: input.genericSource ?? null,
      revision,
    })
    .where(eq(profilesTable.userId, userId))
    .returning();
  return toProfile(row!);
}

/** Only moves forward, so a device that saw an older recap can't bring a newer one back. */
export async function markRecapSeen(ex: Executor, userId: string, day: string) {
  const [row] = await ex
    .update(profilesTable)
    .set({ recapSeenOn: sql`greatest(coalesce(${profilesTable.recapSeenOn}, ${day}::date), ${day}::date)` })
    .where(eq(profilesTable.userId, userId))
    .returning({ recapSeenOn: profilesTable.recapSeenOn });
  return row!.recapSeenOn!;
}

export async function clearRecapSeen(ex: Executor, userId: string) {
  await ex.update(profilesTable).set({ recapSeenOn: null }).where(eq(profilesTable.userId, userId));
}

export async function setSetupOffered(ex: Executor, userId: string) {
  await ex.update(profilesTable).set({ setupOffered: true }).where(eq(profilesTable.userId, userId));
}

export async function getPlanAreas(ex: Executor, userId: string): Promise<PlanAreas> {
  const goal = await ex.select().from(goalVersionsTable).where(eq(goalVersionsTable.userId, userId)).orderBy(asc(goalVersionsTable.effectiveFrom));
  const metabolism = await ex.select().from(metabolismVersionsTable).where(eq(metabolismVersionsTable.userId, userId)).orderBy(asc(metabolismVersionsTable.effectiveFrom));
  const fluid = await ex.select().from(fluidVersionsTable).where(eq(fluidVersionsTable.userId, userId)).orderBy(asc(fluidVersionsTable.effectiveFrom));
  const macros = await ex.select().from(macroVersionsTable).where(eq(macroVersionsTable.userId, userId)).orderBy(asc(macroVersionsTable.effectiveFrom));
  return {
    goal: goal.map((r) => ({ from: r.effectiveFrom, value: { goal: { kgPerWeek: r.kgPerWeek, ...opt("targetKg", r.targetKg) } } })),
    metabolism: metabolism.map((r) => ({
      from: r.effectiveFrom,
      value: {
        metabolismMultiplier: r.multiplier,
        ...(r.calibratedMaintenanceKcal !== null && r.calibratedExerciseKcal !== null
          ? { calibratedFrom: { maintenanceKcal: r.calibratedMaintenanceKcal, loggedExerciseKcal: r.calibratedExerciseKcal } }
          : {}),
      },
    })),
    fluid: fluid.map((r) => ({ from: r.effectiveFrom, value: { fluidGoalMl: r.goalMl } })),
    macros: macros.map((r) => ({
      from: r.effectiveFrom,
      value: { macroPlan: { preset: r.preset, proteinPerKg: r.proteinPerKg, ...opt("fatPct", r.fatPct), ...opt("carbPct", r.carbPct) } },
    })),
  };
}

async function insertPlanAreas(ex: Executor, userId: string, areas: PlanAreas) {
  const at = (from: string) => ({ userId, effectiveFrom: from });
  if (areas.goal.length)
    await ex.insert(goalVersionsTable).values(areas.goal.map((v) => ({ ...at(v.from), kgPerWeek: v.value.goal.kgPerWeek, targetKg: v.value.goal.targetKg ?? null })));
  if (areas.metabolism.length)
    await ex.insert(metabolismVersionsTable).values(
      areas.metabolism.map((v) => ({
        ...at(v.from),
        multiplier: v.value.metabolismMultiplier,
        calibratedMaintenanceKcal: v.value.calibratedFrom?.maintenanceKcal ?? null,
        calibratedExerciseKcal: v.value.calibratedFrom?.loggedExerciseKcal ?? null,
      })),
    );
  if (areas.fluid.length) await ex.insert(fluidVersionsTable).values(areas.fluid.map((v) => ({ ...at(v.from), goalMl: v.value.fluidGoalMl })));
  if (areas.macros.length)
    await ex.insert(macroVersionsTable).values(
      areas.macros.map((v) => {
        const m = v.value.macroPlan;
        return { ...at(v.from), preset: m.preset, proteinPerKg: m.proteinPerKg, fatPct: m.fatPct ?? null, carbPct: m.carbPct ?? null };
      }),
    );
}

export async function replacePlanAreas(ex: Executor, userId: string, areas: PlanAreas, planRevision: number) {
  for (const table of [goalVersionsTable, metabolismVersionsTable, fluidVersionsTable, macroVersionsTable]) await ex.delete(table).where(eq(table.userId, userId));
  await insertPlanAreas(ex, userId, areas);
  await ex.update(profilesTable).set({ planRevision }).where(eq(profilesTable.userId, userId));
}

export async function setChosenPlanAreas(ex: Executor, userId: string, chosen: PlanArea[], planRevision: number) {
  await ex.update(profilesTable).set({ chosenPlanAreas: chosen, planRevision }).where(eq(profilesTable.userId, userId));
}

export async function listWeighIns(ex: Executor, userId: string): Promise<WeighIn[]> {
  return ex
    .select({ id: weighInsTable.id, date: weighInsTable.date, kg: weighInsTable.kg })
    .from(weighInsTable)
    .where(and(eq(weighInsTable.userId, userId), isNull(weighInsTable.deletedAt)))
    .orderBy(asc(weighInsTable.date));
}

/** Retires the day's live weigh-in, if any, so the new one replaces it. */
export async function replaceWeighIn(ex: Executor, userId: string, w: WeighIn) {
  await ex
    .update(weighInsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(weighInsTable.userId, userId), eq(weighInsTable.date, w.date), isNull(weighInsTable.deletedAt)));
  await ex.insert(weighInsTable).values({ id: w.id, userId, date: w.date, kg: w.kg });
}

export async function deleteWeighInRow(ex: Executor, id: string) {
  await ex.update(weighInsTable).set({ deletedAt: new Date() }).where(eq(weighInsTable.id, id));
}

export async function findWeighIn(ex: Executor, id: string) {
  const [row] = await ex.select().from(weighInsTable).where(eq(weighInsTable.id, id));
  return row;
}

type ContainerRow = typeof containersTable.$inferSelect;

export function toContainer(row: ContainerRow): Container {
  const base = { id: row.id, name: row.name };
  return row.kind === "pot" ? { ...base, kind: "pot", grams: row.grams! } : { ...base, kind: "glass", ...opt("grams", row.grams), ...opt("capacityMl", row.capacityMl) };
}

const containerColumns = (c: Container) => ({ kind: c.kind, name: c.name, grams: c.grams ?? null, capacityMl: c.kind === "glass" ? (c.capacityMl ?? null) : null });

export async function listContainers(ex: Executor, userId: string): Promise<Container[]> {
  const rows = await ex
    .select()
    .from(containersTable)
    .where(and(eq(containersTable.userId, userId), isNull(containersTable.deletedAt)))
    .orderBy(asc(containersTable.name));
  return rows.map(toContainer);
}

export async function findContainer(ex: Executor, id: string) {
  const [row] = await ex.select().from(containersTable).where(eq(containersTable.id, id));
  return row;
}

export async function insertContainer(ex: Executor, userId: string, container: Container) {
  await ex.insert(containersTable).values({ id: container.id, userId, ...containerColumns(container) });
}

export async function updateContainerRow(ex: Executor, container: Container) {
  await ex.update(containersTable).set(containerColumns(container)).where(eq(containersTable.id, container.id));
}

export async function deleteContainerRow(ex: Executor, id: string) {
  await ex.update(containersTable).set({ deletedAt: new Date() }).where(eq(containersTable.id, id));
}
