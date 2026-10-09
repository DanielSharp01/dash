import { userActivities } from "./userActivities";
import { userItems } from "./userItems";
import type { Activity, Item } from "./types";


const dist = (kcalPerKgKm: number) => ({ basis: "distance", kcalPerKgKm }) as const;
const time = (met: number) => ({ basis: "duration", met }) as const;
const reps = (kcalPerKgRep: number) => ({ basis: "reps", kcalPerKgRep }) as const;

/** Factors are rough net values from the Compendium of Physical Activities and common rules of thumb. */
const sampleActivities: Activity[] = [
  { id: "walk", name: "Walk", icon: "🚶", measures: ["distance", "duration"], imports: ["gpx", "fit", "health-connect"], burn: dist(0.5) },
  { id: "run", name: "Run", icon: "🏃", measures: ["distance", "duration"], imports: ["gpx", "fit", "health-connect"], burn: dist(1) },
  { id: "cycle", name: "Cycling", icon: "🚴", measures: ["distance", "duration"], imports: ["gpx", "fit", "health-connect"], burn: dist(0.3) },
  { id: "swim", name: "Swim", icon: "🏊", measures: ["laps", "distance", "duration"], imports: ["fit", "health-connect"], burn: dist(3) },
  { id: "weights", name: "Weight lifting", icon: "🏋️", measures: ["duration", "sets", "reps", "weight"], burn: time(5) },
  { id: "pushups", name: "Push-ups", icon: "💪", measures: ["sets", "reps"], burn: reps(0.005) },
  { id: "pullups", name: "Pull-ups", icon: "🧗", measures: ["sets", "reps"], burn: reps(0.013) },
  { id: "squats", name: "Squats", icon: "🦵", measures: ["sets", "reps"], burn: reps(0.004) },
  { id: "burpees", name: "Burpees", icon: "🤸", measures: ["sets", "reps"], burn: reps(0.013) },
  { id: "yoga", name: "Yoga", icon: "🧘", measures: ["duration"], burn: time(2.5) },
  { id: "hike", name: "Hiking", icon: "🥾", measures: ["distance", "duration"], imports: ["gpx", "fit", "health-connect"], burn: dist(0.7) },
  { id: "row", name: "Rowing", icon: "🚣", measures: ["distance", "duration"], imports: ["fit", "health-connect"], burn: dist(0.8) },
  { id: "elliptical", name: "Elliptical", icon: "⚙️", measures: ["duration"], burn: time(5) },
  { id: "stairs", name: "Stair climbing", icon: "🪜", measures: ["duration"], burn: time(8) },
  { id: "hiit", name: "HIIT", icon: "⏱️", measures: ["duration"], burn: time(8) },
  { id: "pilates", name: "Pilates", icon: "🤸", measures: ["duration"], burn: time(3) },
  { id: "stretch", name: "Stretching", icon: "🙆", measures: ["duration"], burn: time(2.3) },
  { id: "climb", name: "Climbing", icon: "🧗", measures: ["duration"], burn: time(7) },
  { id: "tennis", name: "Tennis", icon: "🎾", measures: ["duration"], burn: time(7) },
  { id: "badminton", name: "Badminton", icon: "🏸", measures: ["duration"], burn: time(5.5) },
  { id: "football", name: "Football", icon: "⚽", measures: ["duration"], burn: time(7) },
  { id: "basketball", name: "Basketball", icon: "🏀", measures: ["duration"], burn: time(6.5) },
  { id: "dance", name: "Dancing", icon: "💃", measures: ["duration"], burn: time(5) },
  { id: "skate", name: "Skating", icon: "⛸️", measures: ["duration"], burn: time(7) },
  { id: "ski", name: "Skiing", icon: "⛷️", measures: ["duration", "distance"], imports: ["gpx", "fit", "health-connect"], burn: time(5.3) },
];

/** Library items live in the same local store for now; publishing only flips a flag. */
export const allItems = (): Item[] => userItems().filter((i) => !i.deleted);

export const itemIcon = (item: Pick<Item, "icon" | "type">) => item.icon ?? (item.type === "recipe" ? "🍲" : "🥫");

/** Includes deleted items, which past entries still need to show and calculate. */
export const itemById = (id?: string) => userItems().find((i) => i.id === id);
/**
 * Built-ins are the library. Editing or deleting one stores a local copy under the same id,
 * which wins over the built-in.
 */
function everyActivity(): Activity[] {
  const mine = userActivities();
  return [
    ...sampleActivities.map((s) => ({ ...(mine.find((m) => m.id === s.id) ?? s), library: true })),
    ...mine.filter((m) => !sampleActivities.some((s) => s.id === m.id)),
  ];
}

export const allActivities = (): Activity[] => everyActivity().filter((a) => !a.deleted);

/** Includes deleted activities, which past entries still need. */
export const activityById = (id?: string) => everyActivity().find((a) => a.id === id);
export const itemByBarcode = (code: string) => allItems().find((i) => i.barcode === code);
