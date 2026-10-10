import type { ActivityInput } from "@dash/core";
import { weakEtag } from "../http/respond";
import { db, type Tx } from "../providers/db";
import {
  activitiesVersion,
  activitiesVisibleTo,
  activityRefRows,
  insertActivity,
  loadActivities,
  loadActivity,
  lockActivity,
  setActivityDeleted,
  updateActivity,
} from "../repositories/activity.repo";
import { claimId, expectRevision, sameId, unprocessable, writable } from "./common";

export async function listActivities(userId: string) {
  const version = await activitiesVersion(db, userId);
  return { activities: await loadActivities(db, activitiesVisibleTo(userId)), etag: weakEtag("activities", userId, version.count, version.latest) };
}

async function checkOrigin(tx: Tx, userId: string, input: ActivityInput) {
  if (!input.originId) return;
  const [row] = await activityRefRows(tx, [input.originId]);
  if (!row || (row.userId !== null && row.userId !== userId)) throw unprocessable("Refers to an activity that doesn't exist", { field: "originId" });
}

/** Returns whether a row was inserted; false means a retry of an earlier create. */
export async function createActivityRow(tx: Tx, userId: string, input: ActivityInput) {
  const [row] = await activityRefRows(tx, [input.id]);
  if (claimId(row, userId) === "retry") return false;
  await checkOrigin(tx, userId, input);
  await insertActivity(tx, { userId }, input);
  return true;
}

export async function createNewActivities(tx: Tx, userId: string, inputs: ActivityInput[] = []) {
  for (const input of inputs) await createActivityRow(tx, userId, input);
  const created = [];
  for (const i of inputs) created.push((await loadActivity(tx, i.id))!);
  return created;
}

export async function createActivity(userId: string, input: ActivityInput) {
  return db.transaction(async (tx) => {
    const isNew = await createActivityRow(tx, userId, input);
    return { isNew, body: (await loadActivity(tx, input.id))! };
  });
}

export async function updateActivityDoc(userId: string, id: string, req: ActivityInput & { revision: number }) {
  sameId(id, req.id);
  return db.transaction(async (tx) => {
    const row = writable(await lockActivity(tx, id), userId);
    await expectRevision(row.revision, req.revision, () => loadActivity(tx, id));
    if (req.originId !== (row.originId ?? undefined)) await checkOrigin(tx, userId, req);
    await updateActivity(tx, req, { revision: row.revision + 1, deleted: row.deletedAt !== null });
    return (await loadActivity(tx, id))!;
  });
}

export async function setActivityDeletedFor(userId: string, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    const row = writable(await lockActivity(tx, id), userId);
    if ((row.deletedAt !== null) !== deleted) await setActivityDeleted(tx, id, deleted, row.revision + 1);
    return (await loadActivity(tx, id))!;
  });
}
