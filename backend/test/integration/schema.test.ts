import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { BEGINNING } from "@dash/core";
import { entriesTable, foodsTable, usersTable } from "../../src/db/schema";
import { db, pool } from "../../src/providers/db";
import { insertEntry } from "../../src/repositories/entry.repo";
import { insertFood } from "../../src/repositories/food.repo";

afterAll(() => pool.end());

async function user() {
  const [u] = await db.insert(usersTable).values({ googleSub: randomUUID() }).returning();
  return u!.id;
}

const item = () => ({
  id: randomUUID(),
  kind: "item" as const,
  name: "Rice",
  icon: "🍚",
  iconAuto: true,
  catalogued: true,
  unit: "g" as const,
  notFluid: false,
  unsure: false,
  labels: [{ from: BEGINNING, per: "100" as const, values: { kcal: 130 }, source: "package" as const }],
  servings: [{ name: "Bowl", size: 200 }],
});

describe("schema", () => {
  it("rejects a part of day without the part, and an item without a unit", async () => {
    const userId = await user();
    await expect(
      db.insert(entriesTable).values({ id: randomUUID(), userId, kind: "food", whenDate: "2026-09-01", whenKind: "part", via: "ate" }),
    ).rejects.toThrow();
    await expect(db.insert(foodsTable).values({ id: randomUUID(), userId, kind: "item", name: "x", icon: "x" })).rejects.toThrow();
  });

  it("treats serving names case-insensitively", async () => {
    const userId = await user();
    await expect(insertFood(db, { userId }, { ...item(), servings: [{ name: "Bowl" }, { name: "bowl" }] })).rejects.toThrow();
  });

  it("refuses to hard-delete a food an entry still points at", async () => {
    const userId = await user();
    const rice = item();
    await insertFood(db, { userId }, rice);
    await insertEntry(db, userId, { id: randomUUID(), kind: "food", when: { date: "2026-09-01", kind: "day" }, via: "ate", lines: [{ id: randomUUID(), foodId: rice.id, amount: {} }] });
    await expect(db.delete(foodsTable).where(eq(foodsTable.id, rice.id))).rejects.toThrow();
  });

  it("still deletes a whole account, cascading through rows that point at each other", async () => {
    const userId = await user();
    const rice = item();
    await insertFood(db, { userId }, rice);
    await insertEntry(db, userId, { id: randomUUID(), kind: "food", when: { date: "2026-09-01", kind: "day" }, via: "ate", lines: [{ id: randomUUID(), foodId: rice.id, amount: {} }] });
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    expect(await db.select().from(foodsTable).where(eq(foodsTable.userId, userId))).toEqual([]);
  });
});
