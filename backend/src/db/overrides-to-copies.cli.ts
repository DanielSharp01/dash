/**
 * `pnpm overrides-to-copies [--apply]`, once per database. Per-field overrides were replaced by
 * own versions: each person's override of a public item becomes their own copy with those values,
 * their entries move onto it, and the override row goes. Without --apply it only prints.
 */
import { asItem, type FoodItem } from "@dash/core";
import { and, eq } from "drizzle-orm";
import { foodOverridesTable } from "./schema";
import { db, pool } from "../providers/db";
import { loadFood, updateFood } from "../repositories/food.repo";
import { copyFood } from "../services/food.service";

const apply = process.argv.includes("--apply");
const rows = await db.select().from(foodOverridesTable);

for (const row of rows) {
  const shared = asItem(await loadFood(db, row.foodId));
  console.log(`copy  ${shared?.name ?? row.foodId} for ${row.userId}: ${Object.keys(row.values).join(", ")}`);
  if (!apply || !shared) continue;
  const { food } = await copyFood(row.userId, row.foodId);
  const copy = food as FoodItem;
  const merged: Record<string, unknown> = { ...copy };
  for (const [key, value] of Object.entries(row.values)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  const { revision, deleted: _d, public: _p, starter: _s, ...input } = merged as FoodItem;
  await db.transaction(async (tx) => {
    await updateFood(tx, input, { revision: revision + 1, deleted: false });
    await tx.delete(foodOverridesTable).where(and(eq(foodOverridesTable.userId, row.userId), eq(foodOverridesTable.foodId, row.foodId)));
  });
}
if (!apply) console.log(`${rows.length} to convert. Dry run; nothing changed. Run again with --apply.`);
await pool.end();
