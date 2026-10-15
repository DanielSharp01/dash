import { asItem, autoFoodIcon, BEGINNING, type FoodItem, type Label, labelAt, type ReferenceTable, sameValues } from "@dash/core";
import { eq } from "drizzle-orm";
import { foodsTable, labelsTable, servingsTable } from "../db/schema";
import type { Tx } from "../providers/db";
import { labelValues, loadFoods, updateFood } from "../repositories/food.repo";
import { publicId } from "../seeds/publicId";
import type { ReferenceFood } from "./usda";

export interface ImportPlan {
  added: ReferenceFood[];
  /** The source's label differs from the latest stored one. */
  changed: { food: ReferenceFood; stored: FoodItem }[];
  unchanged: number;
  /** Stored rows the file no longer has; they stay, since entries may point at them. */
  missing: FoodItem[];
}

const CHUNK = 500;

/** Ids follow from the source and its id, so every environment and every re-import agree on them. */
export const referenceId = (table: ReferenceTable, ref: string) => publicId(`${table}:${ref}`);

export async function planImport(tx: Tx, table: ReferenceTable, foods: ReferenceFood[]): Promise<ImportPlan> {
  const stored = new Map(
    (await loadFoods(tx, eq(foodsTable.source, table)))
      .map(asItem)
      .filter((f): f is FoodItem => !!f)
      .map((f) => [f.id, f]),
  );
  const plan: ImportPlan = { added: [], changed: [], unchanged: 0, missing: [] };
  const inFile = new Set<string>();
  for (const food of foods) {
    const id = referenceId(table, food.ref);
    inFile.add(id);
    const existing = stored.get(id);
    if (!existing) plan.added.push(food);
    else if (sameValues(labelAt(existing)?.values ?? {}, food.values)) plan.unchanged++;
    else plan.changed.push({ food, stored: existing });
  }
  plan.missing = [...stored.values()].filter((f) => !inFile.has(f.id));
  return plan;
}

/**
 * New foods are written in bulk. A changed one gets a new label version from today, like any
 * product change, so entries logged before keep their values; names and servings stay as stored,
 * since curators may have tidied them.
 */
export async function applyImport(tx: Tx, table: ReferenceTable, plan: ImportPlan, today: string) {
  const label = (food: ReferenceFood, from: string): Label => ({ from, per: "100", values: food.values, verified: false, origin: table });
  for (let i = 0; i < plan.added.length; i += CHUNK) {
    const chunk = plan.added.slice(i, i + CHUNK).map((food) => ({ food, id: referenceId(table, food.ref) }));
    await tx.insert(foodsTable).values(
      chunk.map(({ food, id }) => ({
        id,
        userId: null,
        kind: "item" as const,
        catalogued: true,
        name: food.name,
        variant: food.variant ?? null,
        icon: autoFoodIcon(food.name, "item", "g"),
        iconAuto: true,
        unit: "g" as const,
        source: table,
        sourceRef: food.ref,
      })),
    );
    await tx.insert(labelsTable).values(chunk.map(({ food, id }) => labelValues(id, label(food, BEGINNING))));
    const servings = chunk.flatMap(({ food, id }) => food.servings.map((s, position) => ({ foodId: id, name: s.name, size: s.size ?? null, position })));
    if (servings.length) await tx.insert(servingsTable).values(servings);
  }
  for (const { food, stored } of plan.changed) {
    const { revision, deleted, public: _p, starter: _s, ...input } = stored;
    const labels = [...stored.labels.filter((l) => l.from < today), label(food, today)];
    await updateFood(tx, { ...input, labels }, { revision: revision + 1, deleted });
  }
}
