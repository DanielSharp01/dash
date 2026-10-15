/**
 * `pnpm import:ciqual <folder> [--apply]` loads the Ciqual table into the shared catalogue. Pass the
 * folder holding its XML release (alim_*.xml, compo_*.xml) from
 * https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY.
 * Without --apply it only prints what would change.
 */
import { applyImport, planImport } from "../importers/apply";
import { readCiqual } from "../importers/ciqual";
import { db, pool } from "../providers/db";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const [dir] = args.filter((a) => a !== "--apply");
if (!dir) throw new Error("Usage: pnpm import:ciqual <folder> [--apply]");

const foods = await readCiqual(dir);
await db.transaction(async (tx) => {
  const plan = await planImport(tx, "ciqual", foods);
  console.log(`${foods.length} foods read: ${plan.added.length} new, ${plan.changed.length} with a changed label, ${plan.unchanged} unchanged.`);
  for (const f of plan.added.slice(0, 5)) console.log(`  new      ${f.name}${f.variant ? ` · ${f.variant}` : ""}: ${f.values.kcal} kcal`);
  for (const { food, stored } of plan.changed.slice(0, 20)) console.log(`  changed  ${stored.name}${stored.variant ? ` · ${stored.variant}` : ""}: ${stored.labels.at(-1)?.values.kcal} → ${food.values.kcal} kcal`);
  if (plan.missing.length) console.log(`  ${plan.missing.length} stored Ciqual foods are no longer in the files; they stay.`);
  if (!apply) {
    console.log("Dry run; nothing changed. Run again with --apply.");
    return;
  }
  await applyImport(tx, "ciqual", plan, new Date().toISOString().slice(0, 10));
  console.log("Applied.");
});
await pool.end();
