export const keys = {
  me: ["me"] as const,
  foods: ["foods"] as const,
  foodUsage: ["foods", "usage"] as const,
  activities: ["activities"] as const,
  activityUsage: ["activities", "usage"] as const,
  entries: ["entries"] as const,
  day: (date: string) => ["entries", date] as const,
  entriesOfFood: (foodId: string) => ["entries", "food", foodId] as const,
  entriesBetween: (from: string, to: string) => ["entries", "range", from, to] as const,
  followUp: ["follow-up"] as const,
  weighIns: ["weigh-ins"] as const,
  barcode: (code: string) => ["barcode", code] as const,
  icons: ["icons"] as const,
  deployedBuild: ["deployed-build"] as const,
};

export const isDayKey = (key: readonly unknown[]): key is readonly ["entries", string] =>
  key[0] === "entries" && typeof key[1] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key[1]);
