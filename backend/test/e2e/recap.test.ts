import { describe, expect, it } from "vitest";
import { logicalDateIn } from "@dash/core";
import { foodEntry, item } from "../support/fixtures";
import { newUser } from "../support/helpers";

const oats = () => item({ name: "Oats", unit: "g", labels: [{ from: "0001-01-01", per: "100", values: { kcal: 400, protein: 13, carbs: 60, fat: 7 }, source: "package" }], servings: [] });
const ate = (foodId: string, date: string, kcal: number) => foodEntry([{ foodId, amount: { value: kcal / 4, unit: "g" }, base: kcal / 4 }], date);

describe("recap", () => {
  it("recaps a finished day with its streaks and week", async () => {
    const u = await newUser();
    const food = oats();
    await u.post("/entries", { ...ate(food.id, "2026-09-07", 1500), newFoods: [food] });
    await u.post("/entries", ate(food.id, "2026-09-08", 1500));
    await u.post("/entries", ate(food.id, "2026-09-09", 2500));

    const res = await u.get("/recap?day=2026-09-09");
    expect(res.status).toBe(200);
    // A new profile has no height or age yet, so the budget is the placeholder and there's no deficit.
    expect(res.body.day).toMatchObject({ date: "2026-09-09", logged: true, tone: "over", eaten: 2500, budget: 1800 });
    expect(res.body.day.deficit).toBeUndefined();
    expect(res.body.streak).toMatchObject({ logged: 3, onTarget: 0, loggedBefore: 2, onTargetBefore: 2 });
    expect(res.body.week.from).toBe("2026-09-07");
    expect(res.body.week.days).toHaveLength(3);
    expect(res.body.first).toBe(false);
  });

  it("refuses a day that isn't over on the person's clock", async () => {
    const u = await newUser();
    const today = logicalDateIn(new Date(), "UTC", 0);
    const res = await u.get(`/recap?day=${today}`);
    expect(res.status).toBe(422);
    expect(res.body.today).toBe(today);
  });

  it("plays by itself unless turned off, and older clients that don't send it leave it on", async () => {
    const u = await newUser();
    expect((await u.get("/me")).body.profile.autoRecap).toBe(true);
    expect((await u.put("/profile", { units: "metric", dayEndsAt: 0, autoRecap: false, revision: 1 })).body.autoRecap).toBe(false);
    expect((await u.put("/profile", { units: "metric", dayEndsAt: 0, revision: 2 })).body.autoRecap).toBe(true);
  });

  it("keeps the time zone a device sends with the profile", async () => {
    const u = await newUser();
    await u.get("/me");
    const saved = await u.put("/profile", { units: "metric", dayEndsAt: 0, timeZone: "Europe/Budapest", revision: 1 });
    expect(saved.status).toBe(200);
    expect(saved.body.timeZone).toBe("Europe/Budapest");
    expect((await u.put("/profile", { units: "metric", dayEndsAt: 0, timeZone: "Mars/Olympus", revision: 2 })).status).toBe(400);
  });
});

describe("recap seen", () => {
  it("only moves forward, shows in /me and can be cleared", async () => {
    const u = await newUser();
    expect((await u.get("/me")).body.recapSeenOn).toBeUndefined();

    expect((await u.post("/recap/seen", { day: "2026-09-09" })).body).toEqual({ recapSeenOn: "2026-09-09" });
    expect((await u.post("/recap/seen", { day: "2026-09-05" })).body).toEqual({ recapSeenOn: "2026-09-09" });
    expect((await u.get("/me")).body.recapSeenOn).toBe("2026-09-09");

    expect((await u.delete("/recap/seen")).status).toBe(204);
    expect((await u.get("/me")).body.recapSeenOn).toBeUndefined();
  });

  it("refuses a day that isn't over", async () => {
    const u = await newUser();
    expect((await u.post("/recap/seen", { day: "2999-01-01" })).status).toBe(422);
  });
});
