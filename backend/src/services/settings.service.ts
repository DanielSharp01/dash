import { applyPlanChange, type Container, type Plan, type PlanArea, type ProfileInput, replaceAreaVersions, type SaveAreaVersionsRequest, type WeighIn } from "@dash/core";
import { db } from "../providers/db";
import {
  deleteContainerRow,
  deleteWeighInRow,
  ensureProfile,
  findContainer,
  findWeighIn,
  getPlanAreas,
  getProfile,
  getProfileRow,
  insertContainer,
  listContainers,
  listWeighIns,
  replacePlanAreas,
  replaceWeighIn,
  setChosenPlanAreas,
  setSetupOffered,
  toContainer,
  updateContainerRow,
  updateProfile,
} from "../repositories/settings.repo";
import { findUser } from "../repositories/user.repo";
import { opt } from "../repositories/mapping";
import { claimId, expectRevision, notFound, sameId, unprocessable } from "./common";

export async function me(userId: string) {
  await ensureProfile(db, userId);
  const [user, profile, areas, profileRow, containers] = await Promise.all([
    findUser(db, userId),
    getProfile(db, userId),
    getPlanAreas(db, userId),
    getProfileRow(db, userId),
    listContainers(db, userId),
  ]);
  if (!user) throw notFound();
  return {
    user,
    profile: profile!,
    plan: { ...areas, revision: profileRow!.planRevision, chosen: profileRow!.chosenPlanAreas },
    containers,
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

/** Editing an area on its History page sets it, as choosing it does. */
export async function saveAreaVersions(userId: string, req: SaveAreaVersionsRequest) {
  return db.transaction(async (tx) => {
    await ensureProfile(tx, userId);
    const row = (await getProfileRow(tx, userId, { lock: true }))!;
    const areas = await getPlanAreas(tx, userId);
    const current = { ...areas, revision: row.planRevision, chosen: row.chosenPlanAreas };
    await expectRevision(row.planRevision, req.revision, async () => current);
    const next = replaceAreaVersions(areas, req.area, req.versions);
    const chosen = [...new Set([...row.chosenPlanAreas, req.area])];
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

export async function createContainer(userId: string, container: Container) {
  return db.transaction(async (tx) => {
    const existing = await findContainer(tx, container.id);
    if (claimId(existing, userId) === "retry") return { isNew: false, body: toContainer(existing!) };
    await insertContainer(tx, userId, container);
    return { isNew: true, body: container };
  });
}

export async function updateContainer(userId: string, id: string, container: Container) {
  sameId(id, container.id);
  const row = await findContainer(db, id);
  if (!row || row.userId !== userId || row.deletedAt) throw notFound();
  if (row.kind !== container.kind) throw unprocessable("A pot can't become a mug or glass, or the other way round");
  await updateContainerRow(db, container);
  return container;
}

export async function deleteContainer(userId: string, id: string) {
  const row = await findContainer(db, id);
  if (!row || row.userId !== userId) throw notFound();
  if (!row.deletedAt) await deleteContainerRow(db, id);
}
