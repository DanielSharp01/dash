export type DayPart = "dawn" | "morning" | "afternoon" | "evening" | "night";

/** Approximate times stay approximate: a part of day is never stored as a clock time. */
export type When =
  | { date: string; kind: "now"; time: string }
  | { date: string; kind: "exact"; time: string }
  | { date: string; kind: "part"; part: DayPart }
  | { date: string; kind: "day" };

export type BaseUnit = "g" | "ml" | "piece";

/**
 * A named portion defined in the base unit or in another measure, so "1 pack = 20 slice"
 * and "1 slice = 30 g" chain to 600 g. Only measures listed earlier may be referenced.
 */
export interface Measure {
  label: string;
  qty: number;
  unit: string;
}

export interface Nutrition {
  kcal: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

/** Values as published from a day on (a date key); "" means as far back as known. */
export interface NutritionVersion extends Nutrition {
  from: string;
}

export interface Item {
  id: string;
  name: string;
  /** Tells apart things that share a name: a product's brand, a recipe's batch or version. */
  variant?: string;
  type: "item" | "recipe";
  barcode?: string;
  baseUnit: BaseUnit;
  measures: Measure[];
  /** Oldest first. Per 100 g/ml, or per piece when baseUnit is "piece". */
  nutrition?: NutritionVersion[];
  /** Created from a capture and not yet filled in; these are what follow-up is about. */
  provisional?: boolean;
  icon?: string;
  /** Counted toward the day's fluid; only offered for items measured in ml. */
  fluid?: boolean;
  /** Hidden from lists and search but kept, because past entries still use it. */
  deleted?: boolean;
  /**
   * Published for everyone. One way only: it stays in the library. Without a server the library
   * is local, so this is a flag rather than a move.
   */
  library?: boolean;
}

export interface Amount {
  value?: number;
  /** A common unit or one of the selected item's measure labels. */
  unit?: string;
}

export interface Estimate {
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export type FollowUp = "needs-follow-up" | "done-with-item" | "done-with-estimate";

export interface FoodEntry {
  id: string;
  kind: "food";
  when: When;
  createdAt: string;
  itemId?: string;
  /** What was typed at capture. Kept as history after the entry is linked to an item. */
  rawName?: string;
  barcode?: string;
  /** Free text on a calorie-only entry, e.g. "forgot to log lunch". */
  note?: string;
  amount: Amount;
  estimate?: Estimate;
  followUp: FollowUp;
}

export interface Activity {
  id: string;
  name: string;
  icon: string;
  measures: ExerciseMeasureKey[];
  /** Where a recording of this activity can come from; the spec starts with GPX. */
  imports?: ImportSource[];
  /** How the extra calories are worked out; other measures are only recorded. */
  burn?: Burn;
  /** Same as items: published one way, and hidden rather than removed while entries use it. */
  library?: boolean;
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

export type ImportSource = "gpx" | "fit" | "health-connect";

export type ExerciseMeasureKey = "distance" | "duration" | "sets" | "reps" | "weight" | "laps";

export interface ExerciseEntry {
  id: string;
  kind: "exercise";
  when: When;
  createdAt: string;
  activityId?: string;
  rawName?: string;
  measures: Partial<Record<ExerciseMeasureKey, { value: number; unit: string }>>;
  kcalEstimate?: number;
  /** The person typed the calories instead of taking the calculated burn. */
  kcalManual?: boolean;
  followUp: FollowUp;
}

export type Entry = FoodEntry | ExerciseEntry;
