import { and, eq, isNull } from "drizzle-orm";
import { applyPlanChange, type Plan, type Pot, type ProfileInput, type WeighIn } from "@dash/core";
import { potsTable, usersTable, weighInsTable } from "../db/schema";
import { db } from "../providers/db";
import {
  ensureProfile,
  findPot,
  findWeighIn,
  getPlanVersions,
  getProfile,
  getProfileRow,
  listPots,
  listWeighIns,
  replacePlanVersions,
  updateProfile,
} from "../repositories/settings.repo";
import { claimId, expectRevision, notFound, sameId } from "./common";

export async function me(userId: string) {
  await ensureProfile(db, userId);
  const [[user], profile, versions, profileRow, pots] = await Promise.all([
    db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)),
    getProfile(db, userId),
    getPlanVersions(db, userId),
    getProfileRow(db, userId),
    listPots(db, userId),
  ]);
  if (!user) throw notFound();
  return { user, profile: profile!, plan: { versions, revision: profileRow!.planRevision }, pots };
}

export async function saveProfile(userId: string, req: ProfileInput & { revision: number }) {
  return db.transaction(async (tx) => {
    await ensureProfile(tx, userId);
    const row = (await getProfileRow(tx, userId, { lock: true }))!;
    await expectRevision(row.revision, req.revision, () => getProfile(tx, userId));
    return updateProfile(tx, userId, req, row.revision + 1);
  });
}

export async function savePlan(userId: string, req: { plan: Plan; change: "fix" | { from: string }; revision: number }) {
  return db.transaction(async (tx) => {
    await ensureProfile(tx, userId);
    const row = (await getProfileRow(tx, userId, { lock: true }))!;
    const versions = await getPlanVersions(tx, userId);
    await expectRevision(row.planRevision, req.revision, async () => ({ versions, revision: row.planRevision }));
    const next = applyPlanChange(versions, req.plan, req.change);
    if (!next) return { versions, revision: row.planRevision };
    await replacePlanVersions(tx, userId, next, row.planRevision + 1);
    return { versions: await getPlanVersions(tx, userId), revision: row.planRevision + 1 };
  });
}

export async function weighIns(userId: string) {
  return { weighIns: await listWeighIns(db, userId) };
}

/** A second weigh-in on a day replaces the first. */
export async function addWeighIn(userId: string, w: WeighIn) {
  return db.transaction(async (tx) => {
    const existing = await findWeighIn(tx, w.id);
    if (claimId(existing, userId) === "retry") return { isNew: false, body: { id: existing!.id, date: existing!.date, kg: existing!.kg } };
    await tx
      .update(weighInsTable)
      .set({ deletedAt: new Date() })
      .where(and(eq(weighInsTable.userId, userId), eq(weighInsTable.date, w.date), isNull(weighInsTable.deletedAt)));
    await tx.insert(weighInsTable).values({ id: w.id, userId, date: w.date, kg: w.kg });
    return { isNew: true, body: { id: w.id, date: w.date, kg: w.kg } };
  });
}

export async function deleteWeighIn(userId: string, id: string) {
  const row = await findWeighIn(db, id);
  if (!row || row.userId !== userId) throw notFound();
  if (!row.deletedAt) await db.update(weighInsTable).set({ deletedAt: new Date() }).where(eq(weighInsTable.id, id));
}

export async function createPot(userId: string, pot: Pot) {
  return db.transaction(async (tx) => {
    const existing = await findPot(tx, pot.id);
    if (claimId(existing, userId) === "retry") return { isNew: false, body: { id: existing!.id, name: existing!.name, grams: existing!.grams } };
    await tx.insert(potsTable).values({ id: pot.id, userId, name: pot.name, grams: pot.grams });
    return { isNew: true, body: pot };
  });
}

export async function updatePot(userId: string, id: string, pot: Pot) {
  sameId(id, pot.id);
  const row = await findPot(db, id);
  if (!row || row.userId !== userId || row.deletedAt) throw notFound();
  await db.update(potsTable).set({ name: pot.name, grams: pot.grams }).where(eq(potsTable.id, id));
  return pot;
}

export async function deletePot(userId: string, id: string) {
  const row = await findPot(db, id);
  if (!row || row.userId !== userId) throw notFound();
  if (!row.deletedAt) await db.update(potsTable).set({ deletedAt: new Date() }).where(eq(potsTable.id, id));
}
