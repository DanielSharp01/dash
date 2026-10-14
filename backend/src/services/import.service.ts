import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { BadRequest, Conflict } from "@danielsharp/typeline-http";
import { z } from "zod";
import {
  activityInputSchema,
  autoActivityIcon,
  autoFoodIcon,
  batchSchema,
  BEGINNING,
  entryInputSchema,
  foodInputSchema,
  planSchema,
  profileInputSchema,
  type ActivityInput,
  type Batch,
  type EntryInput,
  type FoodInput,
  type ImportRequest,
  type Line,
  type MeasureKey,
  type PlanVersion,
} from "@dash/core";
import { activitiesTable, entriesTable, foodsTable, potsTable, weighInsTable } from "../db/schema";
import { db, type Tx } from "../providers/db";
import { insertActivity } from "../repositories/activity.repo";
import { insertEntry } from "../repositories/entry.repo";
import { insertBatch, insertFood } from "../repositories/food.repo";
import { ensureProfile, getProfileRow, replacePlanVersions, updateProfile } from "../repositories/settings.repo";
import { publicActivityId } from "../seeds";
import { publicActivities } from "../seeds/definitions";

const anyId = z.string().min(1);
const amount = z.looseObject({ value: z.number().optional(), unit: z.string().optional() });
const label = z.looseObject({ from: z.string() });
const foodData = z.looseObject({ unit: z.enum(["g", "ml", "piece"]), labels: z.array(label), servings: z.array(z.looseObject({ name: z.string() })) });
const portion = z.looseObject({ foodId: anyId, amount, base: z.number().optional() });

const legacyFood = z.discriminatedUnion("kind", [
  foodData.extend({
    id: anyId,
    kind: z.literal("item"),
    name: z.string(),
    variant: z.string().optional(),
    icon: z.string().optional(),
    barcode: z.string().optional(),
    notFluid: z.boolean().optional(),
    unsure: z.boolean().optional(),
    deleted: z.boolean().optional(),
  }),
  z.looseObject({
    id: anyId,
    kind: z.literal("recipe"),
    name: z.string(),
    icon: z.string().optional(),
    deleted: z.boolean().optional(),
    batches: z.array(
      z.looseObject({ id: anyId, madeOn: z.string(), ingredients: z.array(portion), yield: z.unknown().optional(), gone: z.boolean().optional() }),
    ),
  }),
  z.looseObject({ id: anyId, kind: z.literal("combo"), name: z.string(), icon: z.string().optional(), deleted: z.boolean().optional(), parts: z.array(portion) }),
]);

const legacyLine = z.looseObject({
  id: anyId,
  itemId: anyId.optional(),
  recipeId: anyId.optional(),
  batchId: anyId.optional(),
  rawName: z.string().optional(),
  barcode: z.string().optional(),
  amount,
  base: z.number().optional(),
  own: foodData.optional(),
});

const legacyEntry = z.discriminatedUnion("kind", [
  z.looseObject({
    id: anyId,
    kind: z.literal("food"),
    when: z.unknown(),
    createdAt: z.string(),
    via: z.enum(["ate", "drank"]),
    comboId: anyId.optional(),
    title: z.string().optional(),
    lines: z.array(legacyLine),
  }),
  z.looseObject({
    id: anyId,
    kind: z.literal("exercise"),
    when: z.unknown(),
    createdAt: z.string(),
    activityId: anyId.optional(),
    rawName: z.string().optional(),
    measures: z.record(z.string(), z.unknown()),
    kcal: z.number().optional(),
    kcalManual: z.boolean().optional(),
  }),
]);

const legacyActivity = z.looseObject({
  id: anyId,
  name: z.string(),
  icon: z.string().optional(),
  measures: z.array(z.string()),
  burn: z.unknown().optional(),
  deleted: z.boolean().optional(),
});

const legacyProfile = z.looseObject({
  units: z.unknown().optional(),
  heightCm: z.unknown().optional(),
  birthday: z.unknown().optional(),
  sex: z.unknown().optional(),
  dayEndsAt: z.unknown().optional(),
  clock: z.unknown().optional(),
  goal: z.unknown().optional(),
  metabolismMultiplier: z.unknown().optional(),
  calibratedFrom: z.unknown().optional(),
  fluidGoalMl: z.unknown().optional(),
  macroPlan: z.unknown().optional(),
  planHistory: z.array(z.looseObject({ from: z.string(), plan: z.unknown() })).optional(),
  pots: z.array(z.looseObject({ id: anyId, name: z.string(), grams: z.number() })).optional(),
});

const legacyData = z.object({
  "dash.foods.v1": z.array(legacyFood).default([]),
  "dash.entries.v1": z.array(legacyEntry).default([]),
  "dash.activities.v1": z.array(legacyActivity).default([]),
  "dash.profile.v1": legacyProfile.default({}),
  "dash.weighIns.v1": z.array(z.looseObject({ id: anyId, date: z.string(), kg: z.number() })).default([]),
});

/** The prototype's built-in activities, which lived in its code and were only stored once edited. */
const legacyBuiltIns: Record<string, Omit<ActivityInput, "id" | "iconAuto">> = {
  walk: { name: "Walk", icon: "🚶", measures: ["distance", "duration"], burn: { basis: "distance", kcalPerKgKm: 0.5 } },
  run: { name: "Run", icon: "🏃", measures: ["distance", "duration"], burn: { basis: "distance", kcalPerKgKm: 1 } },
  cycle: { name: "Cycling", icon: "🚴", measures: ["distance", "duration"], burn: { basis: "distance", kcalPerKgKm: 0.3 } },
  swim: { name: "Swim", icon: "🏊", measures: ["laps", "distance", "duration"], burn: { basis: "distance", kcalPerKgKm: 3 } },
  weights: { name: "Weight lifting", icon: "🏋️", measures: ["duration", "sets", "reps", "weight"], burn: { basis: "duration", met: 5 } },
  pushups: { name: "Push-ups", icon: "💪", measures: ["sets", "reps"], burn: { basis: "reps", kcalPerKgRep: 0.005 } },
  pullups: { name: "Pull-ups", icon: "🧗", measures: ["sets", "reps"], burn: { basis: "reps", kcalPerKgRep: 0.013 } },
  squats: { name: "Squats", icon: "🦵", measures: ["sets", "reps"], burn: { basis: "reps", kcalPerKgRep: 0.004 } },
  burpees: { name: "Burpees", icon: "🤸", measures: ["sets", "reps"], burn: { basis: "reps", kcalPerKgRep: 0.013 } },
  yoga: { name: "Yoga", icon: "🧘", measures: ["duration"], burn: { basis: "duration", met: 2.5 } },
  hike: { name: "Hiking", icon: "🥾", measures: ["distance", "duration"], burn: { basis: "distance", kcalPerKgKm: 0.7 } },
  row: { name: "Rowing", icon: "🚣", measures: ["distance", "duration"], burn: { basis: "distance", kcalPerKgKm: 0.8 } },
  elliptical: { name: "Elliptical", icon: "⚙️", measures: ["duration"], burn: { basis: "duration", met: 5 } },
  stairs: { name: "Stair climbing", icon: "🪜", measures: ["duration"], burn: { basis: "duration", met: 8 } },
  hiit: { name: "HIIT", icon: "⏱️", measures: ["duration"], burn: { basis: "duration", met: 8 } },
  pilates: { name: "Pilates", icon: "🤸", measures: ["duration"], burn: { basis: "duration", met: 3 } },
  stretch: { name: "Stretching", icon: "🙆", measures: ["duration"], burn: { basis: "duration", met: 2.3 } },
  climb: { name: "Climbing", icon: "🧗", measures: ["duration"], burn: { basis: "duration", met: 7 } },
  tennis: { name: "Tennis", icon: "🎾", measures: ["duration"], burn: { basis: "duration", met: 7 } },
  badminton: { name: "Badminton", icon: "🏸", measures: ["duration"], burn: { basis: "duration", met: 5.5 } },
  football: { name: "Football", icon: "⚽", measures: ["duration"], burn: { basis: "duration", met: 7 } },
  basketball: { name: "Basketball", icon: "🏀", measures: ["duration"], burn: { basis: "duration", met: 6.5 } },
  dance: { name: "Dancing", icon: "💃", measures: ["duration"], burn: { basis: "duration", met: 5 } },
  skate: { name: "Skating", icon: "⛸️", measures: ["duration"], burn: { basis: "duration", met: 7 } },
  ski: { name: "Skiing", icon: "⛷️", measures: ["duration", "distance"], burn: { basis: "duration", met: 5.3 } },
};

const isUuid = (s: string) => z.uuid().safeParse(s).success;

/** Parses one converted row with the API's own schema, naming the prototype row when it doesn't fit. */
function strict<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequest({ reason: `Can't import ${what}`, issues: parsed.error.issues });
  return parsed.data;
}

const upgradeFrom = (from: string) => (from === "" ? BEGINNING : from);

/** Exports before provenance had one source; a package label was the only checked one. */
const legacyProvenance = { package: {}, database: { origin: "open-food-facts" }, reference: { origin: "usda" }, typed: { origin: "estimate" } } as const;

function upgradeLabel({ source, ...rest }: z.infer<typeof label>) {
  const upgraded = { ...rest, from: upgradeFrom(rest.from) };
  if (typeof source !== "string" || !(source in legacyProvenance)) return upgraded;
  return { ...upgraded, verified: source === "package", ...legacyProvenance[source as keyof typeof legacyProvenance] };
}

async function accountIsEmpty(tx: Tx, userId: string) {
  const counts = [
    await tx.select({ n: count() }).from(foodsTable).where(eq(foodsTable.userId, userId)),
    await tx.select({ n: count() }).from(entriesTable).where(eq(entriesTable.userId, userId)),
    await tx.select({ n: count() }).from(activitiesTable).where(eq(activitiesTable.userId, userId)),
    await tx.select({ n: count() }).from(weighInsTable).where(eq(weighInsTable.userId, userId)),
    await tx.select({ n: count() }).from(potsTable).where(eq(potsTable.userId, userId)),
  ];
  return counts.every(([row]) => row!.n === 0);
}

/**
 * Moves a prototype export into an empty account, once. Non-UUID ids (seed items, built-in
 * activities) get new UUIDs, entry-only labels become uncatalogued items, named lines logged
 * together become one-off combos, and typed exercise names become activities.
 */
export async function importExport(userId: string, req: ImportRequest) {
  const parsed = legacyData.safeParse(req.data);
  if (!parsed.success) throw new BadRequest({ reason: "Not a Dash export this server can read", issues: parsed.error.issues });
  const data = parsed.data;

  return db.transaction(async (tx) => {
    if (!(await accountIsEmpty(tx, userId))) throw new Conflict({ reason: "Imports go into an empty account only" });

    const ids = new Map<string, string>();
    const idFor = (legacy: string) => {
      if (isUuid(legacy)) return legacy;
      let id = ids.get(legacy);
      if (!id) ids.set(legacy, (id = randomUUID()));
      return id;
    };

    const legacyFoods = new Map(data["dash.foods.v1"].map((f) => [f.id, f]));
    const kindOf = (legacyId: string | undefined) => (legacyId ? legacyFoods.get(legacyId)?.kind : undefined);
    const foods: { input: FoodInput; deleted: boolean }[] = [];
    const batches: { recipeId: string; batch: Batch; deleted: boolean }[] = [];

    for (const f of data["dash.foods.v1"]) {
      const common = { id: idFor(f.id), name: f.name.trim() || "Unnamed", iconAuto: !f.icon, catalogued: true };
      if (f.kind === "item") {
        const input = { ...common, kind: "item", icon: f.icon ?? autoFoodIcon(f.name, "item", f.unit), unit: f.unit, variant: f.variant, barcode: f.barcode || undefined, notFluid: !!f.notFluid, unsure: !!f.unsure, labels: f.labels.map(upgradeLabel), servings: f.servings };
        foods.push({ input: strict(foodInputSchema, input, `item "${f.name}"`), deleted: !!f.deleted });
      } else if (f.kind === "recipe") {
        foods.push({ input: strict(foodInputSchema, { ...common, kind: "recipe", icon: f.icon ?? autoFoodIcon(f.name, "recipe") }, `recipe "${f.name}"`), deleted: !!f.deleted });
        for (const b of f.batches) {
          const ingredients = b.ingredients.filter((p) => kindOf(p.foodId) === "item").map((p) => ({ ...p, foodId: idFor(p.foodId) }));
          const batch = strict(batchSchema, { ...b, id: idFor(b.id), ingredients, gone: !!b.gone }, `a batch of "${f.name}"`);
          batches.push({ recipeId: common.id, batch, deleted: false });
        }
      } else {
        const parts = f.parts.filter((p) => kindOf(p.foodId) === "item" || kindOf(p.foodId) === "recipe").map((p) => ({ foodId: idFor(p.foodId), amount: p.amount }));
        foods.push({ input: strict(foodInputSchema, { ...common, kind: "combo", icon: f.icon ?? autoFoodIcon(f.name, "combo"), parts }, `combo "${f.name}"`), deleted: !!f.deleted });
      }
    }
    const batchIds = new Set(batches.map((b) => b.batch.id));

    const activities: { input: ActivityInput; deleted: boolean }[] = [];
    const activityIds = new Map<string, string>();
    for (const a of data["dash.activities.v1"]) {
      const input = strict(activityInputSchema, { id: idFor(a.id), name: a.name, icon: a.icon ?? autoActivityIcon(a.name), iconAuto: !a.icon, measures: a.measures, burn: a.burn }, `activity "${a.name}"`);
      activities.push({ input, deleted: !!a.deleted });
      activityIds.set(a.id, input.id);
    }
    const publicKeys = new Set(publicActivities.map((p) => p.key));
    const byName = new Map<string, string>();
    const activityFor = (legacyId: string | undefined, rawName: string | undefined, measures: string[]) => {
      if (legacyId && activityIds.has(legacyId)) return activityIds.get(legacyId)!;
      if (legacyId && publicKeys.has(legacyId)) return publicActivityId(legacyId);
      const builtIn = legacyId ? legacyBuiltIns[legacyId] : undefined;
      if (builtIn && legacyId) {
        const input = { ...builtIn, id: idFor(legacyId), iconAuto: false };
        activities.push({ input, deleted: false });
        activityIds.set(legacyId, input.id);
        return input.id;
      }
      const name = rawName?.trim() || "Exercise";
      const known = byName.get(name.toLowerCase());
      if (known) return known;
      const keys = measures.filter((m): m is MeasureKey => ["distance", "duration", "sets", "reps", "weight", "laps"].includes(m));
      const input: ActivityInput = { id: randomUUID(), name, icon: autoActivityIcon(name), iconAuto: true, measures: keys.length ? keys : ["duration"] };
      activities.push({ input, deleted: false });
      byName.set(name.toLowerCase(), input.id);
      return input.id;
    };

    const entries: { input: EntryInput; createdAt: Date }[] = [];
    for (const e of data["dash.entries.v1"]) {
      if (e.kind === "exercise") {
        const input = { id: idFor(e.id), kind: "exercise", when: e.when, activityId: activityFor(e.activityId, e.rawName, Object.keys(e.measures)), measures: e.measures, kcal: e.kcal, kcalManual: !!e.kcalManual };
        entries.push({ input: strict(entryInputSchema, input, `an exercise entry from ${e.createdAt}`), createdAt: new Date(e.createdAt) });
        continue;
      }
      const lines: Line[] = e.lines.map((l) => {
        const legacyFoodId = l.recipeId ?? l.itemId;
        const kind = kindOf(legacyFoodId);
        let foodId = kind === "item" || kind === "recipe" ? idFor(legacyFoodId!) : undefined;
        if (!foodId && l.own) {
          const name = l.rawName?.trim() || "Entry-only label";
          const own = { id: randomUUID(), kind: "item", name, icon: autoFoodIcon(name, "item", l.own.unit), iconAuto: true, catalogued: false, unit: l.own.unit, notFluid: false, unsure: false, labels: l.own.labels.map(upgradeLabel), servings: l.own.servings };
          foods.push({ input: strict(foodInputSchema, own, `the entry-only label "${name}"`), deleted: false });
          foodId = own.id;
        }
        const batchId = kind === "recipe" && l.batchId && batchIds.has(idFor(l.batchId)) ? idFor(l.batchId) : undefined;
        return { id: idFor(l.id), foodId, batchId, rawName: l.rawName ?? (legacyFoodId && !foodId ? legacyFoods.get(legacyFoodId)?.name : undefined), barcode: l.barcode, amount: l.amount, base: l.base } as Line;
      });
      let comboId = e.comboId && kindOf(e.comboId) === "combo" ? idFor(e.comboId) : undefined;
      if (!comboId && e.title?.trim()) {
        const combo = { id: randomUUID(), kind: "combo", name: e.title.trim(), icon: autoFoodIcon(e.title, "combo"), iconAuto: true, catalogued: false, parts: lines.filter((l) => l.foodId).map((l) => ({ foodId: l.foodId, amount: l.amount })) };
        foods.push({ input: strict(foodInputSchema, combo, `the combo "${e.title}"`), deleted: false });
        comboId = combo.id;
      }
      const input = { id: idFor(e.id), kind: "food", when: e.when, via: e.via, comboId, lines };
      entries.push({ input: strict(entryInputSchema, input, `a food entry from ${e.createdAt}`), createdAt: new Date(e.createdAt) });
    }

    const order = { item: 0, recipe: 1, combo: 2 } as const;
    for (const f of [...foods].sort((a, b) => order[a.input.kind] - order[b.input.kind])) await insertFood(tx, { userId }, f.input, { revision: 1, deleted: f.deleted });
    for (const b of batches) await insertBatch(tx, b.recipeId, b.batch, userId, { revision: 1, deleted: b.deleted });
    for (const a of activities) await insertActivity(tx, { userId }, a.input, { revision: 1, deleted: a.deleted });
    for (const e of entries) await insertEntry(tx, userId, e.input, { revision: 1, deleted: false }, e.createdAt);

    const weighIns = [...new Map(data["dash.weighIns.v1"].map((w) => [w.date, w])).values()];
    if (weighIns.length) await tx.insert(weighInsTable).values(weighIns.map((w) => ({ id: idFor(w.id), userId, date: w.date, kg: w.kg })));

    const p = data["dash.profile.v1"];
    const pots = p.pots ?? [];
    if (pots.length) await tx.insert(potsTable).values(pots.map((pot) => ({ id: idFor(pot.id), userId, name: pot.name, grams: pot.grams })));

    await ensureProfile(tx, userId);
    const row = (await getProfileRow(tx, userId, { lock: true }))!;
    const profile = strict(profileInputSchema, { units: p.units ?? "metric", heightCm: p.heightCm, birthday: p.birthday, sex: p.sex, dayEndsAt: p.dayEndsAt ?? 0, clock: p.clock }, "the profile");
    await updateProfile(tx, userId, profile, row.revision + 1);
    const current = { goal: p.goal, metabolismMultiplier: p.metabolismMultiplier, calibratedFrom: p.calibratedFrom, fluidGoalMl: p.fluidGoalMl, macroPlan: p.macroPlan };
    const history = p.planHistory?.length ? p.planHistory.map((h) => ({ from: upgradeFrom(h.from), plan: h.plan })) : p.goal ? [{ from: BEGINNING, plan: current }] : [];
    if (history.length) {
      const versions: PlanVersion[] = history.map((h) => ({ from: h.from, plan: strict(planSchema, h.plan, `the plan from ${h.from}`) }));
      await replacePlanVersions(tx, userId, versions, row.planRevision + 1);
    }

    return { foods: foods.length, entries: entries.length, activities: activities.length, weighIns: weighIns.length, pots: pots.length };
  });
}
