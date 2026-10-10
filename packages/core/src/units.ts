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
