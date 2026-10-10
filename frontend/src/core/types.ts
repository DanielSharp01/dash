export type DayPart = "dawn" | "morning" | "afternoon" | "evening" | "night";

/** Approximate times stay approximate: a part of day is never stored as a clock time. */
export type When =
  | { date: string; kind: "now"; time: string }
  | { date: string; kind: "exact"; time: string }
  | { date: string; kind: "part"; part: DayPart }
  | { date: string; kind: "day" };

/** kcal, grams, and caffeine in mg. */
export type NutrientKey = "kcal" | "fat" | "saturates" | "carbs" | "sugars" | "protein" | "salt" | "caffeine";
export type Nutrients = Partial<Record<NutrientKey, number>>;

/** g and ml come from a per-100 label or a weighed serving; piece from a serving with no size. */
export type FoodUnit = "g" | "ml" | "piece";

/** Provenance only: a typed value is as known as a printed one. */
export type LabelSource = "package" | "database" | "reference" | "typed";

/**
 * A version start before every date key: the plain string sorts below any "YYYY-MM-DD",
 * and it is how Postgres spells its earliest date, so it passes through the API unchanged.
 */
export const BEGINNING = "-infinity";

/** Values as printed on the package: per 100 of the item's unit, or per serving. */
export interface Label {
  /** Date key the values apply from; BEGINNING is as far back as known. */
  from: string;
  per: "100" | "serving";
  /** In the item's unit. Absent on a piece item, where the serving is one piece. */
  servingSize?: number;
  servingName?: string;
  /** "Per serving (2 cookies)": the serving is this many of a countable piece. */
  servingPieces?: { count: number; name: string };
  values: Nutrients;
  source: LabelSource;
}

/** A named portion in the item's unit; the size can wait, e.g. "bowl" typed while logging. */
export interface Serving {
  name: string;
  size?: number;
}

/** What nutrition needs from anything eaten: an item, or the label on an entry-only line. */
export interface FoodData {
  unit: FoodUnit;
  /** Oldest first. */
  labels: Label[];
  servings: Serving[];
}

export interface Item extends FoodData {
  id: string;
  kind: "item";
  name: string;
  /** Tells apart products that share a name: brand, store, raw or cooked. */
  variant?: string;
  icon?: string;
  barcode?: string;
  /** ml items count as fluid unless this is set, e.g. oil or syrup. */
  notFluid?: boolean;
  /** Logged before anyone filled it in; these are what follow-up is about. */
  unsure?: boolean;
  /** Hidden from lists and search but kept, because past entries still use it. */
  deleted?: boolean;
}

export interface Amount {
  value?: number;
  /** A common unit, a serving name, or "portion" for recipes sized in portions. */
  unit?: string;
}

/** An item or recipe with an amount, as a recipe ingredient or a combo part. */
export interface Portion {
  foodId: string;
  amount: Amount;
  /** See Line.base; set on recipe ingredients, left out on combo parts, which are templates. */
  base?: number;
}

/** One cooking. Weighing the finished dish absorbs whatever water was gained or lost. */
export interface Batch {
  id: string;
  madeOn: string;
  ingredients: Portion[];
  /** Absent while still cooking. */
  yield?: { grams: number } | { portions: number };
  /** All eaten, so it no longer shows among the things to log. */
  gone?: boolean;
}

export interface Recipe {
  id: string;
  kind: "recipe";
  name: string;
  icon?: string;
  /** Oldest first. */
  batches: Batch[];
  deleted?: boolean;
}

/** Put together and eaten at once, so each part's amount can change at log time. */
export interface Combo {
  id: string;
  kind: "combo";
  name: string;
  icon?: string;
  parts: Portion[];
  deleted?: boolean;
}

export type Food = Item | Recipe | Combo;

export interface Line {
  id: string;
  itemId?: string;
  recipeId?: string;
  batchId?: string;
  /** What was typed or scanned. Names an entry-only line, and stays as history once linked. */
  rawName?: string;
  barcode?: string;
  amount: Amount;
  /**
   * The amount in the food's own unit when it was logged, so redefining a serving later
   * doesn't change history. Absent while the amount couldn't be converted, e.g. "1 bowl".
   */
  base?: number;
  /** An entry-only line's own label, in place of a catalogue item. */
  own?: FoodData;
}

export interface FoodEntry {
  id: string;
  kind: "food";
  when: When;
  createdAt: string;
  /** Which verb logged it; decides fluid for things that aren't identified yet. */
  via: "ate" | "drank";
  comboId?: string;
  /** Names lines logged together without saving a combo; with a combo, its current name shows instead. */
  title?: string;
  lines: Line[];
}

export interface Activity {
  id: string;
  name: string;
  icon: string;
  measures: ExerciseMeasureKey[];
  /** How the extra calories are worked out; other measures are only recorded. */
  burn?: Burn;
  /** Built-ins live in code; editing one stores a copy under the same id. */
  builtIn?: boolean;
  deleted?: boolean;
}

/**
 * Each factor is per kg of body weight and excludes resting burn, since the app adds
 * exercise on top of a normal day. Lifting is time-based: volume predicts energy poorly.
 */
export type Burn =
  | { basis: "distance"; kcalPerKgKm: number }
  | { basis: "reps"; kcalPerKgRep: number }
  | { basis: "duration"; met: number };

export type ExerciseMeasureKey = "distance" | "duration" | "sets" | "reps" | "weight" | "laps";

export interface ExerciseEntry {
  id: string;
  kind: "exercise";
  when: When;
  createdAt: string;
  activityId?: string;
  rawName?: string;
  measures: Partial<Record<ExerciseMeasureKey, { value: number; unit: string }>>;
  kcal?: number;
  /** The person typed the calories instead of taking the calculated burn. */
  kcalManual?: boolean;
}

export type Entry = FoodEntry | ExerciseEntry;
