/**
 * `pnpm import:usda <folder>... [--apply]` loads USDA FoodData Central into the shared catalogue.
 * Pass the unzipped Foundation Foods and/or SR Legacy CSV folders from
 * https://fdc.nal.usda.gov/download-datasets. Without --apply it only prints what would change.
 */
import { applyImport, planImport } from "../importers/apply";
import { readUsda } from "../importers/usda";
import { db, pool } from "../providers/db";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dirs = args.filter((a) => a !== "--apply");

const foods = await readUsda(dirs);
await db.transaction(async (tx) => {
  const plan = await planImport(tx, "usda", foods);
  console.log(`${foods.length} foods read: ${plan.added.length} new, ${plan.changed.length} with a changed label, ${plan.unchanged} unchanged.`);
  for (const f of plan.added.slice(0, 5)) console.log(`  new      ${f.name}${f.variant ? ` · ${f.variant}` : ""}: ${f.values.kcal} kcal`);
  for (const { food, stored } of plan.changed.slice(0, 20)) console.log(`  changed  ${stored.name}${stored.variant ? ` · ${stored.variant}` : ""}: ${stored.labels.at(-1)?.values.kcal} → ${food.values.kcal} kcal`);
  if (plan.missing.length) console.log(`  ${plan.missing.length} stored USDA foods are no longer in the files; they stay.`);
  if (!apply) {
    console.log("Dry run; nothing changed. Run again with --apply.");
    return;
  }
  await applyImport(tx, "usda", plan, new Date().toISOString().slice(0, 10));
  console.log("Applied.");
});
await pool.end();
