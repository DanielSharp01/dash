# Dash backend plan

Status: draft for discussion, 10 October 2026. Derived from the capture prototype (`frontend/src/core/`) and [REVISED_SPEC.md](REVISED_SPEC.md). It covers the database schema, the API and how the backend code is laid out. The existing scaffold (typeline-http, Drizzle on Postgres, Redis sessions, Google sign-in) stays.

## Decisions that shape everything else

**The domain package runs on both sides.** `frontend/src/core/` minus its stores and React hooks becomes `packages/core`: types, unit conversion, label lookup by date, totals, follow-up rules, goal calculation. The server uses it for anything that needs nutrition maths (the follow-up inbox, impact previews). The frontend uses it to render. Neither side reimplements the other. Zod schemas for the API live here too, so the frontend gets request and response types for free. Data access stays out, which answers the spec's open "shared package boundary" question.

**The client fetches the whole catalogue.** Two people, a few hundred items each. `GET /api/foods` returns every food with labels, servings, batches and parts, behind an ETag. Search, cards and ordering stay in the client, as in the prototype. Server-side search with `pg_trgm` can come later if a catalogue ever gets big. This removes a whole class of endpoints from the MVP.

**Ids come from the client.** Every row a person creates gets its UUID on the phone, as the prototype already does. A create is `POST` with the id in the body. If that id already exists for the same user, the server returns the stored row with 200 instead of failing, so a retry after a timeout is harmless. An id that exists for another user is a 409.

**Aggregates are replaced whole, with a revision.** A food (with its labels, servings, batches or parts), an entry (with its lines or measures), an activity and the profile are each saved as one document. Each has a `revision` integer that goes up on every save. It is not history: settings like sex, height and birthday keep only their current value. `PUT` must send the revision it read and gets 409 if someone saved in between. The phone and the dashboard can both be open on the same item, so last-write-wins would lose edits silently.

**Operations that touch several aggregates are commands.** Completing an unsure item by swapping or splitting it, merging items, reconverting amounts and moving lines between batches rewrite lines across many entries. Each is one endpoint and one transaction. Each accepts `?preview=true`, which runs the transaction, computes the before and after totals of every affected day, and rolls back. Each real run returns an undo token (see Undo).

**Missing is NULL, never 0.** Every nutrient, amount and size column is nullable. NULL means missing. The core package already treats absent values this way and the schema must not undo it with defaults.

**Floats are `double precision`.** Label values like 0.04 g saturates don't need exact decimals, and Drizzle returns `numeric` as a string, which would mean parsing everywhere.

**"As far back as known" is `-infinity`.** A label or plan version with no start date has `effective_from = '-infinity'`, which Postgres sorts before every real date, so `effective_from <= $day` works with no special case. The prototype uses the same string (`BEGINNING` in `core/types.ts`). As a plain string it also sorts below any `YYYY-MM-DD`, so it passes through Drizzle's string date mode and the API unchanged.

## Schema

All tables live in `backend/src/db/schema.ts`. Every top-level table has `user_id uuid not null → users on delete cascade`, and every query filters by it. The exceptions are `foods` and `activities`, where `user_id` is null on public items (see Public items); those are readable by everyone, can be referenced by anyone's entries, ingredients and combo parts, and are writable by no one through the API. Child tables (labels, servings, lines, …) are reached through their parent and never queried on their own.

Timestamps are `timestamptz`. Dates the person picked (`when_date`, `made_on`, `effective_from`) are `date`, and wall-clock times are `time` without a zone, because what matters is the person's day, not an instant.

### People and settings

```text
users                      (exists)
  id uuid pk, google_sub text unique, email, name, created_at

profiles                   one row per user, created at first sign-in
  user_id uuid pk → users
  units           enum('metric','imperial') default 'metric'
  height_cm       double  null
  birthday        date    null
  sex             enum('male','female') null
  day_ends_at     smallint default 0          check 0..6
  revision        int not null default 1
  plan_revision   int not null default 1      bumped by every plan change; guards plan_versions

plan_versions              Profile.planHistory; the current plan is the newest row
  id              uuid pk
  user_id         uuid not null → users on delete cascade
  effective_from          date not null default '-infinity'
  goal_kg_per_week        double not null
  goal_target_kg          double null
  metabolism_multiplier   double not null
  calibrated_maintenance_kcal  double null    both set or both null
  calibrated_exercise_kcal     double null
  fluid_goal_ml           double not null
  macro_preset            enum(balanced, high-protein, low-carb, keto, low-fat)
  protein_per_kg          double not null
  fat_pct, carb_pct       double null         exactly one set
  unique (user_id, effective_from)

weigh_ins
  id              uuid pk
  user_id         uuid not null → users on delete cascade
  date            date not null
  kg              double not null
  deleted_at      timestamptz null
  unique (user_id, date) where deleted_at is null   a second weigh-in on a day replaces the first

pots
  id              uuid pk
  user_id         uuid not null → users on delete cascade
  name            text not null
  grams           double not null
  deleted_at      timestamptz null
```

The prototype keeps the current plan as fields on the profile and history beside it. Here the history is the only copy, so the two can't drift. `savePlan(next, "fix" | {from})` in core already describes the write: "fix" updates the newest row, a date inserts one and deletes later rows.

### Foods

Items, recipes and combos share one `foods` table. A recipe ingredient, a combo part and an entry line can point at any kind, and listing, search and recents span all three, so one id space with one foreign key target is simpler than three tables.

```text
foods
  id          uuid pk
  user_id     uuid null → users on delete cascade   null = public item
  kind        enum('item','recipe','combo') not null
  catalogued  boolean not null default true  false = entry-only label or one-off combo, see below
  name        text not null
  icon        text not null                  always saved, also when suggested
  icon_auto   boolean not null default true  true = follows the name; false = picked
  -- item only; check (kind = 'item') = (unit is not null)
  unit        enum('g','ml','piece') null
  variant     text null
  barcode     text null
  not_fluid   boolean not null default false
  unsure      boolean not null default false
  -- public items and duplicates of them
  public_key  text null                      public rows only; the key in backend/src/seeds/
  starter     boolean not null default false public rows only; a card before first use
  origin_id   uuid null → foods              duplicated from this public item; provenance only
  deleted_at  timestamptz null
  revision    int not null default 1
  created_at  timestamptz not null default now()
  updated_at  timestamptz not null default now()
  check (user_id is null) = (public_key is not null)
  unique (public_key)
  unique (id, kind)                          target of the composite foreign keys
  index (user_id, barcode) where barcode is not null   not unique: a scan lists every match

labels                     Label; oldest first by effective_from
  id uuid pk, food_id → foods on delete cascade
  effective_from   date not null default '-infinity'
  per              enum('100','serving')
  serving_size     double null
  serving_name     text null
  serving_pieces_count  double null        both set or both null
  serving_pieces_name   text null
  source           enum('package','database','reference','typed')
  kcal, fat, saturates, carbs, sugars, protein, salt, caffeine   double null
  unique (food_id, effective_from)

servings
  id uuid pk, food_id → foods on delete cascade
  name text, size double null, position smallint
  unique (food_id, lower(name))
```

**Icons are saved, with an auto toggle.** With `icon_auto` on, the client fills `icon` from the name's suggestion (or the kind's default) whenever the name changes, and saves it. Picking an icon turns the toggle off. Because the icon is always stored, a later change to the keyword list never changes an existing item's icon, which is what the spec asks for, and the server and dashboard never need the suggestion logic to show one.

Nutrients are columns rather than jsonb. The list follows the EU declaration plus caffeine and changes rarely, and columns let reporting sum them in SQL later. Adding a nutrient is a migration, which is fine.

**Entry-only lines are uncatalogued foods.** In the prototype an entry-only line carries its own `FoodData` (unit, labels, servings). Here that becomes a `foods` row with `kind = 'item'` and `catalogued = false`, and the line points at it. It never shows in lists, search or cards. The gain is that labels and servings always have one owner (a food), and nutrition code reads every line the same way. Turning an entry-only capture into an item is setting `catalogued = true`, optionally with `unsure`. `makeEntryOnly` becomes the reverse, a plain food update that touches no entries. A bare line with only a typed name and no label has no food at all.

**One-off combos are uncatalogued combos too.** A combo built during capture and "just logged", such as a sandwich, is a `kind = 'combo'` row with `catalogued = false`, created with the entry through `newFoods`. The entry's `combo_id` points at it, so the timeline names the entry from the combo, as it does for saved ones, and the entry needs no title column. Saving it for next time, now or later from the entry, sets `catalogued = true`.

### Recipes and combos

```text
batches                    one cooking
  id              uuid pk
  recipe_id       uuid not null
  recipe_kind     food_kind not null default 'recipe'   check (recipe_kind = 'recipe')
  foreign key (recipe_id, recipe_kind) → foods (id, kind)
  made_on         date not null
  yield_grams     double null              at most one set; both null = still cooking (draft)
  yield_portions  double null
  gone            boolean default false
  deleted_at      timestamptz null
  revision        int not null default 1
  created_at

batch_ingredients
  id uuid pk, batch_id → batches on delete cascade
  food_id         uuid not null
  food_kind       food_kind not null default 'item'     check (food_kind = 'item')
  foreign key (food_id, food_kind) → foods (id, kind)   no recipes inside recipes in the MVP
  amount_value double null, amount_unit text null
  base         double null                 amount in the item's unit on the day
  position smallint

combo_parts
  id uuid pk
  combo_id        uuid not null
  combo_kind      food_kind not null default 'combo'    check (combo_kind = 'combo')
  foreign key (combo_id, combo_kind) → foods (id, kind) on delete cascade
  food_id → foods                          an item or a recipe
  amount_value double null, amount_unit text null
  position smallint
```

Batches are returned with their recipe but saved one at a time, through their own endpoint, with their own `revision`. I cooked writes a draft at every step, and saving the whole recipe each time would clash with an edit to an older batch on the other device. A draft (I cooked, not finished) is a batch with no yield, written at each step. The "cooking now" list is `yield_grams is null and yield_portions is null`. "Leftovers" is finished and not gone.

Where a reference must point at one kind of food, the database checks it with a composite foreign key: `foods` has `unique (id, kind)`, and the referencing row carries a constant kind column, as above. `food_kind` is the enum on `foods.kind`. `entries.combo_id` works the same way with a `combo_kind` column. A reference that may point at several kinds (a line, a combo part) is a plain `food_id`. The service still checks that every referenced id belongs to the person.

### Activities

```text
activities
  id            uuid pk
  user_id       uuid null → users on delete cascade   null = public
  name          text not null
  icon          text not null
  icon_auto     boolean not null default true
  measures      enum(distance, duration, sets, reps, weight, laps)[] not null
  burn_basis    enum('distance','reps','duration') null    null = no formula; kcal typed or missing
  burn_factor   double null                kcal/kg/km, kcal/kg/rep, or MET for duration
  check (burn_basis is null) = (burn_factor is null)
  public_key, starter, origin_id    as on foods
  deleted_at, revision, created_at, updated_at       as on foods
```

The prototype keeps built-ins in code and stores an edited copy under the same id. Here built-ins are public rows that anyone can log, and changing one means duplicating it (see Public items).

### Entries

```text
entries
  id          uuid pk
  user_id     uuid not null → users on delete cascade
  kind        enum('food','exercise')
  when_date   date not null
  when_kind   enum('now','exact','part','day')
  when_time   time null                    set for now and exact
  when_part   enum(dawn, morning, afternoon, evening, night) null   set for part
  -- food only
  via         enum('ate','drank') null
  combo_id    uuid null
  combo_kind  food_kind null               'combo' when combo_id is set
  foreign key (combo_id, combo_kind) → foods (id, kind)
  -- exercise only
  activity_id uuid null → activities       required for exercise
  kcal        double null                 burn on the day; null = missing
  kcal_manual boolean default false       typed, so editing measures doesn't recalculate it
  deleted_at  timestamptz null
  revision int, created_at, updated_at
  index (user_id, when_date)

entry_lines
  id uuid pk, entry_id → entries on delete cascade
  position    smallint
  food_id     uuid null → foods            item, recipe, or uncatalogued food
  batch_id    uuid null → batches          only with a recipe
  raw_name    text null
  barcode     text null
  amount_value double null, amount_unit text null
  base        double null
  index (food_id)

exercise_measures
  entry_id → entries on delete cascade
  key   enum(distance, duration, sets, reps, weight, laps)
  value double, unit text
  primary key (entry_id, key)
```

Check constraints tie each `when_kind` to its column and each entry kind to its columns. The prototype's separate `itemId` and `recipeId` on a line collapse into `food_id`, since both point into `foods`.

The ordering key (`sortKey` in core) depends on `day_ends_at`, which can change, so it is computed when reading, not stored.

An exercise entry always has an activity. Typing a name that isn't in the list creates a real activity with that name, default measures and no burn formula, sent with the entry in `newActivities`. Unlike a food, an activity needs nothing more than a name to be complete, so there is no unsure state. The prototype's entry-level `rawName` goes away.

`kcal` is a snapshot taken when the entry is saved: calculated from the formula and that day's weight, or typed. Changing an activity's formula or adding a weigh-in later leaves past days alone. Editing an entry's measures recalculates a calculated `kcal` and keeps a typed one.

Follow-up stays derived, as in the prototype. Nothing stores "needs follow-up". An exercise entry needs follow-up when its `kcal` is null, not when its activity is unknown.

### Deleting

Nothing a person deletes is removed from the database. Foods, activities, batches, entries, weigh-ins and pots all have `deleted_at`, and a delete sets it. A deleted row disappears from lists, search and cards, while past entries that point at it keep showing it. With two people the space doesn't matter, undo is just clearing `deleted_at`, and offline sync will need these markers anyway to tell other devices what was deleted.

Rows inside an aggregate are different: labels, servings, entry lines, exercise measures, batch ingredients, combo parts and plan versions. A whole-aggregate `PUT` replaces them, and the older ones are gone. That isn't lost history: label and plan versions already are the history, and an entry's lines are its current content. The exception is batches. A batch removed from a recipe is soft-deleted like any other row, because entries point at it.

Every reference to a food, activity or batch (lines, ingredients, combo parts, `entries.combo_id`, `entries.activity_id`, `entry_lines.batch_id`) is `on delete restrict`. That protects a later purge job: one that deletes rows soft-deleted more than some months ago can try each delete and skip whatever a foreign key blocks, so a purge can never leave a dangling reference. The job isn't needed for the MVP.

Unique constraints on soft-deletable tables apply only to live rows, for example `unique (user_id, date) where deleted_at is null` on weigh-ins.

Public items can't be deleted through the API.

### Public items

The starter catalogue (generic foods from a reference table, Water, Coffee and Tea, the activities whose factors have been checked) is a set of public rows in `foods` and `activities`, with `user_id` null. They are defined in code under `backend/src/seeds/`, each with a stable `public_key`, and upserted on startup. A changed definition bumps the public row's `revision`; a changed label adds a label version from that day, so past days keep their values.

Public items are read-only, and they are used directly:

- **Logged as they are.** Entries, recipe ingredients and combo parts point at the public row itself. Nothing is copied when an account is created or when an item is first used, so a new person sees the starter cards and reference foods straight away.
- **The code is the source of truth.** Each definition lists all of the item's label versions with their `from` dates, and the startup upsert makes the public row match it exactly. Fixing a wrong value is editing that label in code, and every entry using it changes, past days included. A changed product is a new label with a later `from`, and past days keep the old values. That's the phone's "wrong or changed?" question, answered in the seed file. Name, icon and servings change in place; logged amounts keep their `base`, so a changed serving size doesn't move past days.
- **Duplicate to change one.** A person who wants different values, servings or a variant presses Duplicate. The client sends an ordinary `POST /api/foods` with the public item's content, a new id and `origin_id` set. The result is a plain personal item. It never syncs with the public row, and `origin_id` only records where it came from. The client hides a public item from that person's lists and search once they have a duplicate of it, but past entries that point at the public row still show it.
- **Read-only means 403.** `PUT`, `DELETE` and the commands refuse public ids, except as a merge target: an unsure "onion" can be merged into the public Onion.

The same shape fits sharing between people later: publishing an item would make a public row. The spec keeps that outside the MVP, and nothing here commits to it.

### Icons

The MVP serves the keyword list from code at `GET /api/icons`, with an ETag, so the client can cache it and fall back to its built-in copy. It moves into an `icons` and `icon_keywords (icon_id, locale, keyword)` table once the spec settles who the administrator is and where they edit it. Nothing else depends on it, so waiting costs nothing.

## API

Everything below is under `/api` and behind `authedRouter`, so every call is scoped to `auth.userId`. Bodies are JSON with camelCase keys. The types here are written as TypeScript. The zod schemas in `packages/core` define the same shapes, and the controllers validate with them and generate swagger from them.

### Conventions

- **Dates** are `"YYYY-MM-DD"`. A version start can also be `"-infinity"`. Times are `"HH:MM"`, and timestamps are ISO 8601.
- **Creating** is `POST` with a client-generated `id` in the body. It returns 201 with the stored aggregate. If that id already exists for the same person, the server returns the stored aggregate with 200 and changes nothing, so a retry after a timeout is safe.
- **Replacing** is `PUT` with the full aggregate and the `revision` it was read at. It returns 200 with the stored aggregate and its new `revision`.
- **Deleting** is `DELETE`. It sets `deleted_at` and returns 204. `POST …/:id/restore` clears it and returns the aggregate.
- **`newFoods` and `newActivities`.** Any write that can reference something just created during a capture accepts them. Those rows are created first, in the same transaction, and returned in the response. They cover "Add as unsure", entry-only labels, one-off combos, and "+ New" ingredients while cooking.
- **Previews.** Endpoints marked *previewable* accept `?preview=true`. They run in a transaction that is rolled back and return `Preview` instead of their usual response.
- **Catalogue reads** send an `ETag`. A request with a matching `If-None-Match` gets 304 with no body.

Errors use typeline-http's shape, `{ error: string, statusCode: number, ...details }`:

| Status | `error` | When | Details |
| --- | --- | --- | --- |
| 400 | `BadRequest` | Body, query or params fail validation | zod issues |
| 401 | `Unauthorized` | No session | |
| 403 | `Forbidden` | Writing, deleting or merging from a public item or activity | |
| 404 | `NotFound` | Id doesn't exist or belongs to someone else | |
| 409 | `Conflict` | `revision` is stale | `current`: the stored aggregate, so the client can reload without another request |
| 409 | `Conflict` | A create's id belongs to another person | |
| 410 | `Gone` | Undo token expired | |
| 422 | `UnprocessableEntity` | A rule the schema can't express: a reference to a deleted or foreign row, a batch on a non-recipe line | `reason: string` |

### Shared types

```ts
type Id = string;                       // uuid
type DateKey = string;                  // "YYYY-MM-DD"
type VersionStart = DateKey | "-infinity";

type NutrientKey = "kcal" | "fat" | "saturates" | "carbs" | "sugars" | "protein" | "salt" | "caffeine";
type Nutrients = Partial<Record<NutrientKey, number>>;

type Label = {
  from: VersionStart;
  per: "100" | "serving";
  servingSize?: number;
  servingName?: string;
  servingPieces?: { count: number; name: string };
  values: Nutrients;
  source: "package" | "database" | "reference" | "typed";
};

type Serving = { name: string; size?: number };
type Amount = { value?: number; unit?: string };
type Portion = { foodId: Id; amount: Amount; base?: number };

type FoodCommon = {
  id: Id;
  name: string;
  icon: string;
  iconAuto: boolean;
  catalogued: boolean;
  originId?: Id;                        // duplicated from this public item
};

type FoodItem = FoodCommon & {
  kind: "item";
  unit: "g" | "ml" | "piece";
  variant?: string;
  barcode?: string;
  notFluid: boolean;
  unsure: boolean;
  labels: Label[];                      // oldest first
  servings: Serving[];
};

type Batch = {
  id: Id;
  madeOn: DateKey;
  ingredients: Portion[];
  yield?: { grams: number } | { portions: number };   // absent while cooking
  gone: boolean;
};

type Recipe = FoodCommon & { kind: "recipe" };
type Combo = FoodCommon & { kind: "combo"; parts: Omit<Portion, "base">[] };

type FoodInput = FoodItem | Recipe | Combo;

type Stored = { revision: number; deleted: boolean };
type Public = { public: boolean; starter: boolean };

type StoredBatch = Batch & Stored;
type Food =
  | (FoodItem & Stored & Public)
  | (Recipe & Stored & Public & { batches: StoredBatch[] })   // oldest first
  | (Combo & Stored & Public);

type MeasureKey = "distance" | "duration" | "sets" | "reps" | "weight" | "laps";
type Burn =
  | { basis: "distance"; kcalPerKgKm: number }
  | { basis: "reps"; kcalPerKgRep: number }
  | { basis: "duration"; met: number };

type ActivityInput = {
  id: Id;
  name: string;
  icon: string;
  iconAuto: boolean;
  measures: MeasureKey[];
  burn?: Burn;
  originId?: Id;
};
type Activity = ActivityInput & Stored & Public;

type When =
  | { date: DateKey; kind: "now" | "exact"; time: string }
  | { date: DateKey; kind: "part"; part: "dawn" | "morning" | "afternoon" | "evening" | "night" }
  | { date: DateKey; kind: "day" };

type Line = {
  id: Id;
  foodId?: Id;                          // item, recipe or uncatalogued item
  batchId?: Id;                         // only with a recipe
  rawName?: string;
  barcode?: string;
  amount: Amount;
  base?: number;
};

type FoodEntryInput = { id: Id; kind: "food"; when: When; via: "ate" | "drank"; comboId?: Id; lines: Line[] };
type ExerciseEntryInput = {
  id: Id;
  kind: "exercise";
  when: When;
  activityId: Id;
  measures: Partial<Record<MeasureKey, { value: number; unit: string }>>;
  kcal?: number;
  kcalManual: boolean;
};
type EntryInput = FoodEntryInput | ExerciseEntryInput;
type Entry = EntryInput & Stored & { createdAt: string };

type Plan = {
  goal: { kgPerWeek: number; targetKg?: number };
  metabolismMultiplier: number;
  calibratedFrom?: { maintenanceKcal: number; loggedExerciseKcal: number };
  fluidGoalMl: number;
  macroPlan: {
    preset: "balanced" | "high-protein" | "low-carb" | "keto" | "low-fat";
    proteinPerKg: number;
    fatPct?: number;                    // exactly one of fatPct and carbPct
    carbPct?: number;
  };
};
type PlanVersion = { from: VersionStart; plan: Plan };
type PlanHistory = { versions: PlanVersion[]; revision: number };   // oldest first

type ProfileInput = {
  units: "metric" | "imperial";
  heightCm?: number;
  birthday?: DateKey;
  sex?: "male" | "female";
  dayEndsAt: number;                    // 0..6
};
type Profile = ProfileInput & { revision: number };

type Pot = { id: Id; name: string; grams: number };
type WeighIn = { id: Id; date: DateKey; kg: number };

type Part = { value: number; missing: number };
type DayTotals = { kcal: Part; protein: Part; carbs: Part; fat: Part; fluid: Part; burned: number };
type Preview = { days: { date: DateKey; before: DayTotals; after: DayTotals }[] };

type CommandResult = { foods: Food[]; entries: Entry[]; undoToken: string; undoExpiresAt: string };
type Created = { newFoods: Food[]; newActivities: Activity[] };
```

`Food` and `Entry` are what the server returns, and the `…Input` types are what a client sends. On `PUT`, a client sends the input plus `revision`. Labels, servings, combo parts and entry lines are replaced as a whole on every save, so they carry no ids of their own except lines, which the prototype already gives ids.

### Session and settings

**`GET /api/me`.** Everything the apps load at start, in one request. It replaces the scaffold's `GET /api/auth/me`.

```ts
type Response = {
  user: { id: Id; email: string | null; name: string | null };
  profile: Profile;
  plan: PlanHistory;
  pots: Pot[];
};
```

**`PUT /api/profile`**

```ts
type Request = ProfileInput & { revision: number };
type Response = Profile;
```

**`POST /api/plan`.** Same semantics as `savePlan` in core. `"fix"` rewrites the newest version. A date starts a new version there and drops later ones. A plan identical to the current one is a no-op.

```ts
type Request = { plan: Plan; change: "fix" | { from: DateKey }; revision: number };
type Response = PlanHistory;
```

**`POST /api/pots`, `PUT /api/pots/:id`, `DELETE /api/pots/:id`**

```ts
type Request = Pot;
type Response = Pot;
```

**`GET /api/weigh-ins`.** All of them, oldest first. Two people weighing in daily for years is a few thousand rows.

```ts
type Response = { weighIns: WeighIn[] };
```

**`POST /api/weigh-ins`.** A weigh-in on a date that already has one soft-deletes the old one.

```ts
type Request = WeighIn;
type Response = WeighIn;
```

**`DELETE /api/weigh-ins/:id`**

### Foods

**`GET /api/foods`.** The person's whole catalogue, deleted foods and uncatalogued ones included, since past entries need them. Also every public item, including ones the person has duplicated, since their past entries may point at them. Sends an `ETag` built from the latest `updated_at` and the row count across those rows.

```ts
type Response = { foods: Food[] };
```

**`GET /api/foods/usage`.** What the cards are ordered by, computed in SQL so the client doesn't need every entry.

```ts
type Response = {
  usage: {
    foodId: Id;
    lastLoggedAt: string;
    ate30d: number;                     // entries in the last 30 days, by verb
    drank30d: number;
    usualAmount?: Amount;               // from the last time it was logged on its own
  }[];
};
```

**`POST /api/foods`.** A recipe is created without batches. Its first batch goes through the batch endpoint, which can also carry the new recipe in `newFoods`, so I cooked's first step is one request.

```ts
type Request = FoodInput & { newFoods?: FoodInput[] };
type Response = { food: Food } & Created;
```

**`PUT /api/foods/:id`.** *Previewable.* Replaces an item's labels and servings or a combo's parts. A recipe's batches are ignored here. Label timeline edits on the dashboard (change values, split, merge versions) are this call with different `labels`. Completing an unsure item as an item is this call with `unsure: false` and a label. Making an item entry-only is this call with `catalogued: false`. Its entries keep pointing at it. Also returns an undo token, because the history editor's label changes need undo.

```ts
type Request = FoodInput & { revision: number; newFoods?: FoodInput[] };
type Response = { food: Food; undoToken: string; undoExpiresAt: string } & Created;
```

**`DELETE /api/foods/:id`**, **`POST /api/foods/:id/restore`**

```ts
type Response = Food;                   // restore only
```

**`PUT /api/foods/:recipeId/batches/:batchId`.** Creates or replaces one batch. A new batch sends `revision: 0`. I cooked calls this at every step, and the last call sets `yield`. Marking a batch eaten up is this call with `gone: true`.

```ts
type Request = Batch & { revision: number; newFoods?: FoodInput[] };
type Response = { batch: StoredBatch } & Created;
```

**`DELETE /api/foods/:recipeId/batches/:batchId`**, **`POST …/restore`**

### Activities

**`GET /api/activities`.** The person's activities and every public one, with an `ETag`.

```ts
type Response = { activities: Activity[] };
```

**`POST /api/activities`**, **`PUT /api/activities/:id`**, **`DELETE /api/activities/:id`**, **`POST /api/activities/:id/restore`**

```ts
type Request = ActivityInput;                         // POST
type Request = ActivityInput & { revision: number };  // PUT
type Response = Activity;
```

### Entries

**`GET /api/entries`.** Entries whose `when.date` falls in the range, both ends inclusive. With `foodId`, only those with a line pointing at that food, for the item editor's "used by" list and the label timeline.

```ts
type Query = { from: DateKey; to: DateKey; foodId?: Id };
type Response = { entries: Entry[] };
```

**`POST /api/entries`.** The client computes `base` on lines and `kcal` on exercise with core, and the server stores what it gets.

```ts
type Request = EntryInput & { newFoods?: FoodInput[]; newActivities?: ActivityInput[] };
type Response = { entry: Entry } & Created;
```

**`PUT /api/entries/:id`**

```ts
type Request = EntryInput & { revision: number; newFoods?: FoodInput[]; newActivities?: ActivityInput[] };
type Response = { entry: Entry } & Created;
```

**`DELETE /api/entries/:id`**, **`POST /api/entries/:id/restore`**

```ts
type Response = Entry;                  // restore only
```

### Follow-up

**`GET /api/follow-up`.** The inbox, computed on the server with core's rules. It returns the entries themselves, because they may lie outside any range the client has loaded.

```ts
type Response = {
  unsureItems: { foodId: Id; entryIds: Id[]; usedByFoodIds: Id[] }[];   // most used first
  entries: Entry[];                     // lines with missing calories, exercise with no kcal
};
```

### Commands

All are *previewable* and return `CommandResult`: every food and entry the command changed, in their new state, plus an undo token.

**`POST /api/foods/:id/merge`.** Moves everything that uses this food (lines, ingredients, combo parts) to the target, then soft-deletes this food. This is completing an unsure item by swapping it for an existing item, recipe or combo (`mergeInto`), and also the history editor's item merge. Into a combo, each line expands into the combo's parts scaled by the logged amount. Into a recipe, lines take its current batch. A barcode moves over if the target has none.

```ts
type Request = { targetId: Id };
type Response = CommandResult;
```

**`POST /api/foods/:id/complete-as-combo`.** Completes an unsure item by listing what was in it (`completeAsCombo`): creates the combo, then merges into it.

```ts
type Request = { combo: Combo; newFoods?: FoodInput[] };
type Response = CommandResult;
```

**`POST /api/entries/reconvert`.** Recomputes `base` on the chosen lines from their food's current servings, for "every 1 pack since September was really 150 g".

```ts
type Request = { lineIds: Id[] };
type Response = CommandResult;
```

**`POST /api/entries/move-to-batch`.** Points the chosen recipe lines at another batch of the same recipe.

```ts
type Request = { lineIds: Id[]; batchId: Id };
type Response = CommandResult;
```

**`POST /api/undo/:token`.** Reverses a command or food `PUT`. Fails with 409 if any row it touched was edited since, and with 410 once the token has expired.

```ts
type Response = { foods: Food[]; entries: Entry[] };
```

The undo mechanism: before a command writes, the service stores a before-image of every row it will touch, as JSON, in Redis under `undo:{userId}:{token}` with a 15-minute expiry, far longer than any toast stays up. Anything older is redone by hand. Undo checks that each row's `revision` still matches what the command left, then restores the before-image in one transaction. An expired token needs no cleanup job.

### Lookups

**`GET /api/barcodes/:code`.** Barcodes aren't unique, so a scan narrows the list rather than picking an item. The response has every live catalogued item with that code, the person's own first and then public ones, plus the Open Food Facts result. OFF is asked only when no item matches. It wants an identifying User-Agent, and its results are cached in Redis for a week, so repeat scans don't hit their API. The client could match its own catalogue locally, since it holds all of it, but one call keeps the order and the OFF fallback in one place.

```ts
type Response = {
  foods: Food[];                        // the person's own first, then public
  openFoodFacts?: { name: string; brand?: string; unit: "g" | "ml"; label?: Label; servings: Serving[] };
};
```

**`GET /api/icons`.** The keyword list, with an `ETag`. The client keeps the last copy and falls back to its built-in list.

```ts
type Response = { icons: { icon: string; group: "food" | "drink" | "activity"; names: string[] }[] };
```

### Import

**`POST /api/import`.** Moves a prototype export (version 2 or 3) into an empty account, once. A non-empty account gets 409, so an import can't double anything up. Every write happens in one transaction. Non-UUID ids from the prototype (`seed-water`, built-in activity ids like `walk`) get new UUIDs, and references are rewritten to match. Lines with an `own` label become uncatalogued items, and exercise `rawName`s become activities.

```ts
type Request = { app: "dash"; version: 2 | 3; exportedAt: string; data: Record<string, unknown> };
type Response = { foods: number; entries: number; activities: number; weighIns: number; pots: number };
```

### Sign-in

These already exist and stay as they are: `GET /auth/google/authorize?returnTo=`, `GET /auth/google/callback`, `GET /auth/logout`. They sit outside `/api` because they redirect rather than return JSON.

## Code layout

The scaffold's layers stay and get filled in:

```text
packages/core/                 domain types, pure functions, zod API schemas
backend/src/
  db/schema.ts                 tables above
  db/migrate.ts                runs drizzle migrations; separate from server start
  seeds/                       public item definitions and the startup upsert
  repositories/                one per aggregate: load and save a whole aggregate
  services/                    transactions, ownership checks, commands, preview, undo
  controllers/                 typeline routes: validate, call a service, respond
  providers/                   db, redis, auth, logger, openFoodFacts
```

- **Repositories** take a `Db` or a transaction handle, so a service can run several in one transaction. A repository loads an aggregate as the core type and saves one by diffing children by id: update, insert, delete what's gone.
- **Services** own the rules the database can't express: kind checks on references, every referenced id belonging to the person or being public, no writes to public rows, `newFoods`, revision checks. They are where tests concentrate.
- **Controllers** stay thin, as `auth.controller.ts` is now. Validation uses the zod schemas from core, so swagger output and frontend types come from the same source.

Migrations come from `drizzle-kit generate`, are committed under `backend/drizzle/`, and run with a `db:migrate` script before the server starts in deploy. The server doesn't migrate on boot, so a bad migration fails a deploy step instead of a running process.

Repository and service tests run against a real Postgres, since the schema leans on check constraints, `-infinity` and restrict-on-delete that a mock wouldn't catch.

One tooling snag: the frontend uses bun and the backend pnpm. `packages/core` has to be consumable by both, which most likely means making the repo a pnpm workspace and dropping `bun.lock`.

## Order of work

1. **Replace IndexedDB.** Extract `packages/core`. Schema for profiles, plans, weigh-ins, pots, foods, labels, servings, batches, combo parts, activities, entries. The CRUD endpoints, `usage`, `follow-up`, public items, and `import`. The capture app switches from its stores to the API. This is everything the prototype already does. The switch also brings `revision` into the core types: every save sends the revision it holds, a 409 reloads that aggregate and tells the person it changed on another device, and the app re-fetches the catalogue (a 304 when nothing changed) whenever it returns to the foreground.
2. **Follow-up commands** with preview and undo: `merge` and `complete-as-combo`. The capture app needs them for the inbox.
3. **Barcode proxy and icons.**
4. **History editor commands** for the dashboard: merge, reconvert, move lines, label preview.
5. **Reporting.** Range totals computed with core on the server for the dashboard's charts. If month views get slow, a per-day totals cache invalidated on writes, but not before measuring.

## Open decisions

- **Public corrections with more people.** Fixing a public value in place changes everyone's past days. That's fine for two people. With more, it may need announcing or a per-person review, much as SPEC.md asks for conflicting values.

## Handoff

This plan was agreed over one long discussion on 10 October 2026. A new session should treat it as decided and build from it, not reopen it. Where it differs from REVISED_SPEC.md or SPEC.md, this file wins.

### Where things stand

- **Nothing in the backend is built yet** beyond the scaffold: Google sign-in, Redis sessions, the `users` table, swagger. No migrations are committed, and `backend/drizzle/` doesn't exist yet.
- **The prototype already uses `BEGINNING = "-infinity"`** (`frontend/src/core/types.ts`) for label and plan versions with no start date. `persist.ts` upgrades stored `""` values on load, and the export format is version 3.
- **The prototype counts `entries.comboId` as a use** when deleting a food, and shows a saved combo's current name. `FoodEntry.title` is now set only on one-off combos.
- **All of the above is uncommitted** on `fix/backend-startup`, together with this file and a REVISED_SPEC.md edit.

### Prototype changes deferred to phase 1

These were agreed, but they belong with the switch from IndexedDB to the API:

- **Icons are always saved.** `icon` becomes required and `iconAuto` is added on items, recipes, combos and activities. `IconField` saves the suggestion instead of `undefined`, and the data upgrade fills in icons that are missing.
- **Exercise drops `rawName`.** Typing an unknown activity creates an activity. `entryNeedsFollowUp` checks `kcal === undefined` for exercise.
- **One-off combos become uncatalogued combos**, and `FoodEntry.title` goes away.
- **Entry-only lines become uncatalogued items**, and `Line.own` goes away.
- **`revision` is added to the core types**, with the 409 handling described in Order of work.
- **The prototype's seed lists move to public items**: `seeds` in `foods.ts` and `builtIns` in `activities.ts`. Only Walk, Run and Cycle carry over until the other activities' factors are checked.

### Decided in discussion, not written elsewhere

- **Floats are `double precision`.** Revisit only if real data shows precision trouble. Never use `real`, and never use `numeric` with a fixed scale: `base` and factors like 0.005 need more than two decimals.
- **Unit conversion.** Weight, height, fluid and yields are stored metric (kg, cm, ml, g) and converted only in the client. Forms send only fields the person changed, never values re-parsed from a rounded display, because re-saving a displayed value drifts it by up to half a display step. Charts do maths in metric and convert at the end.
- **"Imperial" is really US customary.** Fluid ounces are US (29.5735 ml), and there's no stone. That's left as is until someone needs UK units.
- **Exercise `kcal`** is a snapshot taken at save time. `kcalManual` means typed, which stops a measure edit from recalculating it.
- **`foods` stays one table.** Item-only columns move to an `items` table keyed by `food_id` only if items gain many more of them.

### Working in this repo

- **User conventions.** Commits are one line, `type(scope): message`, and branches are `feat/…` or `fix/…`. Never add `-u` or assume upstream tracking: always `git push origin HEAD`. Comments only where something is non-obvious. These come from the user's global CLAUDE.md.
- **Libraries.** The backend uses the user's own packages from `~/repos/personal/libs/packages`: typeline-http (routing, validation, swagger, `JsonHttpError` and its subclasses), typeline, http-auth, auth, drizzle (`sqlFilterForDialect`, `sortResolver`), redis, zod. Read their source when unsure. They aren't on the public internet.
- **Tooling.** The frontend uses bun and the backend uses pnpm. Sharing `packages/core` will most likely mean a pnpm workspace at the repo root. Check with the user before moving the frontend off bun.
- **Checks.** `pnpm check` and `pnpm test` in `backend/`. `npx tsc -b` and `npx vite build` in `frontend/`. Repository and service tests need a real Postgres. There's no compose file yet, so ask how the user runs Postgres and Redis locally before adding one.
- **Drizzle details to verify early.** `date` columns in `mode: "string"` return `-infinity` unchanged. Composite foreign keys use `foreignKey({ columns, foreignColumns })`. Postgres check constraints are written in `check()`.

### Suggested first steps

1. Extract `packages/core` from `frontend/src/core` (no stores, no React) and get both apps building against it.
2. Write `schema.ts` for phase 1, generate the first migration, and add a `db:migrate` script.
3. Build `GET /api/me`, profile, plan and weigh-ins end to end, with tests. That proves the repository/service/controller pattern on simple tables before foods and entries.
4. Then foods, batches, activities, entries, public item seeding, `usage`, `follow-up`, and `import`, in that order.

