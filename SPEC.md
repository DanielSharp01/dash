# Dash product spec

Status: draft for discussion. The behavior described here comes from product discussion. The existing frontend and backend are prototypes, not requirements or constraints. The backend may be replaced, including with another language.

## Purpose

Dash is a dashboard for lifestyle health: the everyday choices and patterns a person wants to observe outside medical care. The first practical use case is personal weight-loss tracking through food and drink records, nutrition budgets, exercise adjustments, and weight trends. Recording should stay useful even when the person does not know the exact product, portion, or calories at the time. Over time, Dash can bring together nutrition, fluids, caffeine, sleep, and other lifestyle signals so a person can explore how their habits relate to how they feel. Weight-gain planning and broader fitness tools are outside the initial scope.

## Core concepts

- **Capture:** A record of what happened, when it happened, and whatever evidence the person has. Food, drink, and exercise can all be captured; details can be completed later.
- **Item:** A particular food or drink, with values that a capture can use. Its source and exact data shape are undecided.
- **Recipe group:** A label that connects related preparations, such as different versions of chicken stew. Each preparation can have its own ingredients and amounts.
- **Variant:** A related version of a recipe or item. For example, yoghurts from different brands or stores can be grouped while retaining their own nutritional values.
- **Resolution:** Completing a capture later by selecting or creating an item or recipe and clarifying its amount. A person can also finish a capture with estimated calories without creating an item; estimated and missing nutrients remain visible.
- **Goal:** A target or range for a metric, such as calories, macros, weight-loss progress, or fluid intake. Presets and personal settings can define goals.

These are product terms for discussion. They do not yet prescribe table names or API shapes.

## Mobile flow: quick "I ate" capture

The mobile experience should make "I ate" quick and pleasant to use. A person can choose from a searchable most-recently-used list of items and recipes, scan a product code when the device supports it, or describe an unsure item for later. Camera scanning should appear only when the browser and device can support it; search and manual entry remain available. See [capture_spec.md](capture_spec.md) for the capture and follow-up behavior.

The capture flow should allow:

- A short free-text description of what happened.
- An exact time by default for an immediate capture. The person can change it, record a past day, or use a rough part of the day when they do not remember the time: dawn or early morning, morning, afternoon, evening, or night.
- A measurement chosen from common units or saved item measures, or a free-text measurement to clarify later. The item and measurement may each be unsure independently.
- Any other useful details known at the time, such as brand or a note.
- A scanned or entered product code as evidence, even if no matching item is found immediately.

After saving, the capture should appear in the day's timeline with its unsure or estimated details visible. The person can add information or resolve it later. A failed or missing code lookup must not prevent saving the capture. Entries are personal records and can be corrected or backfilled; the app does not need anti-tampering rules.

The mobile flow should also provide a path from the timeline to the daily dashboard and to captures that still need resolution.

Dash should be an installable progressive web app. If the backend is unavailable, a person should still be able to open the capture flow, save a new entry with an unsure name and optional scanned barcode for later resolution, and search locally cached items when available. Aim to cache the catalogue when practical, then revise that strategy if its size or browser storage limits require it. The app should show which captures are saved locally and still need syncing, then sync them when service returns without duplicating entries. Lack of a cached item match must not block capture. The precise offline storage and sync mechanisms are implementation decisions.

## Resolution flow

A person can return to an unfinished food or drink capture, inspect its original details, and identify the item and amount. Follow-up may create a new item, choose an existing item, or create an item or recipe variant. A product code may help find a candidate, but a match alone does not clarify an unsure measurement. The person should be able to correct a resolution later. An estimated calorie value can be provisional while the entry awaits follow-up, or the person can mark the entry done with an estimate alone and no item. Macro estimates are optional in either case. Exercise captures can likewise be completed later with activity measurements.

The inbox should make unfinished captures easy to find without interrupting quick capture. An entry marked done with an estimate no longer needs to appear in the inbox, even if its item and measurement remain unsure. The exact matching sources and amount-entry controls remain open design decisions.

## Daily dashboard

The daily dashboard shows a selected day's intake, exercise, and goals alongside a chronological or day-part view of its captures. It should distinguish:

- Nutrition totals calculated from known items and amounts.
- Food and drink captures whose nutritional contribution is still unknown.
- Calorie estimates, distinguished from values calculated from known items, whether the entry is awaiting follow-up or marked done.
- A baseline calorie target, a chosen lower intake bound, any additional allowance from exercise, the resulting daily budget, and the remaining or exceeded amount, with wording that makes incomplete totals clear.
- Macronutrient totals and goals, including protein, carbohydrates, and fat.

Unknown calories and macros must not silently count as zero. A calorie estimate may contribute to an approximate daily total, but the dashboard must label that total accordingly. If macros were skipped, the macro view must show that its totals and distribution are incomplete, including for entries marked done with estimated calories. The dashboard should let the person open an entry to add details or resolve it. Exercise can increase the amount a person may eat while remaining within their daily goal; it must not lower the baseline eating target. The user's chosen lower bound should be visible on the day and on relevant graphs, perhaps as a dotted line. Going below it is an insight, with patterns over time more useful than treating one day as a diagnosis. The lower bound may initially be based on the personal deficit target; the spec does not assert that basal metabolic rate is a safe minimum or define a universal threshold.

The proposed first calculation is:

```text
baseline maintenance estimate = estimated basal energy expenditure × personal baseline multiplier
baseline eating target      = baseline maintenance estimate − chosen daily deficit
daily eating budget         = baseline eating target + eligible logged exercise expenditure
```

The default baseline multiplier is **1.4**. Each person can change it in settings; it need not drift automatically and may remain stable unless their routine changes substantially. A **500 kcal/day** deficit and **1,800 kcal** baseline eating target are one user's personal example, not app-wide defaults. At that target, eligible exercise estimated at 300 kcal can raise the day's eating budget to 2,100 kcal. If the person does not use that extra allowance, their achieved deficit may be larger that day. Eating 1,500 kcal with no exercise is below the personal baseline target and should be visible as such. The deficit, lower bound, and treatment of exercise expenditure should also be configurable per person.

Only the estimated *incremental* cost of logged exercise should be added to a baseline that already includes ordinary daily activity. An exercise source may report total energy spent during an activity rather than the extra energy above that baseline; the app must identify which it received before adding it to the budget. Exercise calorie estimates are uncertain, so the allowance should be presented as an estimate.

**Evidence note:** A 500 kcal/day deficit is a common planning method in [NHLBI's adult weight-management evidence review](https://www.nhlbi.nih.gov/sites/default/files/media/docs/obesity-evidence-review.pdf). The [NIDDK Body Weight Planner](https://www.niddk.nih.gov/bwp) uses a typical sedentary physical activity level of about 1.4. Long-term weight forecasts should be checked against actual weight measurements because a fixed calorie deficit does not produce a fixed rate of weight change indefinitely; [NIDDK's dynamic model](https://www.niddk.nih.gov/research-funding/technology-advancement-transfer/research-materials-licensing/body-weight-simulator-java-applet) accounts for metabolic changes during weight loss.

The first prototype does not need a separate adjustment for muscle mass or body composition. Such an adjustment could be explored later if the simpler estimate and observed weight trends show a need for it.

An uncommitted later idea is to compare predicted and measured weight trends and suggest a personal multiplier range. Two initially sedentary users report very different apparent maintenance intakes, so the same multiplier may fit them differently. This is not a planned feature yet. If explored, the suggestion would need enough complete records and should explain uncertainty: a mismatch could come from the multiplier, the basal estimate, food logs, exercise estimates, or short-term weight variation. A fitted multiplier would be an *effective calibration factor*, not a measurement of basal metabolic rate or activity alone. It would never silently rewrite past records.

Personal goal settings should include an estimated daily calorie deficit, a lower intake bound, and a target macro distribution. Presets, such as a general healthy-eating or low-carbohydrate pattern, can provide starting points, but every target should be customizable. Whether macro goals are entered as percentages, amounts, or both remains open.

## Weekly and monthly views

The app should also offer weekly and monthly views with graphs and aggregates. These views should help the person see patterns in intake and budget use over time, and navigate back to a day for detail. Days with missing contributions or estimate-only entries should be visibly marked so a graph does not present partial or estimated totals as fully known.

The first three visualization priorities are estimated weight loss versus recorded weight measurements, macro distribution, and fluid intake. Weight views must make clear that a forecast and an observation are different. Other dimensions, including caffeine, can be added as they become useful. The two initial users are programmers, so dashboards and graph definitions should be customizable in code. Showing a day that exceeds the eating budget next to a lower-intake day, without implying that the latter must compensate for the former, remains an open design question. The specific charts and treatment of missing days remain open. Nutrient or calorie graphs for individual items and recipes are later ideas, outside the MVP.

## Drinks, fluids, and caffeine

The capture flow includes caloric and zero-calorie drinks. A person should be able to capture a zero-calorie drink, such as Zero Coke, without having to invent a calorie contribution. Fluid intake is one of the first dashboard dimensions; caffeine tracking can follow. A drink can contribute to more than one total: Zero Coke can contribute fluid and caffeine, while coffee can contribute those plus calories from milk or sweetener.

The amount consumed should be recordable even before its caffeine, fluid, or calorie values are known. When the drink is resolved, its contributions should be based on the particular product or preparation and the amount consumed. Coffee additions may need to be represented as recipe ingredients or as modifications to an item; that choice remains open.

Fluid totals should appear on the daily dashboard and in longer-term trends. A caffeine chart is a feature possibility; an estimated amount remaining using a half-life model is a more exploratory idea. If explored, it should distinguish recorded intake from the model's estimate and account for rough capture times and unknown caffeine amounts.

Later, Dash could place estimated caffeine exposure alongside sleep quality and other lifestyle observations. This should help a person inspect patterns in their own records without presenting a modeled caffeine level as a measured effect or claiming that caffeine caused a particular night's sleep quality.

For now, the consumed volume of every drink counts toward the fluid goal, including coffee and drinks containing milk. Whether to treat some drinks differently or estimate actual water content is a later research question.

## Exercise and sleep

Exercise is part of Dash's intended scope because it can raise the day's eating allowance. A capture can identify the activity and record more than one useful measure. For a run or walk, distance may be the primary measure while duration is also saved. Strength training may eventually record repetitions, weight, sets, and elapsed time. These measures describe different aspects of the same activity; recording one should not prevent recording the others. Estimated exercise energy expenditure can feed the daily calorie balance, with its uncertainty made clear. Training plans, performance coaching, and other fitness goals are later possibilities, not part of the initial weight-loss use case.

For an Android walk or run recorded outside the PWA, provide an offline file-import fallback. The first proposed format is **GPX** for a timestamped GPS route. A person selects the file in the PWA; Dash reads it locally and creates an exercise capture with the route, start and end times, duration, and distance where the file provides enough data. Keep the original file or its source details so the person can review the import. Missing values, including steps and exercise calories, remain unknown rather than becoming zero or inferred facts. The person can correct the activity type or measurements after import. Importing a file must not require a backend, and it is a fallback rather than the preferred way to record a workout. CSV or FIT support can be considered if actual export sources call for them.

Sleep tracking should support sleep and wake times and a personal sleep quality rating. Imported sleep data is a future possibility; no source or import workflow has been selected.

## Recipes, variants, and change over time

People should be able to connect different preparations with a recipe label, such as chicken stew. A new cooking may swap ingredients or change their amounts while still belonging to that recipe group. Each preparation retains its own ingredient list, quantities, and resulting nutritional values. The label is a way to find and relate these preparations, rather than a fixed formula that all of them must follow.

Items can have related variants, such as yoghurts from different brands or stores. Grouping should help people find substitutes without treating distinct products as nutritionally identical. Tags can serve as the initial way to group recipe preparations and related items; the exact grouping interface can be explored in the prototype.

An item's reported nutritional values can change over time. The app should keep the values used for older captures so a later update does not silently change past totals. A large discrepancy in a value reported by another user or an external database should prompt review: it might be a data error or a real product change. The app should make the source and timing of conflicting values visible before accepting an update.

The mobile and desktop presentation of these relationships is open. A prototype could show one recipe made more than once and two related item variants, then test how easy they are to find and distinguish.

## Shared items and measurements

Items and recipes are private by default. This includes an ordinary item such as a personally recorded rice product with its barcode. Public sharing is outside the two-person MVP. If introduced later, publishing must require the owner's explicit consent rather than happen as a side effect of creating an item or recipe.

Common units should be available by default, including mass (g, dag/dkg, oz, lb), volume (ml, L, fluid oz), time (seconds, minutes, hours), and counts (pieces, repetitions). The app should support known conversions within the same dimension. A custom measure defines a conversion for a particular item, such as what one pack or slice of that item means in grams. It belongs to the item and is not independently publishable or a universal unit. A personal "pack for me" conversion should not appear on another person's unrelated item.

A person can choose preferred display units based on locale, override units on an item, and enter a value in a different supported unit from the one displayed. Changing a preference or display unit should not change the meaning of a recorded quantity. Conversions that depend on an item or context must remain attached to that context.

## Mobile and desktop prototypes

Keep one frontend project for now. Explore mobile and desktop as distinct flows within it, sharing the same capture and item concepts and sample data. Mobile should prioritize fast capture and the daily view. Desktop can give more room to reviewing captures, resolving items, and exploring trends. This does not decide whether the shipped product will use one responsive app or separate apps.

The current `frontend/` React and Vite page is a local prototype with example catalogue data. It saves captures in the browser but does not sync them or use the backend. The first product flow to explore is the one in [capture_spec.md](capture_spec.md), including direct search, conditional product-code scanning, offline saving, unsure item and measurement, and later follow-up. The broader features above are possibilities, not a committed build list for the next prototype.

## Implementation boundary

The spec does not select a framework, backend language, database, schema, or API. The frontend is a Vite project and the intended product is a PWA. Any eventual implementation must support offline saving before resolution, syncing when service returns, and preserving approximate timing. Implementation decisions should follow the agreed product flows.

## Open decisions

- How should the PWA expose locally saved, pending, synced, and failed-sync captures?
- Which cached item data should be available offline, and how should it be refreshed?
- How should eligible incremental exercise expenditure be calculated from each source, and should the app allow a cautious fraction of that estimate to increase the eating budget?
- Which basal energy expenditure estimate should be offered with the 1.4 default multiplier?
- How should the lower bound relate to the chosen deficit target, and over what period should under-target intake be highlighted?
- Which goal presets and user controls should be offered first?
- How should the app show days above and below the eating budget across a week without encouraging inappropriate compensation?
- How should published items handle conflicting updates or suspected product changes if sharing is added later?
- Which code-level dashboard customization is useful first: selectable metrics, chart definitions, or page layouts?
