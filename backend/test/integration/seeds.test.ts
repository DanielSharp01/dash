import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { BEGINNING } from "@dash/core";
import { foodsTable } from "../../src/db/schema";
import { db, pool } from "../../src/providers/db";
import { loadFood } from "../../src/repositories/food.repo";
import { publicFoodId, seedPublicItems } from "../../src/seeds";
import { publicFoods, type PublicFood } from "../../src/seeds/definitions";

const key = `test-${Date.now()}`;
const def: PublicFood = {
  key,
  starter: false,
  food: {
    kind: "item",
    name: "Test lentils",
    icon: "🫘",
    iconAuto: false,
    catalogued: true,
    unit: "g",
    notFluid: false,
    unsure: false,
    labels: [{ from: BEGINNING, per: "100", values: { kcal: 116 }, source: "reference" }],
    servings: [],
  },
};

afterAll(async () => {
  await db.delete(foodsTable).where(eq(foodsTable.publicKey, key));
  await pool.end();
});

describe("public item seeding", () => {
  it("creates a definition once, leaves it alone while unchanged, and bumps the revision on a change", async () => {
    publicFoods.push(def);
    const id = publicFoodId(key);
    await seedPublicItems();
    expect(await loadFood(db, id)).toMatchObject({ public: true, revision: 1, labels: [{ from: BEGINNING, values: { kcal: 116 } }] });

    await seedPublicItems();
    expect((await loadFood(db, id))!.revision).toBe(1);

    def.food.labels.push({ from: "2026-10-01", per: "100", values: { kcal: 120 }, source: "reference" });
    await seedPublicItems();
    const updated = await loadFood(db, id);
    expect(updated).toMatchObject({ revision: 2 });
    expect(updated?.kind === "item" && updated.labels.map((l) => l.from)).toEqual([BEGINNING, "2026-10-01"]);
  });
});
