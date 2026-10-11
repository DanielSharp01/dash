import { afterEach, describe, expect, it, vi } from "vitest";
import { openFoodFacts } from "../../src/providers/openFoodFacts";

const answer = (nutriments: Record<string, number>) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: 1, product: { product_name: "Rice cakes", quantity: "100 g", nutriments } }));

afterEach(() => vi.restoreAllMocks());

describe("openFoodFacts.lookup", () => {
  it("takes kcal as given", async () => {
    answer({ "energy-kcal_100g": 380, "energy-kj_100g": 1590, proteins_100g: 8 });
    expect((await openFoodFacts.lookup("1"))?.label?.values).toEqual({ kcal: 380, protein: 8 });
  });

  it("works kcal out from kJ when the product only lists kJ", async () => {
    answer({ "energy-kj_100g": 1590 });
    expect((await openFoodFacts.lookup("1"))?.label?.values).toEqual({ kcal: 380 });
  });

  it("leaves the label out without any energy", async () => {
    answer({ proteins_100g: 8 });
    expect((await openFoodFacts.lookup("1"))?.label).toBeUndefined();
  });
});
