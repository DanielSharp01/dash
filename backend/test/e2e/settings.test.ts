import { describe, expect, it } from "vitest";
import { BEGINNING, defaultPlan, splitPlanVersions } from "@dash/core";
import { anonymous, newUser, uuid } from "../support/helpers";

describe("session", () => {
  it("refuses calls without a session", async () => {
    expect((await anonymous("/api/me")).status).toBe(401);
  });

  it("sends Google back to API_HOST, whatever host the request came in on", async () => {
    const res = await anonymous("/auth/google/authorize?returnTo=/capture");
    expect(res.status).toBe(302);
    const google = new URL(res.headers.get("location")!);
    expect(google.searchParams.get("redirect_uri")).toBe("http://localhost:5173/auth/google/callback");
  });

  it("creates the profile and plan on first load", async () => {
    const u = await newUser();
    const res = await u.get("/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      user: { id: u.id },
      profile: { dayEndsAt: 0, clock: "24h", revision: 1 },
      plan: { ...splitPlanVersions([{ from: BEGINNING, plan: defaultPlan }]), revision: 1, chosen: [] },
      containers: [],
      setupOffered: false,
    });
  });

  it("remembers that the setup has opened, so it opens by itself only once", async () => {
    const u = await newUser();
    expect((await u.post("/setup/offered")).status).toBe(204);
    expect((await u.get("/me")).body.setupOffered).toBe(true);
  });
});

describe("profile", () => {
  it("saves with the revision it read and refuses a stale one", async () => {
    const u = await newUser();
    await u.get("/me");
    const saved = await u.put("/profile", { heightCm: 180, birthday: "1990-03-04", sex: "female", dayEndsAt: 3, clock: "12h", revision: 1 });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ heightCm: 180, birthday: "1990-03-04", sex: "female", dayEndsAt: 3, clock: "12h", autoRecap: true, shareVerified: true, revision: 2 });

    const stale = await u.put("/profile", { dayEndsAt: 0, revision: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ heightCm: 180, revision: 2 });
  });

  it("rejects an invalid body with the zod issues", async () => {
    const u = await newUser();
    const res = await u.put("/profile", { dayEndsAt: 9, revision: 1 });
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toEqual(["dayEndsAt"]);
  });
});

describe("plan", () => {
  const faster = { ...defaultPlan, goal: { kgPerWeek: 0.75 } };

  it("starts a version on a date, fixes the newest, and ignores an unchanged plan", async () => {
    const u = await newUser();
    await u.get("/me");
    const dated = await u.post("/plan", { plan: faster, change: { from: "2026-09-01" }, revision: 1, choose: ["goal"] });
    expect(dated.body.goal).toEqual([
      { from: BEGINNING, value: { goal: defaultPlan.goal } },
      { from: "2026-09-01", value: { goal: faster.goal } },
    ]);
    expect(dated.body.fluid).toEqual([{ from: BEGINNING, value: { fluidGoalMl: defaultPlan.fluidGoalMl } }]);
    expect(dated.body.revision).toBe(2);

    const same = await u.post("/plan", { plan: faster, change: "fix", revision: 2, choose: ["goal"] });
    expect(same.body.revision).toBe(2);

    // Fluid has one version, so fixing it rewrites that one; the goal keeps both of its versions.
    const fixed = await u.post("/plan", { plan: { ...faster, fluidGoalMl: 2500 }, change: "fix", revision: 2, choose: ["fluid"] });
    expect(fixed.body.fluid).toEqual([{ from: BEGINNING, value: { fluidGoalMl: 2500 } }]);
    expect(fixed.body.goal).toEqual(dated.body.goal);
    expect((await u.post("/plan", { plan: defaultPlan, change: "fix", revision: 2, choose: [] })).status).toBe(409);
  });

  it("marks an area set when it's chosen, even keeping a new account's default", async () => {
    const u = await newUser();
    await u.get("/me");
    const kept = await u.post("/plan", { plan: defaultPlan, change: "fix", revision: 1, choose: ["macros"] });
    expect(kept.body).toMatchObject({ revision: 2, chosen: ["macros"] });
    const changed = await u.post("/plan", { plan: faster, change: "fix", revision: 2, choose: ["goal"] });
    expect(changed.body.chosen).toEqual(["macros", "goal"]);
    expect((await u.get("/me")).body.plan.chosen).toEqual(["macros", "goal"]);
  });

  it("requires exactly one of fat and carb share", async () => {
    const u = await newUser();
    const res = await u.post("/plan", { plan: { ...defaultPlan, macroPlan: { preset: "balanced", proteinPerKg: 1.6, fatPct: 0.3, carbPct: 0.4 } }, change: "fix", revision: 1, choose: ["macros"] });
    expect(res.status).toBe(400);
  });

  it("saves an area's versions as its History page left them, and sets the area", async () => {
    const u = await newUser();
    await u.get("/me");
    const versions = [
      { from: BEGINNING, value: { goal: defaultPlan.goal } },
      { from: "2026-09-01", value: { goal: { kgPerWeek: 0.75 } } },
      { from: "2026-10-01", value: { goal: { kgPerWeek: 0.25 } } },
    ];
    const saved = await u.put("/plan/versions", { area: "goal", versions, revision: 1 });
    expect(saved.body).toMatchObject({ goal: versions, revision: 2, chosen: ["goal"] });

    // An older version fixed, one moved and one deleted; equal neighbours merge into the earlier one.
    const edited = [
      { from: BEGINNING, value: { goal: { kgPerWeek: 0.5 } } },
      { from: "2026-09-15", value: { goal: { kgPerWeek: 0.5 } } },
    ];
    const merged = await u.put("/plan/versions", { area: "goal", versions: edited, revision: 2 });
    expect(merged.body.goal).toEqual([{ from: BEGINNING, value: { goal: { kgPerWeek: 0.5 } } }]);
    expect(merged.body.fluid).toEqual(saved.body.fluid);
    expect((await u.put("/plan/versions", { area: "goal", versions, revision: 2 })).status).toBe(409);
  });

  it("refuses versions without a start, out of order, two on a day, or of another area", async () => {
    const u = await newUser();
    const v = (from: string, kgPerWeek = 0.5) => ({ from, value: { goal: { kgPerWeek } } });
    const bodies = [
      { area: "goal", versions: [] },
      { area: "goal", versions: [v("2026-09-01")] },
      { area: "goal", versions: [v(BEGINNING), v("2026-10-01"), v("2026-09-01", 1)] },
      { area: "goal", versions: [v(BEGINNING), v("2026-09-01"), v("2026-09-01", 1)] },
      { area: "fluid", versions: [v(BEGINNING)] },
    ];
    for (const body of bodies) expect((await u.put("/plan/versions", { ...body, revision: 1 })).status).toBe(400);
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

describe("containers", () => {
  it("creates, renames and deletes a pot", async () => {
    const u = await newUser();
    const pot = { id: uuid(), kind: "pot", name: "Big pot", grams: 1450 };
    expect((await u.post("/containers", pot)).status).toBe(201);
    expect((await u.put(`/containers/${pot.id}`, { ...pot, name: "Le Creuset" })).body.name).toBe("Le Creuset");
    expect((await u.get("/me")).body.containers).toEqual([{ ...pot, name: "Le Creuset" }]);
    expect((await u.delete(`/containers/${pot.id}`)).status).toBe(204);
    expect((await u.get("/me")).body.containers).toEqual([]);
  });

  it("keeps a mug with only its capacity, and lets its weight be added and cleared later", async () => {
    const u = await newUser();
    const mug = { id: uuid(), kind: "glass", name: "Mug", capacityMl: 300 };
    expect((await u.post("/containers", mug)).status).toBe(201);
    await u.put(`/containers/${mug.id}`, { ...mug, grams: 280 });
    expect((await u.get("/me")).body.containers).toEqual([{ ...mug, grams: 280 }]);
    await u.put(`/containers/${mug.id}`, mug);
    expect((await u.get("/me")).body.containers).toEqual([mug]);
  });

  it("refuses a pot without its weight, a mug with neither number, and a pot turning into a mug", async () => {
    const u = await newUser();
    expect((await u.post("/containers", { id: uuid(), kind: "pot", name: "Pot" })).status).toBe(400);
    expect((await u.post("/containers", { id: uuid(), kind: "glass", name: "Mug" })).status).toBe(400);
    const pot = { id: uuid(), kind: "pot", name: "Pot", grams: 900 };
    await u.post("/containers", pot);
    expect((await u.put(`/containers/${pot.id}`, { id: pot.id, kind: "glass", name: "Pot", grams: 900 })).status).toBe(422);
  });
});
