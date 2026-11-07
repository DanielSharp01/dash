const round2 = (n: number) => Math.round(n * 100) / 100;

export const formatWeight = (kg: number) => `${round2(kg)} kg`;
/** Always two decimals, as scales show them, so a list of weigh-ins lines up. */
export const formatWeighIn = (kg: number) => `${kg.toFixed(2)} kg`;
export const formatHeight = (cm: number) => `${Math.round(cm)} cm`;
export const formatFluid = (ml: number) => (ml >= 1000 ? `${Math.round(ml / 100) / 10} L` : `${Math.round(ml)} ml`);

/** A quick amount button; named ones are sizes people recognise, like a glass or a tbsp. */
export type QuickSize = { value: number; name?: string; plural?: string };

/**
 * Rows of quick sizes: spoons, then containers. Spoons are only offered in ml: a tbsp of a powder
 * weighs anything from 5 to 18 g depending on what it is, so weighed items need their own serving
 * for it.
 */
const quickSizes: Record<string, QuickSize[][]> = {
  g: [
    [100, 200, 300, 400, 500],
    [600, 700, 800, 900, 1000],
  ].map((row) => row.map((value) => ({ value }))),
  ml: [
    [
      { value: 5, name: "tsp" },
      { value: 15, name: "tbsp" },
    ],
    [
      { value: 200, name: "small glass", plural: "small glasses" },
      { value: 250, name: "glass", plural: "glasses" },
      { value: 300, name: "mug", plural: "mugs" },
      { value: 330, name: "can", plural: "cans" },
      { value: 500, name: "large glass", plural: "large glasses" },
      { value: 1000, name: "jug", plural: "jugs" },
    ],
  ],
};

const fineSteps: Record<string, number[]> = { g: [1, 10, 100], ml: [1, 10, 100] };

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

/** A few at most: "2 glasses" helps reading a row, "19 tbsp" doesn't. */
const MAX_NAMED = 4;

/** "2 glasses" for an amount that is a few of one named size, the fewest when several fit. */
export function namedAmount(amount: { value?: number | undefined; unit?: string | undefined }) {
  const fits = (quickSizesFor(amount.unit) ?? [])
    .flat()
    .map((size) => ({ size, n: countOf(size, amount.value) }))
    .filter((f): f is { size: QuickSize; n: number } => f.n !== undefined && f.n <= MAX_NAMED)
    .sort((a, b) => a.n - b.n);
  const best = fits[0];
  return best && `${best.n} ${best.n === 1 ? best.size.name : (best.size.plural ?? best.size.name)}`;
}
