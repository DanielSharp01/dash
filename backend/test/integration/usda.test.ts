import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvLine } from "../../src/importers/csv";
import { readUsda, splitDescription } from "../../src/importers/usda";

const fixtures = join(import.meta.dirname, "../fixtures/usda");

describe("USDA files", () => {
  it("parses quoted CSV fields with commas and doubled quotes", () => {
    expect(parseCsvLine('"1","Rice, white","say ""hi""",')).toEqual(["1", "Rice, white", 'say "hi"', ""]);
  });

  it("names a food by its first part, moving category prefixes out of the way", () => {
    expect(splitDescription("Rice, white, long-grain, raw")).toEqual({ name: "Rice", variant: "white, long-grain, raw" });
    expect(splitDescription("Beverages, coffee, brewed")).toEqual({ name: "Coffee", variant: "brewed" });
    expect(splitDescription("Babyfood, juice, apple")).toEqual({ name: "Juice", variant: "apple, babyfood" });
    expect(splitDescription("Apples, raw (Includes foods for USDA's Food Distribution Program)")).toEqual({ name: "Apples", variant: "raw" });
  });

  it("reads Foundation Foods and SR Legacy, preferring Foundation and skipping samples and foods without energy", async () => {
    const foods = await readUsda([join(fixtures, "legacy"), join(fixtures, "foundation")]);
    expect(foods.map((f) => f.ref).sort()).toEqual(["800001", "800003", "900001"]);
    expect(foods.find((f) => f.ref === "900001")).toEqual({
      ref: "900001",
      name: "Rice",
      variant: "white, long-grain, raw",
      values: { kcal: 360, protein: 7.04, fat: 0.6, carbs: 79.9 },
      servings: [{ name: "cup", size: 185 }],
    });
    expect(foods.find((f) => f.ref === "800001")).toMatchObject({
      name: "Coffee",
      values: { kcal: 1, caffeine: 40, salt: 0.01 },
      servings: [
        { name: "cup (8 fl oz)", size: 237 },
        { name: "fl oz", size: 29.6 },
      ],
    });
    expect(foods.find((f) => f.ref === "800003")).toMatchObject({ name: "Hamburger", variant: "single, regular patty, plain, fast foods" });
  });
});
