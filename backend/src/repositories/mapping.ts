import type { Amount } from "@dash/core";

/** An optional API field from a nullable column: absent rather than null. */
export const opt = <K extends string, V>(key: K, value: V | null | undefined) =>
  (value === null || value === undefined ? {} : { [key]: value }) as { [P in K]?: V };

export const toAmount = (value: number | null, unit: string | null): Amount => ({ ...opt("value", value), ...opt("unit", unit) });

export const iso = (d: Date) => d.toISOString();
