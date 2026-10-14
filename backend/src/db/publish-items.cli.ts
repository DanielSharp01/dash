/**
 * `pnpm publish-items [--apply]`, once per database when the shared catalogue starts. Every
 * person's catalogued items become public, except estimates, unsure items, items without a label
 * and labels whose macros don't add up, which stay theirs. Run copies-to-overrides first, so no copy gets published next to its
 * original. Without --apply it only prints what it would do.
 */
import { asItem, energyMismatch } from "@dash/core";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { foodsTable } from "./schema";
import { db, pool } from "../providers/db";
import { loadFoods } from "../repositories/food.repo";

const apply = process.argv.includes("--apply");

await db.transaction(async (tx) => {
  const where = and(isNotNull(foodsTable.userId), eq(foodsTable.kind, "item"), eq(foodsTable.catalogued, true), isNull(foodsTable.deletedAt));
  const items = (await loadFoods(tx, where)).map(asItem).filter((f) => !!f);
  const owners = await tx.select({ id: foodsTable.id, userId: foodsTable.userId }).from(foodsTable).where(where);
  const ownerOf = new Map(owners.map((r) => [r.id, r.userId!]));

  const keep = (reason: string, name: string) => console.log(`keep     ${name}: ${reason}`);
  const published: string[] = [];
  for (const item of items) {
    const name = [item.name, item.variant, item.brand].filter(Boolean).join(" · ");
    if (item.originId) keep("still a copy of a public item; run copies-to-overrides first", name);
    else if (item.unsure) keep("unsure, not filled in yet", name);
    else if (!item.labels.length) keep("no label", name);
    else if (item.labels.some((l) => l.origin === "estimate")) keep("an estimate", name);
    else if (item.labels.some((l) => energyMismatch(l.values) !== undefined)) keep("its macros don't add up to its kcal", name);
    else {
      console.log(`publish  ${name}`);
      published.push(item.id);
    }
  }
  console.log(`${published.length} to publish, ${items.length - published.length} kept private.`);
  if (!apply) {
    console.log("Dry run; nothing changed. Run again with --apply.");
    return;
  }
  for (const id of published)
    await tx
      .update(foodsTable)
      .set({ userId: null, publishedBy: ownerOf.get(id)!, updatedAt: new Date() })
      .where(eq(foodsTable.id, id));
});
await pool.end();
