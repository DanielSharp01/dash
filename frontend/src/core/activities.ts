import { createStore } from "./createStore";
import type { Activity } from "./types";

const dist = (kcalPerKgKm: number) => ({ basis: "distance", kcalPerKgKm }) as const;
const time = (met: number) => ({ basis: "duration", met }) as const;
const reps = (kcalPerKgRep: number) => ({ basis: "reps", kcalPerKgRep }) as const;

/** Factors are rough net values from the Compendium of Physical Activities and common rules of thumb. */
const builtIns: Activity[] = [
  { id: "walk", name: "Walk", icon: "🚶", measures: ["distance", "duration"], burn: dist(0.5) },
  { id: "run", name: "Run", icon: "🏃", measures: ["distance", "duration"], burn: dist(1) },
  { id: "cycle", name: "Cycling", icon: "🚴", measures: ["distance", "duration"], burn: dist(0.3) },
  { id: "swim", name: "Swim", icon: "🏊", measures: ["laps", "distance", "duration"], burn: dist(3) },
  { id: "weights", name: "Weight lifting", icon: "🏋️", measures: ["duration", "sets", "reps", "weight"], burn: time(5) },
  { id: "pushups", name: "Push-ups", icon: "💪", measures: ["sets", "reps"], burn: reps(0.005) },
  { id: "pullups", name: "Pull-ups", icon: "🧗", measures: ["sets", "reps"], burn: reps(0.013) },
  { id: "squats", name: "Squats", icon: "🦵", measures: ["sets", "reps"], burn: reps(0.004) },
  { id: "burpees", name: "Burpees", icon: "🤸", measures: ["sets", "reps"], burn: reps(0.013) },
  { id: "yoga", name: "Yoga", icon: "🧘", measures: ["duration"], burn: time(2.5) },
  { id: "hike", name: "Hiking", icon: "🥾", measures: ["distance", "duration"], burn: dist(0.7) },
  { id: "row", name: "Rowing", icon: "🚣", measures: ["distance", "duration"], burn: dist(0.8) },
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
  { id: "ski", name: "Skiing", icon: "⛷️", measures: ["duration", "distance"], burn: time(5.3) },
];

/** Shown before anything has been logged, so the first exercise is one tap. */
export const starterActivityIds = ["walk", "run", "cycle"];

const store = createStore<Activity[]>("dash.activities.v1", []);

export const useActivities = store.use;

/** An edited or hidden built-in is stored under the same id and wins over the code version. */
function every(): Activity[] {
  const mine = store.get();
  return [
    ...builtIns.map((b) => ({ ...(mine.find((m) => m.id === b.id) ?? b), builtIn: true })),
    ...mine.filter((m) => !builtIns.some((b) => b.id === m.id)),
  ];
}

export const allActivities = () => every().filter((a) => !a.deleted);

/** Includes deleted ones, which past entries still need. */
export const activityById = (id?: string) => every().find((a) => a.id === id);

export function saveActivity(a: Activity) {
  const mine = store.get();
  store.set(mine.some((m) => m.id === a.id) ? mine.map((m) => (m.id === a.id ? a : m)) : [...mine, a]);
}

/** Built-ins and used ones are hidden, since entries or code still refer to them. Returns an undo. */
export function deleteActivity(a: Activity, used: boolean): () => void {
  const before = store.get();
  if (used || a.builtIn) saveActivity({ ...a, deleted: true });
  else store.set(before.filter((m) => m.id !== a.id));
  return () => store.set(before);
}
