/**
 * `pnpm copies-to-overrides [--apply]`, once per database. Before per-field overrides, editing a
 * public item made a private copy (origin_id), which froze it. A copy with its own barcode or
 * brand is a product of its own and is only unlinked; any other copy becomes the person's own
 * values on the public item, its uses move there, and the copy is soft-deleted.
 * Without --apply it only prints what it would do.
 */
import { asItem, type FoodItem, type FoodItemInput, overrideFrom } from "@dash/core";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { batchIngredientsTable, comboPartsTable, entryLinesTable, foodsTable } from "./schema";
import { db, pool } from "../providers/db";
import { loadFoods, saveOverride } from "../repositories/food.repo";

const apply = process.argv.includes("--apply");

const asInput = ({ revision: _r, deleted: _d, public: _p, starter: _s, mine: _m, originId: _o, ...input }: FoodItem): FoodItemInput => input;

await db.transaction(async (tx) => {
  const copies = (await loadFoods(tx, and(isNotNull(foodsTable.originId), isNotNull(foodsTable.userId), isNull(foodsTable.deletedAt)))).map(asItem);
  const rows = await tx.select({ id: foodsTable.id, userId: foodsTable.userId }).from(foodsTable).where(isNotNull(foodsTable.originId));
  const ownerOf = new Map(rows.map((r) => [r.id, r.userId!]));

  for (const copy of copies) {
    if (!copy?.originId) continue;
    const [shared] = (await loadFoods(tx, eq(foodsTable.id, copy.originId))).map(asItem);
    const own = copy.barcode || copy.brand || !shared?.public || shared.unit !== copy.unit;
    if (own) {
      console.log(`keep    ${copy.name} (${copy.id}): its own product, unlinked from ${shared?.name ?? "a missing item"}`);
      if (apply) await tx.update(foodsTable).set({ originId: null, updatedAt: new Date() }).where(eq(foodsTable.id, copy.id));
      continue;
    }
    // Old copies predate the seeds' servings; an empty list is age, not a choice.
    const { servings, ...rest } = overrideFrom(shared, asInput(copy));
    const values = copy.servings.length ? { ...rest, ...(servings ? { servings } : {}) } : rest;
    console.log(`merge   ${copy.name} (${copy.id}) into the public item: ${Object.keys(values).join(", ") || "nothing differs"}`);
    if (!apply) continue;
    await saveOverride(tx, ownerOf.get(copy.id)!, shared.id, values);
    for (const table of [entryLinesTable, comboPartsTable, batchIngredientsTable])
      await tx.update(table).set({ foodId: shared.id }).where(eq(table.foodId, copy.id));
    await tx.update(foodsTable).set({ deletedAt: new Date(), revision: copy.revision + 1, updatedAt: new Date() }).where(eq(foodsTable.id, copy.id));
  }
  if (!apply) console.log("Dry run; nothing changed. Run again with --apply.");
});
await pool.end();
