import { createReadStream, readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Nutrients } from "@dash/core";
import type { ReferenceFood } from "./usda";

const entities: Record<string, string> = { "&apos;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&amp;": "&" };
const decode = (text: string) => text.replace(/&(apos|quot|lt|gt|amp);/g, (e) => entities[e]!);

/**
 * Records of a Ciqual XML file. The files are flat, one field per line, so a line reader keeps the
 * 70 MB composition file out of memory; an element marked missing reads as empty.
 */
export async function* readCiqualXml(path: string, record: string): AsyncGenerator<Record<string, string>> {
  let current: Record<string, string> | undefined;
  for await (const raw of createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity })) {
    const line = raw.trim();
    if (line === `<${record}>`) current = {};
    else if (line === `</${record}>`) {
      if (current) yield current;
      current = undefined;
    } else if (current) {
      const field = /^<(\w+)>\s*(.*?)\s*<\/\1>$/.exec(line) ?? /^<(\w+)\s+missing="[^"]*"\s*\/>$/.exec(line);
      if (field) current[field[1]!] = decode(field[2] ?? "");
    }
  }
}

/** Energy by the EU labelling rules, else by the Jones factor with fibres. */
const energyCodes = ["328", "333"];
const gramNutrients: Record<string, keyof Nutrients> = { "25000": "protein", "40000": "fat", "31000": "carbs", "32000": "sugars", "40302": "saturates", "10004": "salt" };

/**
 * A Ciqual value: "12,5" uses a decimal comma, "traces" and "< 0,5" round to zero, "-" and a large
 * "below" bound are unknown.
 */
export function ciqualValue(text: string): number | undefined {
  const value = text.trim();
  if (value === "traces") return 0;
  const below = /^<\s*([\d,]+)$/.exec(value);
  if (below) return Number(below[1]!.replace(",", ".")) <= 1 ? 0 : undefined;
  const n = Number(value.replace(",", "."));
  return value && Number.isFinite(n) ? n : undefined;
}

const round = (n: number) => Math.round(n * 100) / 100;
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Cashew nut, dry-grilled, no added salt" is Cashew nut, in the variation "dry-grilled, no added salt". */
export function splitCiqualName(name: string): { name: string; variant?: string } {
  const [first, ...rest] = name.split(",").map((p) => p.trim()).filter(Boolean);
  const variant = rest.join(", ");
  return { name: capitalise(first!), ...(variant ? { variant } : {}) };
}

/** Reads the Ciqual XML release from its folder (alim_*.xml and compo_*.xml), with the English names. */
export async function readCiqual(dir: string): Promise<ReferenceFood[]> {
  const file = (prefix: string) => {
    const found = readdirSync(dir).find((f) => f.startsWith(`${prefix}_`) && f.endsWith(".xml") && !f.startsWith("alim_grp"));
    if (!found) throw new Error(`No ${prefix}_*.xml in ${dir}`);
    return join(dir, found);
  };
  const names = new Map<string, string>();
  for await (const r of readCiqualXml(file("alim"), "ALIM")) if (r.alim_code && r.alim_nom_eng) names.set(r.alim_code, r.alim_nom_eng);

  const values = new Map<string, Map<string, number>>();
  for await (const r of readCiqualXml(file("compo"), "COMPO")) {
    const value = ciqualValue(r.teneur ?? "");
    if (value === undefined || !names.has(r.alim_code!)) continue;
    const of = values.get(r.alim_code!) ?? new Map<string, number>();
    of.set(r.const_code!, value);
    values.set(r.alim_code!, of);
  }

  const foods: ReferenceFood[] = [];
  for (const [ref, name] of names) {
    const of = values.get(ref);
    const kcal = energyCodes.map((c) => of?.get(c)).find((v) => v !== undefined);
    if (!of || kcal === undefined) continue;
    const nutrients: Nutrients = { kcal: Math.round(kcal) };
    for (const [code, key] of Object.entries(gramNutrients)) if (of.has(code)) nutrients[key] = round(of.get(code)!);
    foods.push({ ref, ...splitCiqualName(name), values: nutrients, servings: [] });
  }
  return foods;
}
