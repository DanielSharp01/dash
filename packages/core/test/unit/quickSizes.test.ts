import { describe, expect, it } from "vitest";
import { autoStep, countOf, fineStepsFor, quickSizesFor } from "../../src/index";

describe("quick sizes", () => {
  it("names the ml and fl oz sizes, leaves g plain and has none for servings", () => {
    expect(quickSizesFor("ml")?.[0]?.map((s) => s.name)).toEqual(["tsp", "tbsp"]);
    expect(quickSizesFor("fl oz")?.[0]?.[0]).toEqual({ value: 0.5, name: "tbsp" });
    expect(quickSizesFor("g")?.flat().map((s) => s.value)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    expect(quickSizesFor("bar")).toBeUndefined();
    expect(quickSizesFor(undefined)).toBeUndefined();
  });

  it("steps servings and pieces by 1 or 10", () => {
    expect(fineStepsFor("bar")).toEqual([1, 10]);
    expect(autoStep(fineStepsFor("bar"), 2)).toBe(1);
  });

  it("steps by about a tenth of the amount", () => {
    const g = fineStepsFor("g");
    expect([undefined, 12, 99, 100, 150, 999, 1000, 5000].map((v) => autoStep(g, v))).toEqual([1, 1, 1, 10, 10, 10, 100, 100]);
    expect([2, 8, 16, 120].map((v) => autoStep(fineStepsFor("fl oz"), v))).toEqual([0.5, 0.5, 1, 10]);
  });

  it("counts whole numbers of a named size only", () => {
    const glass = { value: 250, name: "glass" };
    expect(countOf(glass, 500)).toBe(2);
    expect(countOf(glass, 260)).toBeUndefined();
    expect(countOf(glass, 0)).toBeUndefined();
    expect(countOf({ value: 0.5, name: "tbsp" }, 1.5)).toBe(3);
    expect(countOf({ value: 100 }, 200)).toBeUndefined();
  });
});
