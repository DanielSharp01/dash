import { and, eq, isNull } from "drizzle-orm";
import { entryNeedsFollowUp, lookupOf, unsureItemsInUse } from "@dash/core";
import { entriesTable } from "../db/schema";
import { db } from "../providers/db";
import { loadEntries } from "../repositories/entry.repo";
import { loadFoods, visibleTo } from "../repositories/food.repo";

/** The inbox, computed with core's rules over every live entry; two people's history fits in memory. */
export async function followUp(userId: string) {
  const [foods, entries] = await Promise.all([
    loadFoods(db, visibleTo(userId), userId),
    loadEntries(db, and(eq(entriesTable.userId, userId), isNull(entriesTable.deletedAt))),
  ]);
  const lookup = lookupOf(foods);
  return {
    unsureItems: unsureItemsInUse(foods.filter((f) => !f.public), entries),
    entries: entries.filter((e) => entryNeedsFollowUp(e, lookup)),
  };
}
