import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ciqualValue, readCiqual } from "../../src/importers/ciqual";

describe("Ciqual files", () => {
  it("reads decimal commas, traces and small bounds as zero, and leaves the rest unknown", () => {
    expect(ciqualValue("21,5")).toBe(21.5);
    expect(ciqualValue("traces")).toBe(0);
    expect(ciqualValue("< 0,01")).toBe(0);
    expect(ciqualValue("< 20")).toBeUndefined();
    expect(ciqualValue("-")).toBeUndefined();
  });

  it("reads foods with their English names, energy and macros, skipping foods without energy", async () => {
    const foods = await readCiqual(join(import.meta.dirname, "../fixtures/ciqual"));
    expect(foods).toEqual([
      {
        ref: "1",
        name: "Cashew nut",
        variant: "dry-grilled, no added salt",
        values: { kcal: 597, protein: 21.5, fat: 48.2, carbs: 19.3, sugars: 0, salt: 0, saturates: 8.4 },
        servings: [],
      },
      { ref: "2", name: "Raclette cheese", variant: "from cow's milk", values: { kcal: 345, protein: 22, fat: 28 }, servings: [] },
    ]);
  });
});
