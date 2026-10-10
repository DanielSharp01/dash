import type { ActivityInput, Burn, ExerciseEntryInput, MeasureKey, MeasureValue } from "./schemas";

const toKm: Record<string, number> = { km: 1, m: 0.001, mi: 1.609 };
const toHours: Record<string, number> = { min: 1 / 60, h: 1 };

export const durationMinutes = (measures: Partial<Record<MeasureKey, MeasureValue>>) =>
  measures.duration ? measures.duration.value * (toHours[measures.duration.unit] ?? 1 / 60) * 60 : undefined;

export const burnBasisLabel: Record<Burn["basis"], string> = { distance: "Distance", reps: "Reps", duration: "Duration" };

export const defaultBurn: Record<Burn["basis"], Burn> = {
  distance: { basis: "distance", kcalPerKgKm: 0.7 },
  reps: { basis: "reps", kcalPerKgRep: 0.005 },
  duration: { basis: "duration", met: 5 },
};

/** The extra calories and what they came from; undefined when the basis measure wasn't filled in. */
export function estimateBurn(activity: Pick<ActivityInput, "burn"> | undefined, measures: ExerciseEntryInput["measures"], bodyKg: number) {
  const burn = activity?.burn;
  if (!burn) return undefined;
  if (burn.basis === "distance") {
    const d = measures.distance;
    if (!d) return undefined;
    return { kcal: burn.kcalPerKgKm * bodyKg * d.value * (toKm[d.unit] ?? 1), from: `${d.value} ${d.unit}` };
  }
  if (burn.basis === "reps") {
    const reps = measures.reps;
    if (!reps) return undefined;
    // Without sets the reps are taken as the total.
    const sets = measures.sets?.value ?? 1;
    return { kcal: burn.kcalPerKgRep * bodyKg * reps.value * sets, from: sets > 1 ? `${sets} × ${reps.value} reps` : `${reps.value} reps` };
  }
  const t = measures.duration;
  if (!t) return undefined;
  return { kcal: (burn.met - 1) * bodyKg * t.value * (toHours[t.unit] ?? 1 / 60), from: `${t.value} ${t.unit}` };
}
