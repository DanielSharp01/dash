import { z } from "zod";

/**
 * A version start before every date key: the plain string sorts below any "YYYY-MM-DD",
 * and it is how Postgres spells its earliest date, so it passes through the API unchanged.
 */
export const BEGINNING = "-infinity";

const isCalendarDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const idSchema = z.uuid();
export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate, "Not a calendar date");
export const versionStartSchema = z.union([dateKeySchema, z.literal(BEGINNING)]);
export const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const name = z.string().trim().min(1).max(200);
const amountNumber = z.number().nonnegative();
const positive = z.number().positive();

export const nutrientKeys = ["kcal", "fat", "saturates", "carbs", "sugars", "protein", "salt", "caffeine"] as const;
export const nutrientKeySchema = z.enum(nutrientKeys);
/** kcal, grams, and caffeine in mg. An absent key is missing, never zero. */
export const nutrientsSchema = z.partialRecord(nutrientKeySchema, amountNumber);

/** g and ml come from a per-100 label or a weighed serving; piece from a serving with no size. */
export const foodUnitSchema = z.enum(["g", "ml", "piece"]);
/** Provenance only: a typed value is as known as a printed one. */
export const labelSourceSchema = z.enum(["package", "database", "reference", "typed"]);

/** Values as printed on the package: per 100 of the item's unit, or per serving. */
export const labelSchema = z.object({
  from: versionStartSchema,
  per: z.enum(["100", "serving"]),
  /** In the item's unit. Absent on a piece item, where the serving is one piece. */
  servingSize: positive.optional(),
  servingName: z.string().max(200).optional(),
  /** "Per serving (2 cookies)": the serving is this many of a countable piece. */
  servingPieces: z.object({ count: positive, name: z.string().max(200) }).optional(),
  values: nutrientsSchema,
  source: labelSourceSchema,
});

/** A named portion in the item's unit; the size can wait, e.g. "bowl" typed while logging. */
export const servingSchema = z.object({ name, size: positive.optional() });

export const amountSchema = z.object({
  value: amountNumber.optional(),
  /** A common unit, a serving name, or "portion" for recipes sized in portions. */
  unit: z.string().max(100).optional(),
});

/** An item or recipe with an amount, as a recipe ingredient or a combo part. */
export const portionSchema = z.object({
  foodId: idSchema,
  amount: amountSchema,
  /** See Line.base; set on recipe ingredients, left out on combo parts, which are templates. */
  base: amountNumber.optional(),
});

const foodCommon = {
  id: idSchema,
  name,
  icon: z.string().min(1).max(32),
  /** On: the client keeps the icon following the name's suggestion. Off: picked by hand. */
  iconAuto: z.boolean(),
  /** Off for entry-only labels and one-off combos, which never show in lists, search or cards. */
  catalogued: z.boolean(),
  /** Duplicated from this public item; provenance only. */
  originId: idSchema.optional(),
};

const distinct = <T>(values: T[]) => new Set(values).size === values.length;

export const foodItemInputSchema = z
  .object({
    ...foodCommon,
    kind: z.literal("item"),
    unit: foodUnitSchema,
    /** Tells apart products that share a name: brand, store, raw or cooked. */
    variant: z.string().trim().max(200).optional(),
    barcode: z.string().trim().min(1).max(64).optional(),
    /** ml items count as fluid unless this is set, e.g. oil or syrup. */
    notFluid: z.boolean(),
    /** Logged before anyone filled it in; these are what follow-up is about. */
    unsure: z.boolean(),
    /** Oldest first. */
    labels: z.array(labelSchema).max(200),
    servings: z.array(servingSchema).max(100),
  })
  .refine((f) => distinct(f.labels.map((l) => l.from)), { message: "Two labels start on the same day", path: ["labels"] })
  .refine((f) => distinct(f.servings.map((s) => s.name.toLowerCase())), { message: "Two servings share a name", path: ["servings"] });

export const recipeInputSchema = z.object({ ...foodCommon, kind: z.literal("recipe") });

/** Put together and eaten at once, so each part's amount can change at log time. */
export const comboInputSchema = z.object({
  ...foodCommon,
  kind: z.literal("combo"),
  parts: z.array(portionSchema.omit({ base: true })).max(100),
});

export const foodInputSchema = z.discriminatedUnion("kind", [foodItemInputSchema, recipeInputSchema, comboInputSchema]);

export const batchYieldSchema = z.union([z.strictObject({ grams: positive }), z.strictObject({ portions: positive })]);

/** One cooking. Weighing the finished dish absorbs whatever water was gained or lost. */
export const batchSchema = z.object({
  id: idSchema,
  madeOn: dateKeySchema,
  ingredients: z.array(portionSchema).max(200),
  /** Absent while still cooking. */
  yield: batchYieldSchema.optional(),
  /** All eaten, so it no longer shows among the things to log. */
  gone: z.boolean(),
});

const stored = {
  /** Goes up on every save; a save must send the revision it read. */
  revision: z.number().int().min(1),
  /** Hidden from lists and search, but kept because past entries still point at it. */
  deleted: z.boolean(),
};
const publicFlags = {
  /** Read-only and shared by everyone; defined in the server's seeds. */
  public: z.boolean(),
  /** Shown as a card before the person has logged it. */
  starter: z.boolean(),
};

export const storedBatchSchema = batchSchema.extend(stored);

export const foodItemSchema = foodItemInputSchema.safeExtend({ ...stored, ...publicFlags });
export const recipeSchema = recipeInputSchema.extend({ ...stored, ...publicFlags, batches: z.array(storedBatchSchema) });
export const comboSchema = comboInputSchema.extend({ ...stored, ...publicFlags });
export const foodSchema = z.discriminatedUnion("kind", [foodItemSchema, recipeSchema, comboSchema]);

export const measureKeys = ["distance", "duration", "sets", "reps", "weight", "laps"] as const;
export const measureKeySchema = z.enum(measureKeys);

/**
 * Each factor is per kg of body weight and excludes resting burn, since the app adds
 * exercise on top of a normal day. Lifting is time-based: volume predicts energy poorly.
 */
export const burnSchema = z.discriminatedUnion("basis", [
  z.object({ basis: z.literal("distance"), kcalPerKgKm: positive }),
  z.object({ basis: z.literal("reps"), kcalPerKgRep: positive }),
  z.object({ basis: z.literal("duration"), met: positive }),
]);

export const activityInputSchema = z.object({
  id: idSchema,
  name,
  icon: z.string().min(1).max(32),
  iconAuto: z.boolean(),
  measures: z.array(measureKeySchema).refine(distinct, "Measures repeat"),
  /** How the extra calories are worked out; other measures are only recorded. */
  burn: burnSchema.optional(),
  originId: idSchema.optional(),
});
export const activitySchema = activityInputSchema.extend({ ...stored, ...publicFlags });

export const dayParts = ["dawn", "morning", "afternoon", "evening", "night"] as const;
export const dayPartSchema = z.enum(dayParts);

/** Approximate times stay approximate: a part of day is never stored as a clock time. */
export const whenSchema = z.discriminatedUnion("kind", [
  z.object({ date: dateKeySchema, kind: z.literal("now"), time: clockTimeSchema }),
  z.object({ date: dateKeySchema, kind: z.literal("exact"), time: clockTimeSchema }),
  z.object({ date: dateKeySchema, kind: z.literal("part"), part: dayPartSchema }),
  z.object({ date: dateKeySchema, kind: z.literal("day") }),
]);

export const lineSchema = z.object({
  id: idSchema,
  /** An item, a recipe or an uncatalogued item. Absent on a bare typed name. */
  foodId: idSchema.optional(),
  /** Only with a recipe. */
  batchId: idSchema.optional(),
  /** What was typed or scanned; stays as history once linked. */
  rawName: z.string().max(200).optional(),
  barcode: z.string().max(64).optional(),
  amount: amountSchema,
  /**
   * The amount in the food's own unit when it was logged, so redefining a serving later
   * doesn't change history. Absent while the amount couldn't be converted, e.g. "1 bowl".
   */
  base: amountNumber.optional(),
});

export const measureValueSchema = z.object({ value: amountNumber, unit: z.string().min(1).max(20) });

export const foodEntryInputSchema = z.object({
  id: idSchema,
  kind: z.literal("food"),
  when: whenSchema,
  /** Which verb logged it; decides fluid for things that aren't identified yet. */
  via: z.enum(["ate", "drank"]),
  comboId: idSchema.optional(),
  lines: z.array(lineSchema).max(100),
});

export const exerciseEntryInputSchema = z.object({
  id: idSchema,
  kind: z.literal("exercise"),
  when: whenSchema,
  activityId: idSchema,
  measures: z.partialRecord(measureKeySchema, measureValueSchema),
  /** Burn on the day, taken when saved; absent is missing. */
  kcal: amountNumber.optional(),
  /** Typed by the person, so editing the measures doesn't recalculate it. */
  kcalManual: z.boolean(),
});

export const entryInputSchema = z.discriminatedUnion("kind", [foodEntryInputSchema, exerciseEntryInputSchema]);

const entryStored = { ...stored, createdAt: z.string() };
export const foodEntrySchema = foodEntryInputSchema.extend(entryStored);
export const exerciseEntrySchema = exerciseEntryInputSchema.extend(entryStored);
export const entrySchema = z.discriminatedUnion("kind", [foodEntrySchema, exerciseEntrySchema]);

export const macroPresetSchema = z.enum(["balanced", "high-protein", "low-carb", "keto", "low-fat"]);
const share = z.number().min(0).max(1);

/** Protein is per kg; one of fat or carbs is a share of calories and the other takes the rest. */
export const macroPlanSchema = z
  .object({ preset: macroPresetSchema, proteinPerKg: amountNumber, fatPct: share.optional(), carbPct: share.optional() })
  .refine((m) => (m.fatPct === undefined) !== (m.carbPct === undefined), "Exactly one of fatPct and carbPct");

/** The fields that define a day's budget; changing them doesn't rewrite how past days look. */
export const planSchema = z.object({
  /** Dash only supports losing or holding weight; 0 is maintain. */
  goal: z.object({ kgPerWeek: amountNumber, targetKg: positive.optional() }),
  /**
   * Resting burn × this = a day's burn without logged exercise. It stands for everything Dash
   * doesn't log: daily movement, build, and the formula's own error. 1.2 is a desk day.
   */
  metabolismMultiplier: positive,
  /** Set when the multiplier was worked out from a known maintenance intake rather than picked. */
  calibratedFrom: z.object({ maintenanceKcal: positive, loggedExerciseKcal: amountNumber }).optional(),
  fluidGoalMl: amountNumber,
  macroPlan: macroPlanSchema,
});

export const planVersionSchema = z.object({ from: versionStartSchema, plan: planSchema });
/** Oldest first; the newest version is the current plan. */
export const planHistorySchema = z.object({ versions: z.array(planVersionSchema), revision: z.number().int().min(1) });

export const unitSystemSchema = z.enum(["metric", "imperial"]);

export const profileInputSchema = z.object({
  units: unitSystemSchema,
  heightCm: positive.optional(),
  birthday: dateKeySchema.optional(),
  /** Only for the resting-burn formula, which was fitted on male and female bodies. */
  sex: z.enum(["male", "female"]).optional(),
  /** Hour (0–6) when the day rolls over; staying up past midnight still counts as the evening before. */
  dayEndsAt: z.number().int().min(0).max(6),
});
export const profileSchema = profileInputSchema.extend({ revision: z.number().int().min(1) });

/** Weighed once, so a finished dish can be weighed in its pot. */
export const potSchema = z.object({ id: idSchema, name, grams: positive });
export const weighInSchema = z.object({ id: idSchema, date: dateKeySchema, kg: positive });

export const partSchema = z.object({
  value: z.number(),
  /** Lines with no value, or only part of one. */
  missing: z.number().int(),
});
export const dayTotalsSchema = z.object({
  kcal: partSchema,
  protein: partSchema,
  carbs: partSchema,
  fat: partSchema,
  fluid: partSchema,
  burned: z.number(),
});
export const previewSchema = z.object({
  days: z.array(z.object({ date: dateKeySchema, before: dayTotalsSchema, after: dayTotalsSchema })),
});

const revisionField = { revision: z.number().int().min(1) };
const newFoodsField = { newFoods: z.array(foodInputSchema).max(50).optional() };
const newActivitiesField = { newActivities: z.array(activityInputSchema).max(20).optional() };

export const createdSchema = z.object({ newFoods: z.array(foodSchema), newActivities: z.array(activitySchema) });
const undoFields = { undoToken: z.string(), undoExpiresAt: z.string() };

export const meResponseSchema = z.object({
  user: z.object({ id: idSchema, email: z.string().nullable(), name: z.string().nullable() }),
  profile: profileSchema,
  plan: planHistorySchema,
  pots: z.array(potSchema),
});

export const updateProfileRequestSchema = profileInputSchema.extend(revisionField);

export const savePlanRequestSchema = z.object({
  plan: planSchema,
  /** "fix" rewrites the newest version; a date starts a new version there and drops later ones. */
  change: z.union([z.literal("fix"), z.object({ from: dateKeySchema })]),
  revision: z.number().int().min(1),
});

export const weighInsResponseSchema = z.object({ weighIns: z.array(weighInSchema) });

export const foodsResponseSchema = z.object({ foods: z.array(foodSchema) });

export const usageResponseSchema = z.object({
  usage: z.array(
    z.object({
      foodId: idSchema,
      /** The last entry logged as this food: as its combo, or as its only line. Absent when only ever part of a bigger entry. */
      lastLoggedAt: z.string().optional(),
      ate30d: z.number().int(),
      drank30d: z.number().int(),
      /** From the last time it was logged on its own. */
      usualAmount: amountSchema.optional(),
      /** Live entries with a line on the food, plus entries logged as the combo. */
      uses: z.number().int(),
    }),
  ),
});

export const activityUsageResponseSchema = z.object({
  /** Newest first. */
  usage: z.array(z.object({ activityId: idSchema, lastLoggedAt: z.string() })),
});

export const createFoodRequestSchema = z.intersection(foodInputSchema, z.object(newFoodsField));
export const createFoodResponseSchema = createdSchema.extend({ food: foodSchema });
export const updateFoodRequestSchema = z.intersection(foodInputSchema, z.object({ ...revisionField, ...newFoodsField }));
export const updateFoodResponseSchema = createdSchema.extend({ food: foodSchema, ...undoFields });

export const saveBatchRequestSchema = batchSchema.extend({
  /** 0 creates the batch. */
  revision: z.number().int().min(0),
  ...newFoodsField,
});
export const saveBatchResponseSchema = createdSchema.extend({ batch: storedBatchSchema });

export const activitiesResponseSchema = z.object({ activities: z.array(activitySchema) });
export const updateActivityRequestSchema = activityInputSchema.extend(revisionField);

export const entriesQuerySchema = z.object({ from: dateKeySchema, to: dateKeySchema, foodId: idSchema.optional() });
export const entriesResponseSchema = z.object({ entries: z.array(entrySchema) });
export const createEntryRequestSchema = z.intersection(entryInputSchema, z.object({ ...newFoodsField, ...newActivitiesField }));
export const updateEntryRequestSchema = z.intersection(
  entryInputSchema,
  z.object({ ...revisionField, ...newFoodsField, ...newActivitiesField }),
);
export const entryResponseSchema = createdSchema.extend({ entry: entrySchema });

export const followUpResponseSchema = z.object({
  /** Most used first. */
  unsureItems: z.array(z.object({ foodId: idSchema, entryIds: z.array(idSchema), usedByFoodIds: z.array(idSchema) })),
  /** Lines with missing calories, exercise with no kcal. */
  entries: z.array(entrySchema),
});

export const commandResultSchema = z.object({ foods: z.array(foodSchema), entries: z.array(entrySchema), ...undoFields });
export const mergeRequestSchema = z.object({ targetId: idSchema });
export const completeAsComboRequestSchema = z.object({ combo: comboInputSchema, ...newFoodsField });
export const reconvertRequestSchema = z.object({ lineIds: z.array(idSchema).min(1).max(1000) });
export const moveToBatchRequestSchema = z.object({ lineIds: z.array(idSchema).min(1).max(1000), batchId: idSchema });
export const undoResponseSchema = z.object({ foods: z.array(foodSchema), entries: z.array(entrySchema) });

export const openFoodFactsResultSchema = z.object({
  name: z.string(),
  brand: z.string().optional(),
  unit: z.enum(["g", "ml"]),
  label: labelSchema.optional(),
  servings: z.array(servingSchema),
});
export const barcodeResponseSchema = z.object({
  /** The person's own first, then public. */
  foods: z.array(foodSchema),
  openFoodFacts: openFoodFactsResultSchema.optional(),
});

export const iconGroupSchema = z.enum(["food", "drink", "activity"]);
export const iconsResponseSchema = z.object({
  icons: z.array(z.object({ icon: z.string(), group: iconGroupSchema, names: z.array(z.string()) })),
});

export const importRequestSchema = z.object({
  app: z.literal("dash"),
  version: z.union([z.literal(2), z.literal(3)]),
  exportedAt: z.string(),
  data: z.record(z.string(), z.unknown()),
});
export const importResponseSchema = z.object({
  foods: z.number().int(),
  entries: z.number().int(),
  activities: z.number().int(),
  weighIns: z.number().int(),
  pots: z.number().int(),
});

export type Id = z.infer<typeof idSchema>;
export type DateKey = z.infer<typeof dateKeySchema>;
export type VersionStart = z.infer<typeof versionStartSchema>;
export type NutrientKey = z.infer<typeof nutrientKeySchema>;
export type Nutrients = z.infer<typeof nutrientsSchema>;
export type FoodUnit = z.infer<typeof foodUnitSchema>;
export type LabelSource = z.infer<typeof labelSourceSchema>;
export type Label = z.infer<typeof labelSchema>;
export type Serving = z.infer<typeof servingSchema>;
export type Amount = z.infer<typeof amountSchema>;
export type Portion = z.infer<typeof portionSchema>;
export type FoodItemInput = z.infer<typeof foodItemInputSchema>;
export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type ComboInput = z.infer<typeof comboInputSchema>;
export type FoodInput = z.infer<typeof foodInputSchema>;
export type BatchYield = z.infer<typeof batchYieldSchema>;
export type Batch = z.infer<typeof batchSchema>;
export type StoredBatch = z.infer<typeof storedBatchSchema>;
export type FoodItem = z.infer<typeof foodItemSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type Combo = z.infer<typeof comboSchema>;
export type Food = z.infer<typeof foodSchema>;
export type MeasureKey = z.infer<typeof measureKeySchema>;
export type Burn = z.infer<typeof burnSchema>;
export type ActivityInput = z.infer<typeof activityInputSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type DayPart = z.infer<typeof dayPartSchema>;
export type When = z.infer<typeof whenSchema>;
export type Line = z.infer<typeof lineSchema>;
export type MeasureValue = z.infer<typeof measureValueSchema>;
export type FoodEntryInput = z.infer<typeof foodEntryInputSchema>;
export type ExerciseEntryInput = z.infer<typeof exerciseEntryInputSchema>;
export type EntryInput = z.infer<typeof entryInputSchema>;
export type FoodEntry = z.infer<typeof foodEntrySchema>;
export type ExerciseEntry = z.infer<typeof exerciseEntrySchema>;
export type Entry = z.infer<typeof entrySchema>;
export type MacroPreset = z.infer<typeof macroPresetSchema>;
export type MacroPlan = z.infer<typeof macroPlanSchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanVersion = z.infer<typeof planVersionSchema>;
export type PlanHistory = z.infer<typeof planHistorySchema>;
export type UnitSystem = z.infer<typeof unitSystemSchema>;
export type ProfileInput = z.infer<typeof profileInputSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Pot = z.infer<typeof potSchema>;
export type WeighIn = z.infer<typeof weighInSchema>;
export type Part = z.infer<typeof partSchema>;
export type DayTotals = z.infer<typeof dayTotalsSchema>;
export type Preview = z.infer<typeof previewSchema>;
export type Created = z.infer<typeof createdSchema>;
export type CommandResult = z.infer<typeof commandResultSchema>;
export type OpenFoodFactsResult = z.infer<typeof openFoodFactsResultSchema>;
export type IconGroup = z.infer<typeof iconGroupSchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type ImportResult = z.infer<typeof importResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type SavePlanRequest = z.infer<typeof savePlanRequestSchema>;
export type FoodUsage = z.infer<typeof usageResponseSchema>["usage"][number];
export type ActivityUsage = z.infer<typeof activityUsageResponseSchema>["usage"][number];
export type CreateFoodResponse = z.infer<typeof createFoodResponseSchema>;
export type UpdateFoodResponse = z.infer<typeof updateFoodResponseSchema>;
export type SaveBatchResponse = z.infer<typeof saveBatchResponseSchema>;
export type EntryResponse = z.infer<typeof entryResponseSchema>;
export type FollowUp = z.infer<typeof followUpResponseSchema>;
export type UndoResult = z.infer<typeof undoResponseSchema>;
export type BarcodeResult = z.infer<typeof barcodeResponseSchema>;
export type IconEntry = z.infer<typeof iconsResponseSchema>["icons"][number];
