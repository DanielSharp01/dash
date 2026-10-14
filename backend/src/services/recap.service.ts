import { and, between, eq, isNull } from "drizzle-orm";
import { dailyTargets, dayRecap, logicalDateIn, lookupOf, RECAP_WINDOW_DAYS, shiftDate } from "@dash/core";
import { entriesTable } from "../db/schema";
import { db } from "../providers/db";
import { loadEntries } from "../repositories/entry.repo";
import { loadFoods, visibleTo } from "../repositories/food.repo";
import { clearRecapSeen, ensureProfile, getPlanVersions, getProfile, getProfileRow, listWeighIns, markRecapSeen } from "../repositories/settings.repo";
import { unprocessable } from "./common";

/** A recap is only for a day that's over on the person's own clock. */
async function expectFinished(userId: string, day: string) {
  await ensureProfile(db, userId);
  const row = (await getProfileRow(db, userId))!;
  // Until a device has sent its time zone, UTC; at worst that holds a recap back by a few hours.
  const today = logicalDateIn(new Date(), row.timeZone ?? "UTC", row.dayEndsAt);
  if (day >= today) throw unprocessable("The day isn't over yet", { today });
}

export async function recap(userId: string, day: string) {
  await expectFinished(userId, day);
  const [profile, versions, weighIns, foods, entries] = await Promise.all([
    getProfile(db, userId),
    getPlanVersions(db, userId),
    listWeighIns(db, userId),
    loadFoods(db, visibleTo(userId), userId),
    loadEntries(db, and(eq(entriesTable.userId, userId), isNull(entriesTable.deletedAt), between(entriesTable.whenDate, shiftDate(day, -RECAP_WINDOW_DAYS), day))),
  ]);
  return dayRecap(day, entries, (d) => dailyTargets(profile!, versions, weighIns, d), lookupOf(foods));
}

export async function markSeen(userId: string, day: string) {
  await expectFinished(userId, day);
  return { recapSeenOn: await markRecapSeen(db, userId, day) };
}

export const clearSeen = (userId: string) => clearRecapSeen(db, userId);
