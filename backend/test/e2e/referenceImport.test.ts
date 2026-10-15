import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyImport, planImport, referenceId } from "../../src/importers/apply";
import { readUsda } from "../../src/importers/usda";
import { db } from "../../src/providers/db";
import { newUser } from "../support/helpers";

const fixtures = join(import.meta.dirname, "../fixtures/usda");
const rice = referenceId("usda", "900001");

describe("importing a reference table", () => {
  it("adds foods once, then only adds a dated label version when the source changes", async () => {
    const foods = await readUsda([join(fixtures, "legacy"), join(fixtures, "foundation")]);
    await db.transaction(async (tx) => applyImport(tx, "usda", await planImport(tx, "usda", foods), "2026-10-15"));
    const again = await db.transaction((tx) => planImport(tx, "usda", foods));
    expect({ added: again.added.length, changed: again.changed.length, unchanged: again.unchanged }).toEqual({ added: 0, changed: 0, unchanged: 3 });

    const changed = foods.map((f) => (f.ref === "900001" ? { ...f, values: { ...f.values, kcal: 358 } } : f));
    await db.transaction(async (tx) => applyImport(tx, "usda", await planImport(tx, "usda", changed), "2026-10-20"));
    const u = await newUser();
    await u.put("/profile", { ...(await u.get("/me")).body.profile, genericSource: "usda" });
    const found = (await u.get("/foods/search?q=rice")).body.foods.find((f: any) => f.id === rice);
    expect(found).toMatchObject({ public: true, name: "Rice", labels: [{ values: { kcal: 360 } }, { from: "2026-10-20", values: { kcal: 358 }, origin: "usda" }] });
  });

  it("only searches the person's own reference table", async () => {
    const u = await newUser();
    await u.put("/profile", { ...(await u.get("/me")).body.profile, genericSource: "ciqual" });
    expect((await u.get("/foods/search?q=rice")).body.foods.some((f: any) => f.id === rice)).toBe(false);
  });
});
