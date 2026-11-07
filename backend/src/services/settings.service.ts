import { applyPlanChange, type Plan, type PlanArea, type Pot, type ProfileInput, type WeighIn } from "@dash/core";
import { db } from "../providers/db";
import {
  deletePotRow,
  deleteWeighInRow,
  ensureProfile,
  findPot,
  findWeighIn,
  getPlanAreas,
  getProfile,
  getProfileRow,
  listPots,
  insertPot,
  listWeighIns,
  replacePlanAreas,
  replaceWeighIn,
  setChosenPlanAreas,
  setSetupOffered,
  updatePotRow,
  updateProfile,
} from "../repositories/settings.repo";
import { findUser } from "../repositories/user.repo";
import { opt } from "../repositories/mapping";
import { claimId, expectRevision, notFound, sameId } from "./common";

export async function me(userId: string) {
  await ensureProfile(db, userId);
  const [user, profile, areas, profileRow, pots] = await Promise.all([
    findUser(db, userId),
    getProfile(db, userId),
    getPlanAreas(db, userId),
    getProfileRow(db, userId),
    listPots(db, userId),
  ]);
  if (!user) throw notFound();
  return {
    user,
    profile: profile!,
    plan: { ...areas, revision: profileRow!.planRevision, chosen: profileRow!.chosenPlanAreas },
    pots,
    ...opt("recapSeenOn", profileRow!.recapSeenOn),
    setupOffered: profileRow!.setupOffered,
  };
}

export async function saveProfile(userId: string, req: ProfileInput & { revision: number }) {
  return db.transaction(async (tx) => {
    await ensureProfile(tx, userId);
    const row = (await getProfileRow(tx, userId, { lock: true }))!;
    await expectRevision(row.revision, req.revision, () => getProfile(tx, userId));
    return updateProfile(tx, userId, req, row.revision + 1);
  });
}

/** Choosing an area that keeps its values is still a change: it moves the area off the new account's defaults. */
export async function savePlan(userId: string, req: { plan: Plan; change: "fix" | { from: string }; revision: number; choose: PlanArea[] }) {
  return db.transaction(async (tx) => {
    await ensureProfile(tx, userId);
    const row = (await getProfileRow(tx, userId, { lock: true }))!;
    const areas = await getPlanAreas(tx, userId);
    const current = { ...areas, revision: row.planRevision, chosen: row.chosenPlanAreas };
    await expectRevision(row.planRevision, req.revision, async () => current);
    const next = applyPlanChange(areas, req.plan, req.change);
    const chosen = [...new Set([...row.chosenPlanAreas, ...req.choose])];
    if (!next && chosen.length === row.chosenPlanAreas.length) return current;
    const revision = row.planRevision + 1;
    if (next) await replacePlanAreas(tx, userId, next, revision);
    await setChosenPlanAreas(tx, userId, chosen, revision);
    return { ...(next ? await getPlanAreas(tx, userId) : areas), revision, chosen };
  });
}

export async function markSetupOffered(userId: string) {
  await ensureProfile(db, userId);
  await setSetupOffered(db, userId);
}

export async function weighIns(userId: string) {
  return { weighIns: await listWeighIns(db, userId) };
}

/** A second weigh-in on a day replaces the first. */
export async function addWeighIn(userId: string, w: WeighIn) {
  return db.transaction(async (tx) => {
    const existing = await findWeighIn(tx, w.id);
    if (claimId(existing, userId) === "retry") return { isNew: false, body: { id: existing!.id, date: existing!.date, kg: existing!.kg } };
    await replaceWeighIn(tx, userId, w);
    return { isNew: true, body: { id: w.id, date: w.date, kg: w.kg } };
  });
}

export async function deleteWeighIn(userId: string, id: string) {
  const row = await findWeighIn(db, id);
  if (!row || row.userId !== userId) throw notFound();
  if (!row.deletedAt) await deleteWeighInRow(db, id);
}

export async function createPot(userId: string, pot: Pot) {
  return db.transaction(async (tx) => {
    const existing = await findPot(tx, pot.id);
    if (claimId(existing, userId) === "retry") return { isNew: false, body: { id: existing!.id, name: existing!.name, grams: existing!.grams } };
    await insertPot(tx, userId, pot);
    return { isNew: true, body: pot };
  });
}

export async function updatePot(userId: string, id: string, pot: Pot) {
  sameId(id, pot.id);
  const row = await findPot(db, id);
  if (!row || row.userId !== userId || row.deletedAt) throw notFound();
  await updatePotRow(db, pot);
  return pot;
}

export async function deletePot(userId: string, id: string) {
  const row = await findPot(db, id);
  if (!row || row.userId !== userId) throw notFound();
  if (!row.deletedAt) await deletePotRow(db, id);
}
