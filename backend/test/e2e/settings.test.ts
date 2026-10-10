import { describe, expect, it } from "vitest";
import { BEGINNING, defaultPlan } from "@dash/core";
import { anonymous, newUser, uuid } from "../support/helpers";

describe("session", () => {
  it("refuses calls without a session", async () => {
    expect((await anonymous("/me")).status).toBe(401);
  });

  it("creates the profile and plan on first load", async () => {
    const u = await newUser();
    const res = await u.get("/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      user: { id: u.id },
      profile: { units: "metric", dayEndsAt: 0, revision: 1 },
      plan: { versions: [{ from: BEGINNING, plan: defaultPlan }], revision: 1 },
      pots: [],
    });
  });
});

describe("profile", () => {
  it("saves with the revision it read and refuses a stale one", async () => {
    const u = await newUser();
    await u.get("/me");
    const saved = await u.put("/profile", { units: "imperial", heightCm: 180, birthday: "1990-03-04", sex: "female", dayEndsAt: 3, revision: 1 });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ units: "imperial", heightCm: 180, birthday: "1990-03-04", sex: "female", dayEndsAt: 3, revision: 2 });

    const stale = await u.put("/profile", { units: "metric", dayEndsAt: 0, revision: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ units: "imperial", revision: 2 });
  });

  it("rejects an invalid body with the zod issues", async () => {
    const u = await newUser();
    const res = await u.put("/profile", { units: "metric", dayEndsAt: 9, revision: 1 });
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toEqual(["dayEndsAt"]);
  });
});

describe("plan", () => {
  const faster = { ...defaultPlan, goal: { kgPerWeek: 0.75 } };

  it("starts a version on a date, fixes the newest, and ignores an unchanged plan", async () => {
    const u = await newUser();
    await u.get("/me");
    const dated = await u.post("/plan", { plan: faster, change: { from: "2026-09-01" }, revision: 1 });
    expect(dated.body).toEqual({ versions: [{ from: BEGINNING, plan: defaultPlan }, { from: "2026-09-01", plan: faster }], revision: 2 });

    const same = await u.post("/plan", { plan: faster, change: "fix", revision: 2 });
    expect(same.body.revision).toBe(2);

    const fixed = await u.post("/plan", { plan: { ...faster, fluidGoalMl: 2500 }, change: "fix", revision: 2 });
    expect(fixed.body.versions.map((v: any) => [v.from, v.plan.fluidGoalMl])).toEqual([
      [BEGINNING, 2000],
      ["2026-09-01", 2500],
    ]);
    expect((await u.post("/plan", { plan: defaultPlan, change: "fix", revision: 2 })).status).toBe(409);
  });

  it("requires exactly one of fat and carb share", async () => {
    const u = await newUser();
    const res = await u.post("/plan", { plan: { ...defaultPlan, macroPlan: { preset: "balanced", proteinPerKg: 1.6, fatPct: 0.3, carbPct: 0.4 } }, change: "fix", revision: 1 });
    expect(res.status).toBe(400);
  });
});

describe("weigh-ins", () => {
  it("keeps one per day and lists oldest first", async () => {
    const u = await newUser();
    const first = { id: uuid(), date: "2026-09-02", kg: 80 };
    expect((await u.post("/weigh-ins", first)).status).toBe(201);
    expect((await u.post("/weigh-ins", first)).status).toBe(200);
    await u.post("/weigh-ins", { id: uuid(), date: "2026-09-01", kg: 81 });
    const replacement = { id: uuid(), date: "2026-09-02", kg: 79.5 };
    await u.post("/weigh-ins", replacement);
    expect((await u.get("/weigh-ins")).body.weighIns.map((w: any) => [w.date, w.kg])).toEqual([
      ["2026-09-01", 81],
      ["2026-09-02", 79.5],
    ]);
    expect((await u.delete(`/weigh-ins/${replacement.id}`)).status).toBe(204);
    expect((await u.get("/weigh-ins")).body.weighIns).toHaveLength(1);
  });

  it("doesn't let anyone else use or delete a person's id", async () => {
    const a = await newUser();
    const b = await newUser();
    const w = { id: uuid(), date: "2026-09-02", kg: 80 };
    await a.post("/weigh-ins", w);
    expect((await b.post("/weigh-ins", w)).status).toBe(409);
    expect((await b.delete(`/weigh-ins/${w.id}`)).status).toBe(404);
  });
});

describe("pots", () => {
  it("creates, renames and deletes", async () => {
    const u = await newUser();
    const pot = { id: uuid(), name: "Big pot", grams: 1450 };
    expect((await u.post("/pots", pot)).status).toBe(201);
    expect((await u.put(`/pots/${pot.id}`, { ...pot, name: "Le Creuset" })).body.name).toBe("Le Creuset");
    expect((await u.get("/me")).body.pots).toEqual([{ ...pot, name: "Le Creuset" }]);
    expect((await u.delete(`/pots/${pot.id}`)).status).toBe(204);
    expect((await u.get("/me")).body.pots).toEqual([]);
  });
});
