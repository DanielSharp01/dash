import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const deletedAt = () => timestamp({ withTimezone: true });
const revision = () => integer().notNull().default(1);
const day = () => date({ mode: "string" });
/** '-infinity' sorts before every date, so a version with no start needs no special case. */
const versionStart = () => day().notNull().default(sql`'-infinity'`);

export const unitSystemEnum = pgEnum("unit_system", ["metric", "imperial"]);
export const sexEnum = pgEnum("sex", ["male", "female"]);
export const clockEnum = pgEnum("clock", ["24h", "12h"]);
export const macroPresetEnum = pgEnum("macro_preset", ["balanced", "high-protein", "low-carb", "keto", "low-fat"]);
export const foodKindEnum = pgEnum("food_kind", ["item", "recipe", "combo"]);
export const foodUnitEnum = pgEnum("food_unit", ["g", "ml", "piece"]);
export const labelPerEnum = pgEnum("label_per", ["100", "serving"]);
export const labelSourceEnum = pgEnum("label_source", ["package", "database", "reference", "typed"]);
export const measureKeyEnum = pgEnum("measure_key", ["distance", "duration", "sets", "reps", "weight", "laps"]);
export const burnBasisEnum = pgEnum("burn_basis", ["distance", "reps", "duration"]);
export const entryKindEnum = pgEnum("entry_kind", ["food", "exercise"]);
export const whenKindEnum = pgEnum("when_kind", ["now", "exact", "part", "day"]);
export const dayPartEnum = pgEnum("day_part", ["dawn", "morning", "afternoon", "evening", "night"]);
export const viaEnum = pgEnum("via", ["ate", "drank"]);

/** One row per person; Google's subject id is the stable key, since email can change. */
export const usersTable = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  googleSub: text().notNull().unique(),
  email: text(),
  name: text(),
  createdAt: createdAt(),
});

const owner = () =>
  uuid()
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" });
/** Null on public rows, which everyone can read and nobody can write through the API. */
const publicOwner = () => uuid().references(() => usersTable.id, { onDelete: "cascade" });

export const profilesTable = pgTable(
  "profiles",
  {
    userId: uuid()
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    units: unitSystemEnum().notNull().default("metric"),
    heightCm: doublePrecision(),
    birthday: day(),
    sex: sexEnum(),
    dayEndsAt: smallint().notNull().default(0),
    clock: clockEnum().notNull().default("24h"),
    autoRecap: boolean().notNull().default(true),
    timeZone: text(),
    /** Not part of the revisioned profile: devices only ever move it forward. */
    recapSeenOn: day(),
    revision: revision(),
    /** Bumped by every plan change; guards plan_versions as one document. */
    planRevision: integer().notNull().default(1),
  },
  (t) => [check("profiles_day_ends_at", sql`${t.dayEndsAt} between 0 and 6`)],
);

/** The plan history; the current plan is the newest row. */
export const planVersionsTable = pgTable(
  "plan_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    effectiveFrom: versionStart(),
    goalKgPerWeek: doublePrecision().notNull(),
    goalTargetKg: doublePrecision(),
    metabolismMultiplier: doublePrecision().notNull(),
    calibratedMaintenanceKcal: doublePrecision(),
    calibratedExerciseKcal: doublePrecision(),
    fluidGoalMl: doublePrecision().notNull(),
    macroPreset: macroPresetEnum().notNull(),
    proteinPerKg: doublePrecision().notNull(),
    fatPct: doublePrecision(),
    carbPct: doublePrecision(),
  },
  (t) => [
    unique().on(t.userId, t.effectiveFrom),
    check("plan_versions_calibrated", sql`(${t.calibratedMaintenanceKcal} is null) = (${t.calibratedExerciseKcal} is null)`),
    check("plan_versions_one_pct", sql`(${t.fatPct} is null) <> (${t.carbPct} is null)`),
  ],
);

export const weighInsTable = pgTable(
  "weigh_ins",
  {
    id: uuid().primaryKey(),
    userId: owner(),
    date: day().notNull(),
    kg: doublePrecision().notNull(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("weigh_ins_user_date_live").on(t.userId, t.date).where(sql`${t.deletedAt} is null`)],
);

export const potsTable = pgTable(
  "pots",
  {
    id: uuid().primaryKey(),
    userId: owner(),
    name: text().notNull(),
    grams: doublePrecision().notNull(),
    deletedAt: deletedAt(),
  },
  (t) => [index().on(t.userId)],
);

/** Items, recipes and combos share one id space, so lines, parts and recents can point at any kind. */
export const foodsTable = pgTable(
  "foods",
  {
    id: uuid().primaryKey(),
    userId: publicOwner(),
    kind: foodKindEnum().notNull(),
    /** False for entry-only labels and one-off combos, which never show in lists, search or cards. */
    catalogued: boolean().notNull().default(true),
    name: text().notNull(),
    icon: text().notNull(),
    iconAuto: boolean().notNull().default(true),
    unit: foodUnitEnum(),
    variant: text(),
    barcode: text(),
    notFluid: boolean().notNull().default(false),
    unsure: boolean().notNull().default(false),
    /** The key in backend/src/seeds/; public rows only. */
    publicKey: text().unique(),
    starter: boolean().notNull().default(false),
    /** Duplicated from this public item; provenance only. */
    originId: uuid(),
    deletedAt: deletedAt(),
    revision: revision(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("foods_id_kind").on(t.id, t.kind),
    foreignKey({ columns: [t.originId], foreignColumns: [t.id] }).onDelete("no action"),
    index().on(t.userId),
    index("foods_user_barcode").on(t.userId, t.barcode).where(sql`${t.barcode} is not null`),
    check("foods_item_unit", sql`(${t.kind} = 'item') = (${t.unit} is not null)`),
    check("foods_public_key", sql`(${t.userId} is null) = (${t.publicKey} is not null)`),
    check("foods_starter_public", sql`not ${t.starter} or ${t.userId} is null`),
  ],
);

/** Oldest first by effective_from. */
export const labelsTable = pgTable(
  "labels",
  {
    id: uuid().primaryKey().defaultRandom(),
    foodId: uuid()
      .notNull()
      .references(() => foodsTable.id, { onDelete: "cascade" }),
    effectiveFrom: versionStart(),
    per: labelPerEnum().notNull(),
    servingSize: doublePrecision(),
    servingName: text(),
    servingPiecesCount: doublePrecision(),
    servingPiecesName: text(),
    source: labelSourceEnum().notNull(),
    kcal: doublePrecision(),
    fat: doublePrecision(),
    saturates: doublePrecision(),
    carbs: doublePrecision(),
    sugars: doublePrecision(),
    protein: doublePrecision(),
    salt: doublePrecision(),
    caffeine: doublePrecision(),
  },
  (t) => [
    unique().on(t.foodId, t.effectiveFrom),
    check("labels_pieces", sql`(${t.servingPiecesCount} is null) = (${t.servingPiecesName} is null)`),
  ],
);

export const servingsTable = pgTable(
  "servings",
  {
    id: uuid().primaryKey().defaultRandom(),
    foodId: uuid()
      .notNull()
      .references(() => foodsTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    size: doublePrecision(),
    position: smallint().notNull(),
  },
  (t) => [uniqueIndex("servings_food_name").on(t.foodId, sql`lower(${t.name})`)],
);

/** One cooking. Both yields null means still cooking. */
export const batchesTable = pgTable(
  "batches",
  {
    id: uuid().primaryKey(),
    recipeId: uuid().notNull(),
    recipeKind: foodKindEnum().notNull().default("recipe"),
    madeOn: day().notNull(),
    yieldGrams: doublePrecision(),
    yieldPortions: doublePrecision(),
    gone: boolean().notNull().default(false),
    deletedAt: deletedAt(),
    revision: revision(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.recipeId, t.recipeKind], foreignColumns: [foodsTable.id, foodsTable.kind] }).onDelete("no action"),
    unique("batches_id_recipe").on(t.id, t.recipeId),
    index().on(t.recipeId),
    check("batches_recipe_kind", sql`${t.recipeKind} = 'recipe'`),
    check("batches_one_yield", sql`${t.yieldGrams} is null or ${t.yieldPortions} is null`),
  ],
);

/** No recipes inside recipes in the MVP: an ingredient is always an item. */
export const batchIngredientsTable = pgTable(
  "batch_ingredients",
  {
    id: uuid().primaryKey().defaultRandom(),
    batchId: uuid()
      .notNull()
      .references(() => batchesTable.id, { onDelete: "cascade" }),
    foodId: uuid().notNull(),
    foodKind: foodKindEnum().notNull().default("item"),
    amountValue: doublePrecision(),
    amountUnit: text(),
    base: doublePrecision(),
    position: smallint().notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.foodId, t.foodKind], foreignColumns: [foodsTable.id, foodsTable.kind] }).onDelete("no action"),
    index().on(t.batchId),
    index().on(t.foodId),
    check("batch_ingredients_item", sql`${t.foodKind} = 'item'`),
  ],
);

export const comboPartsTable = pgTable(
  "combo_parts",
  {
    id: uuid().primaryKey().defaultRandom(),
    comboId: uuid().notNull(),
    comboKind: foodKindEnum().notNull().default("combo"),
    /** An item or a recipe. */
    foodId: uuid()
      .notNull()
      .references(() => foodsTable.id, { onDelete: "no action" }),
    amountValue: doublePrecision(),
    amountUnit: text(),
    position: smallint().notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.comboId, t.comboKind], foreignColumns: [foodsTable.id, foodsTable.kind] }).onDelete("cascade"),
    index().on(t.comboId),
    index().on(t.foodId),
    check("combo_parts_combo", sql`${t.comboKind} = 'combo'`),
  ],
);

export const activitiesTable = pgTable(
  "activities",
  {
    id: uuid().primaryKey(),
    userId: publicOwner(),
    name: text().notNull(),
    icon: text().notNull(),
    iconAuto: boolean().notNull().default(true),
    measures: measureKeyEnum().array().notNull(),
    /** Null means no formula: kcal is typed or missing. */
    burnBasis: burnBasisEnum(),
    /** kcal/kg/km, kcal/kg/rep, or MET for duration. */
    burnFactor: doublePrecision(),
    publicKey: text().unique(),
    starter: boolean().notNull().default(false),
    originId: uuid(),
    deletedAt: deletedAt(),
    revision: revision(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ columns: [t.originId], foreignColumns: [t.id] }).onDelete("no action"),
    index().on(t.userId),
    check("activities_burn", sql`(${t.burnBasis} is null) = (${t.burnFactor} is null)`),
    check("activities_public_key", sql`(${t.userId} is null) = (${t.publicKey} is not null)`),
    check("activities_starter_public", sql`not ${t.starter} or ${t.userId} is null`),
  ],
);

export const entriesTable = pgTable(
  "entries",
  {
    id: uuid().primaryKey(),
    userId: owner(),
    kind: entryKindEnum().notNull(),
    whenDate: day().notNull(),
    whenKind: whenKindEnum().notNull(),
    whenTime: time(),
    whenPart: dayPartEnum(),
    via: viaEnum(),
    comboId: uuid(),
    comboKind: foodKindEnum(),
    activityId: uuid().references(() => activitiesTable.id, { onDelete: "no action" }),
    /** Burn on the day, a snapshot taken when saved; null is missing. */
    kcal: doublePrecision(),
    /** Typed, so editing the measures doesn't recalculate it. */
    kcalManual: boolean().notNull().default(false),
    deletedAt: deletedAt(),
    revision: revision(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ columns: [t.comboId, t.comboKind], foreignColumns: [foodsTable.id, foodsTable.kind] }).onDelete("no action"),
    index().on(t.userId, t.whenDate),
    check(
      "entries_when",
      sql`case ${t.whenKind}
        when 'part' then ${t.whenPart} is not null and ${t.whenTime} is null
        when 'day' then ${t.whenPart} is null and ${t.whenTime} is null
        else ${t.whenTime} is not null and ${t.whenPart} is null end`,
    ),
    check(
      "entries_kind",
      sql`case ${t.kind}
        when 'food' then ${t.via} is not null and ${t.activityId} is null and ${t.kcal} is null and not ${t.kcalManual}
        else ${t.activityId} is not null and ${t.via} is null and ${t.comboId} is null end`,
    ),
    check("entries_combo_kind", sql`(${t.comboId} is null) = (${t.comboKind} is null) and (${t.comboKind} is null or ${t.comboKind} = 'combo')`),
  ],
);

export const entryLinesTable = pgTable(
  "entry_lines",
  {
    id: uuid().primaryKey(),
    entryId: uuid()
      .notNull()
      .references(() => entriesTable.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    /** An item, a recipe, or an uncatalogued item. */
    foodId: uuid().references(() => foodsTable.id, { onDelete: "no action" }),
    /** Only with a recipe; the composite key keeps it a batch of that recipe. */
    batchId: uuid(),
    rawName: text(),
    barcode: text(),
    amountValue: doublePrecision(),
    amountUnit: text(),
    base: doublePrecision(),
  },
  (t) => [
    foreignKey({ columns: [t.batchId, t.foodId], foreignColumns: [batchesTable.id, batchesTable.recipeId] }).onDelete("no action"),
    index().on(t.entryId),
    index().on(t.foodId),
    index().on(t.batchId),
  ],
);

export const exerciseMeasuresTable = pgTable(
  "exercise_measures",
  {
    entryId: uuid()
      .notNull()
      .references(() => entriesTable.id, { onDelete: "cascade" }),
    key: measureKeyEnum().notNull(),
    value: doublePrecision().notNull(),
    unit: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.key] })],
);
