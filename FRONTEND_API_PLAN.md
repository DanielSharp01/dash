# Capture app on the API

Status: agreed 10 October 2026. This moves the capture app from IndexedDB onto the backend described in [BACKEND_PLAN.md](BACKEND_PLAN.md), which is built and tested on `feat/backend-api`. Where this file and the backend plan disagree about the frontend, this file wins.

## Decisions

**Online only.** Every save goes to the server. There is no outbox, no offline queue and no local copy of the data. A save that fails for lack of a connection says so and offers a retry. Offline capture can come later, and the client-generated ids and idempotent creates already make a replay safe.

**Optimistic writes, guarded by revisions.** Creates, replaces, deletes and restores show up at once and reconcile with the server's answer. A 409 replaces the cached row with `current` from the error body and tells the person the item changed on another device. Any other failure rolls the cache back. Commands (merge, complete as combo, reconvert, move to batch) wait for the server, since only the server knows every row they touch.

**TanStack Query holds the server state.** It replaces `createStore`, `persist.ts` and IndexedDB.

**Plain API functions live in `frontend/src/api/{group}.api.ts`.** They know URLs and types and nothing about React or caching. Query and mutation hooks sit on top of them.

**Entries load per day.** Today and the day pickers ask for one day at a time, as the prototype shows them. Nothing loads the whole history.

**The follow-up inbox comes from `GET /api/follow-up`.** The client no longer computes it.

**Undo goes through the server.** A deleted row comes back through its restore endpoint. A command or a food save comes back through `POST /api/undo/:token`.

**The prototype's data goes.** No import button and no migration. `persist.ts`, the export and import buttons in Profile, the LAN backup buttons and the `devBackup` Vite plugin are removed. `.dash-backup/backup.json` stays in the repo as a file for now, unused.

## Layout

```text
frontend/src/
  api/
    client.ts              fetch wrapper: JSON, credentials, ApiError
    me.api.ts              GET /me, PUT /profile, POST /plan
    foods.api.ts           foods, usage, batches
    activities.api.ts
    entries.api.ts         entries by day, follow-up
    commands.api.ts        merge, complete-as-combo, reconvert, move-to-batch, undo
    weighIns.api.ts
    pots.api.ts
    lookups.api.ts         barcodes, icons
  queries/
    keys.ts                query keys in one place
    {group}.queries.ts     useQuery and useMutation hooks per group, with the cache updates
  capture/                 screens, flows, editors as now
```

`src/core/` goes. Its domain code comes from `@dash/core`. The parts that depend on the browser or on the person's settings move into `capture/`, for example `dayLabel`, `whenLabel`, `todayKey` and `nowWhen` from `time.ts`, which now read `dayEndsAt` from the `/me` query.

`api/` and `queries/` sit beside `capture/` rather than inside it, because the dashboard will use the same ones.

### The API client

`client.ts` sends `credentials: "same-origin"`, sets `content-type: application/json` on bodies, and turns a non-2xx response into an `ApiError` with `status`, `error`, `reason` and the rest of the body. A 409 with `current` keeps it on the error. A 401 anywhere sends the browser to `/login`.

Response types come from the zod schemas in `@dash/core` (`z.infer`). The client doesn't parse responses at runtime. The server already validates what it stores, and parsing every catalogue fetch costs time on a phone for no gain.

### Query keys

| Key | Endpoint | Notes |
| --- | --- | --- |
| `["me"]` | `GET /me` | user, profile, plan history, pots |
| `["foods"]` | `GET /foods` | the whole catalogue; refetched on window focus |
| `["foods", "usage"]` | `GET /foods/usage` | card order, usual amounts, use counts |
| `["activities"]` | `GET /activities` | refetched on window focus |
| `["activities", "usage"]` | `GET /activities/usage` | exercise recents |
| `["entries", date]` | `GET /entries?from=date&to=date` | one day |
| `["entries", "food", foodId]` | `GET /entries?foodId=…` | "used by" lists in editors |
| `["follow-up"]` | `GET /follow-up` | |
| `["weigh-ins"]` | `GET /weigh-ins` | |
| `["icons"]` | `GET /icons` | long stale time; the built-in list in `@dash/core` is the placeholder |

The catalogue and activity reads send an ETag. The browser's HTTP cache revalidates them with `If-None-Match` on its own and hands `fetch` the cached body on a 304, so the client needs no ETag code. TanStack's structural sharing then keeps object identity, and screens that didn't change don't re-render.

Core functions that take a `FoodLookup` get one from `useFoodLookup()`, which builds `lookupOf(foods)` once per catalogue version.

### Mutations

Every mutation that touches an aggregate runs in a TanStack mutation `scope` keyed by that aggregate's id, such as `{ id: "food:<id>" }`. Mutations in one scope run one after another, so two quick edits to the same entry don't race. The mutation function reads the revision from the cache when it runs, not when it was queued, so the second edit sends the revision the first one returned.

The cache updates for each optimistic write:

- **Create.** `onMutate` inserts the row with `revision: 1` and `deleted: false`. `onSuccess` replaces it with the server's row and merges `newFoods` and `newActivities` into their caches. A 200 instead of 201 means a retry found the row already stored, and the stored row wins.
- **Replace.** `onMutate` writes the edited row with `revision + 1`. `onSuccess` writes the server's row. On 409, `onError` writes `error.current` and shows "Changed on another device".
- **Delete.** `onMutate` marks the row `deleted` and drops it from the day's entries. The toast's undo calls the restore endpoint.
- **Entries that move days.** Changing an entry's date removes it from the old day's key and adds it to the new one.

Commands aren't optimistic. Their `CommandResult` lists every food and entry they changed. `onSuccess` writes each one into `["foods"]` and the matching `["entries", date]` keys, invalidates `["follow-up"]` and `["foods", "usage"]`, and the toast offers undo with the returned token. `?preview=true` is a separate call that the history editor can use later. The capture app doesn't need it yet.

`POST /undo/:token` returns the restored foods and entries, which go into the cache the same way. A 409 ("edited since") or a 410 ("expired") shows a message and leaves the cache alone.

## Model changes in the client

The deferred changes from BACKEND_PLAN.md all land here, because the client now uses the API's shapes:

- **`Line.foodId`** replaces `itemId` and `recipeId`. Recipe lines are lines whose food is a recipe.
- **Entry-only captures are uncatalogued items.** The capture flow creates an item with `catalogued: false` and sends it in `newFoods`. `Line.own` goes.
- **One-off combos are uncatalogued combos.** "Just log it" sends the combo with `catalogued: false` in `newFoods` and sets `comboId`. `FoodEntry.title` goes. "Save for next time" is a food save with `catalogued: true`.
- **Icons are always saved.** `IconField` stores the suggestion and keeps `iconAuto` on until the person picks one. `foodIcon()` goes, since `icon` is always set.
- **Exercise has no `rawName`.** Typing an unknown activity creates one in `newActivities`. An exercise entry needs follow-up when `kcal` is missing.
- **Every stored row carries `revision`** and the server's `deleted` flag.
- **Public items replace the seed lists.** Starter cards are public foods and activities with `starter: true`. Duplicate is a plain `POST /foods` with `originId`, and the client hides a public item from lists and search once the person has a live duplicate of it.
- **Deleting is always soft.** The prototype's "hide if used, remove if not" logic goes away, along with the "batch is in use" check before deleting a batch.
- **Converting a combo to a recipe, or back,** stays as it is now: create the new food, then delete the old one.

## What the screens need

| Screen or flow | Today | After |
| --- | --- | --- |
| Today | all entries, filtered to the day | `["entries", day]` |
| Eat and drink cards, recents, usual amount | computed from all entries | `["foods", "usage"]` |
| Exercise recents | computed from all entries | `["activities", "usage"]` |
| Catalogue use counts | `entriesUsing` over all entries | `uses` in `["foods", "usage"]` |
| Item editor "used by" | all entries | `["entries", "food", id]` |
| Follow-up badge and inbox | `followUpCount` locally | `["follow-up"]` |
| Known maintenance in Profile | exercise over all entries | `GET /entries` for the last 28 days |
| Barcode scan | Open Food Facts from the browser | `GET /barcodes/:code` |

## Backend additions

These were missing for the screens above and are now built and tested:

1. **`GET /api/activities/usage`** returns each activity's last live entry, newest first, for the exercise recents.
2. **`uses` on `GET /foods/usage`** counts live entries with a line on the food plus entries logged as the combo. A food that was only ever part of a bigger entry now has a row too, without `lastLoggedAt`.
3. **`API_HOST`** is the origin the browser sees, such as `https://dash.example.com`. The callback builds its redirect URI as `${API_HOST}/auth/google/callback` instead of from the request, so a proxy in front changes nothing, and the swagger route adds `API_HOST` as the document's server. There is no per-request host and no `API_PATH`: the `/api` and `/auth` prefixes stay fixed in code. Each `API_HOST` in use needs its redirect URI registered with Google, which accepts `localhost` or a real domain but not a private IP.

## Sign-in and local development

- A `/login` page with one "Sign in with Google" link to `/auth/google/authorize?returnTo=<current path>`. The callback already redirects to `/login?error=…` on failure.
- Vite proxies `/api` and `/auth` to `VITE_PROXY_API_URL`, `http://localhost:4000` by default. Everything stays same-origin, so there's no CORS, and the `__Host-auth` cookie works. Browsers accept `Secure` cookies on `http://localhost`.
- On the desktop, `API_HOST` is the Vite origin. Testing on the phone uses a hostname on the person's own domain that points at the dev machine, with `HTTPS=1`, and `API_HOST` set to it. The app is also meant to be deployed on that domain.
- The dev database needs recreating once before `pnpm db:migrate`. Its `users` table was made without migrations.
- `backend/.env` needs `API_HOST` (for example `http://localhost:5173`); the server refuses to start without it.

## Order of work

1. `api/` and `queries/`, the login page and the Vite proxy. Remove `persist.ts`, `createStore` and the backup plugin.
2. Swap `src/core` for `@dash/core` and apply the model changes. The app won't build between this step and the next, so they go in one branch.
3. Move each screen onto the queries: Today, the eat flow, the exercise flow, cooking, Catalogue, Profile and Goals, follow-up.
4. Undo, the 409 message and the offline message, checked on the phone.

## Checks

`npx tsc -b` and `npx vite build` in `frontend/`, and the backend's suites when a backend addition changes. The frontend has no tests yet. A first set would cover the cache updates in `queries/`, since that's where optimistic writes, scopes and 409 handling can go wrong without anyone noticing on screen.
