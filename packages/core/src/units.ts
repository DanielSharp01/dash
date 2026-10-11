import type { UnitSystem } from "./schemas";

const LB = 0.45359237;
const INCH = 2.54;

const round1 = (n: number) => Math.round(n * 10) / 10;

export const weightUnit = (u: UnitSystem) => (u === "metric" ? "kg" : "lb");
export const toDisplayWeight = (kg: number, u: UnitSystem) => round1(u === "metric" ? kg : kg / LB);
export const fromDisplayWeight = (n: number, u: UnitSystem) => (u === "metric" ? n : n * LB);
export const formatWeight = (kg: number, u: UnitSystem) => `${toDisplayWeight(kg, u)} ${weightUnit(u)}`;

export function formatHeight(cm: number, u: UnitSystem) {
  if (u === "metric") return `${Math.round(cm)} cm`;
  const { ft, inch } = toFeet(cm);
  return `${ft}′${inch}″`;
}

export function toFeet(cm: number) {
  const total = Math.round(cm / INCH);
  return { ft: Math.floor(total / 12), inch: total % 12 };
}

export const fromFeet = (ft: number, inch: number) => (ft * 12 + inch) * INCH;

const FL_OZ = 29.5735;

export function formatFluid(ml: number, u: UnitSystem) {
  if (u === "imperial") return `${Math.round(ml / FL_OZ)} fl oz`;
  return ml >= 1000 ? `${Math.round(ml / 100) / 10} L` : `${Math.round(ml)} ml`;
}

export const fluidUnit = (u: UnitSystem) => (u === "metric" ? "ml" : "fl oz");
export const toDisplayFluid = (ml: number, u: UnitSystem) => (u === "metric" ? Math.round(ml) : Math.round(ml / FL_OZ));
export const fromDisplayFluid = (n: number, u: UnitSystem) => (u === "metric" ? n : n * FL_OZ);

/** Which unit a measure field starts on; the person can still switch per entry. */
export const preferredDistance = (u: UnitSystem) => (u === "metric" ? "km" : "mi");

/** A quick amount button; named ones are sizes people recognise, like a glass or a tbsp. */
export type QuickSize = { value: number; name?: string };

/**
 * Rows of quick sizes: spoons, then containers. Spoons are only offered in ml: a tbsp of a powder
 * weighs anything from 5 to 18 g depending on what it is, so weighed items need their own serving
 * for it. ½ fl oz is exactly a US tbsp.
 */
const quickSizes: Record<string, QuickSize[][]> = {
  g: [
    [100, 200, 300, 400, 500],
    [600, 700, 800, 900, 1000],
  ].map((row) => row.map((value) => ({ value }))),
  oz: [[1, 2, 4, 8, 12, 16].map((value) => ({ value }))],
  ml: [
    [
      { value: 5, name: "tsp" },
      { value: 15, name: "tbsp" },
    ],
    [
      { value: 200, name: "small glass" },
      { value: 250, name: "glass" },
      { value: 300, name: "mug" },
      { value: 330, name: "can" },
      { value: 500, name: "large glass" },
      { value: 1000, name: "jug" },
    ],
  ],
  "fl oz": [
    [{ value: 0.5, name: "tbsp" }],
    [
      { value: 4, name: "small glass" },
      { value: 8, name: "cup" },
      { value: 12, name: "can" },
      { value: 16, name: "pint" },
      { value: 20, name: "large glass" },
      { value: 32, name: "quart" },
    ],
  ],
};

const fineSteps: Record<string, number[]> = { g: [1, 10, 100], ml: [1, 10, 100], oz: [0.5, 1, 10], "fl oz": [0.5, 1, 10] };

/** Undefined for servings and pieces, which are counted rather than measured. */
export const quickSizesFor = (unit?: string) => (unit ? quickSizes[unit] : undefined);
/** What − and + can move by; servings and pieces are counted, so 1 or 10 at a time. */
export const fineStepsFor = (unit?: string) => (unit && fineSteps[unit]) || [1, 10];

/** About a tenth of the amount, so 12 g nudges by 1, 150 g by 10 and 1500 ml by 100. */
export const autoStep = (steps: number[], value = 0) => [...steps].reverse().find((s) => s <= value / 10) ?? steps[0];

/** How many of a named size the amount is, when it's a whole number of them. */
export function countOf(size: QuickSize, value?: number) {
  if (!size.name || !value) return undefined;
  const n = Math.round(value / size.value);
  return n >= 1 && Math.abs(value - n * size.value) < 1e-9 ? n : undefined;
}

