# Dash revised direction

Status: draft for discussion, 9 October 2026. This records product decisions made after reviewing the current frontend prototype. It changes parts of [SPEC.md](SPEC.md) and [capture_spec.md](capture_spec.md); the last sections list where. Once agreed, each part moves into one of those files and this file goes away.

## Two apps

Dash splits into a phone capture app and a desktop dashboard. They share one data model and one backend, but not screens.

The current prototype is one responsive app. Its desktop layout is the phone layout with a sidebar, so desktop gets none of the room the spec reserves for reviewing and exploring. The two uses also have different constraints. Capture must take seconds per entry on a phone. The dashboard can load charting code and take its time.

The phone can do everything except reporting. Capturing, correcting, following up, and editing items, recipes, combos, activities, goals and settings all work there. The dashboard does the same jobs with controls suited to a PC, and adds reporting.

| | Capture app (phone) | Dashboard (PC) |
| --- | --- | --- |
| Main job | Record what happened, now | Review, correct, explore trends |
| Install | Installable to the home screen; online only in the MVP | Browser tab |
| Entry | I ate, I drank, I exercised, I cooked | The same, plus backfilling a forgotten day quickly |
| Days | One day at a time: budget, macros, fluid, and that day's entries, with paging to earlier days | Full day view next to the week |
| Follow-up | One item at a time, often with the package in hand | Working through the inbox in bulk |
| Catalogue | Full editing: items, labels, servings, variants, recipes, combos, activities | The same, as tables with search, sorting, side-by-side comparison and bulk edits |
| Goals and settings | Present | Present |
| Reporting | Not present | Week and month views, trends, charts defined in code |

PC-focused controls means the dashboard is not the phone layout made wider: tables instead of stacked rows, keyboard entry, several panes open at once, and editing many entries or items in one go.

The phone keeps a day view because a person decides whether to eat something while holding the phone. It opens on today and can page back to earlier days, as the prototype does. It cannot page past today. It lists the day's entries so a wrong tap can be fixed right away. It has no week, month or calendar views; those and charts belong on the dashboard.

Follow-up appears in both apps on purpose. Completing an item is easiest when the product is in hand, which means the phone. Clearing a week of unsure entries is easiest at a desk.

[research/two-app-delivery.md](research/two-app-delivery.md) proposes serving both from `dash.danielsharp01.com`, with capture under `/capture/`.

### Offline is not in the MVP

Both apps assume a connection. The two users are online whenever they have their phones, so the capture app writes straight to the backend. It has no local outbox, sync status or cached catalogue.

A failed save must still not lose the capture. The capture app keeps the entry on screen with a clear error and lets the person retry. Entries get their id on the phone, as the prototype already does, so a retry after a timeout cannot create a duplicate. That also keeps offline support possible later without changing the data model.

Domain logic stays in one shared package: types, totals, goal calculation, unit conversion, and the rules that keep known and missing values apart. Most of the prototype's `frontend/src/data/` carries over as that package.

## Three capture verbs

The capture app opens on three actions: **I ate**, **I drank**, **I exercised**. The verb picks the screen and its defaults. It does not create separate entry types or separate catalogues.

A person should never have to decide whether a drink has calories before logging it. I drank asks which drink and how much. Calories, caffeine and fluid follow from the item.

Drinks get their own screen because they are logged many times a day and are mostly repeats. Food varies more. A grid of one-tap cards suits drinks; search, recent items and scanning suit food. That frequency difference is the reason for the split. It is not a nutritional category.

Food and drinks live in one item catalogue. An item measured in ml appears as a card on I drank. Search on either screen finds every item, so a smoothie found from I ate still logs correctly.

A fourth, smaller action, **I cooked**, records a recipe. It creates a catalogue item and no entry; see Recipes.

## Items are nutrition labels

Every item is shown and edited as a nutrition label. The same form serves typed entry, barcode database lookup, and label scanning later. A well-drawn label also gives an item a visual identity without user photos.

A label has a **basis** and **values**:

- The basis is per 100 g, per 100 ml, or per serving. A serving can have a size ("per bar, 45 g") or not ("per cookie").
- The item's unit follows the basis. A per 100 ml label makes an ml item; a per 100 g label makes a g item, even for ice cream. A serving without a size makes a piece item.
- Values follow the EU declaration: energy, fat, of which saturates, carbohydrate, of which sugars, protein, salt. Capture shows kcal, protein, carbohydrate and fat, with the rest expandable. Caffeine is an extra row; EU labels print it only on high-caffeine drinks, so it is usually typed or comes from a recipe.

**Add serving** defines more portions in g or ml, such as a slice, a pack or "my bowl". When a serving has a size, grams or millilitres follow from servings. This replaces the prototype's chained measures.

### Where values come from

Each label records its source: package label, product database (Open Food Facts by barcode is the first candidate), reference table for generic foods such as potatoes or cooked rice (for example USDA FoodData Central or a national table), or typed by hand. An LLM can fill the form; once the person saves it, it counts as typed.

The source is provenance, not uncertainty. Dash does not show it as a confidence level. It lets the dashboard compare a saved label against a newer database value and ask the person to review a large difference, as SPEC.md already requires.

Generic foods such as rice and pasta need raw and cooked as separate items or variants, because their values per 100 g differ about threefold.

### Known and missing

A value is either **known** or **missing**. Anything the person typed or accepted counts as known. There is no separate estimated state and no `≈` marker.

Missing values never count as zero. A day with missing calories shows `≤` on what is left; a macro with missing contributions shows `≥` on its total. Exercise burn is shown as a plain number, with the existing hint that it is only the burn on top of a normal day.

This removes the "done with estimate" state from capture_spec.md. A rough "about 800, forgot lunch" and a scanned label look the same afterwards. The recorded source is what remains to tell them apart if that ever matters, for example for the uncommitted multiplier-fitting idea in SPEC.md.

### Density

The MVP has no density conversion. Because an item's unit follows its label, nutrition always converts directly. The prototype's "Can be weighed" field and the imperial weight units offered on ml items go away.

Density returns later for recipe ingredients measured by volume, such as a tablespoon of oil or a cup of flour. It should not come back for drinks.

### Fluid

Items measured in ml count 100% of their volume as fluid by default, with a toggle to turn it off for things like oil or syrup. Items in g or pieces have no fluid. Most fluid intake is tracked by drinking, so this loses little.

For an unsure entry the verb decides: anything logged through I drank counts its volume as fluid, even before the drink is identified.

## Capture flow

The flow is the same for I ate and I drank. I drank opens on cards instead of a list, and its amounts default to ml.

```
 What?   search + scan, recent items, "+ New" row
   │ pick                    │ new, or scan with no match
   │                         ▼
   │                New      name, barcode, label, "Skip, fill in later"
   ▼                         ▼
 Amount   header: time · name · variant; quick buttons and typed value
   │
   ├─ existing item → Save
   └─ new item      → Add as completed / Add as unsure / Entry only
```

**What.** A search field, a scan button where the device supports it, and recent items. When the person has typed anything, a "+ New" row with that text is always shown, even when there are matches, because a match may be a different product with the same name.

A scan with no match returns to this screen with the barcode attached and "+ New with this barcode" as the top row. A miss often means another brand of something already in the catalogue, so the person can still pick an existing item.

**New.** Name (prefilled from the search), barcode (prefilled from a scan), and the label. The label can be skipped, so "chicken stew, one bowl" stays a five-second capture. New always makes an item; recipes come from I cooked. A dish eaten elsewhere, such as a restaurant stew, is an item or an entry-only capture.

**Amount.** Quick buttons from the item's servings and common amounts, and a typed value. The header shows the time, the item name and its variant on every screen after What. Tapping the time opens the time picker. The time picker can target any day, with "Yesterday" as a one-tap choice for the common morning-after case.

**Save.** A picked existing item saves straight away as an entry. A new item asks how to add it:

| Choice | Requires | Result |
| --- | --- | --- |
| Add as completed | A filled label | Catalogue item and an entry using it |
| Add as unsure | Nothing | Catalogue item marked unsure, an entry using it; goes to the inbox |
| Entry only | Nothing | The label lives on the entry; no catalogue item |

A skipped label can only be added as unsure or entry only. Entry only replaces the prototype's "Just log calories": a calorie-only entry is an entry whose label has only kcal. An entry-only capture can later be turned into an item, as unsure or completed.

**Back and abandon.** Everything entered belongs to the capture, not to one screen. Going back from New to What shows the same search text and keeps the barcode. Nothing is written until the final save, so an abandoned capture leaves no trace. The prototype creates the unsure item as soon as a typed name is picked and cleans up orphans later; the new flow should not.

### Editing an item's label during capture

The phone can edit the label of a picked item. This covers the moment the person notices, package in hand, that Dash says 120 kcal and the label says 140. Editing asks once: "Was it wrong, or did the product change?" Wrong fixes the label for every entry that used it. Changed starts a new label version from today, so past days keep the old values. The full item editor, on either app, can set a different start date.

The same label editor completes unsure items from the inbox. The phone's full item editor adds servings, variants, merging and version history.

## Recipes

A recipe is captured when it is made, not when it is eaten. A person usually eats from a dish only after cooking it, often over several days, so recording the recipe is its own capture: **I cooked**. It creates a catalogue item and no entry.

I cooked follows the cooking:

1. Name the dish. Choosing an earlier recipe of the same name starts from its ingredient list, to adjust for this time.
2. Add ingredients as they go into the pot. Adding one opens the same search as I ate, with "+ New" available. Each Back steps up one level: new ingredient, then the recipe.
3. Finish by weighing the dish or entering a number of portions.

Cooking takes a while, so an unfinished recipe is saved as a draft and the capture app shows it until it is finished. This is the one capture that is written before its final step.

When finished, the recipe appears first in I ate's recent items. Finishing can offer "Log a portion now" for a dish eaten straight away.

Each cooking is its own preparation with its own ingredients and values, grouped under the recipe's name as SPEC.md's recipe groups describe. Logging picks the latest preparation by default.

A recipe cannot contain another recipe in the MVP.

### Weight and cooking

Cooking changes weight: rice absorbs water, stew boils down, and water added as an ingredient has no nutrition. Dash does not predict any of this. It measures the result:

1. Ingredients are entered as they went into the pot, by raw weight and with raw labels. Water counts toward weight and adds no nutrition.
2. The finished dish is weighed. Total nutrition divided by the cooked weight gives values per 100 g as eaten.
3. Portions are logged by cooked weight.

If the dish was not weighed, the recipe is sized in portions instead: "made about 4 portions" gives values per portion.

Saved pot weights ("big pot 1,840 g") let the person weigh the pot with food and subtract the pot in one step.

A recipe's values assume everything stays in the pot. Drained fat or poured-away cooking water are not modelled in the MVP. A person who cares can add a negative ingredient.

So rice is raw inside a recipe, because it is weighed before it goes in, and cooked on a plate, because it is weighed as eaten.

## Combos

A **combo** is a saved set of items with default amounts, put together and consumed at once: coffee with water, milk, coffee and sweetener; "my usual breakfast" of yoghurt, muesli and a banana. A recipe is cooked once and usually eaten in portions over time. A combo is eaten all at once, every time it is made.

The difference decides what can change at log time. A cooked dish is already mixed, so a portion cannot have less carrot; a recipe is an item with a calculated label. A combo is not mixed until it is made, so each of its items can change.

Logging a combo is one tap: "My coffee" on its I drank card logs the default amounts. An adjust option on the amount screen lists the combo's items with their own amount controls, for a day with more milk. A different way of making it every time, such as a large coffee, is better as its own combo.

Combos appear in search and as cards next to items. Nothing stops a one-item combo, which works as a named usual amount.

### Entries have lines

To support combos, an entry holds a list of **lines**. A line is an item, or an unsure name, with an amount. An entry-only line carries its own label.

```text
Entry { when, lines: Line[] }
Line  { item or raw name, amount, label (entry only) }
```

An ordinary capture is an entry with one line. Logging a combo creates one entry named after the combo, with one line per item, copied from the combo so that later edits to the combo leave past entries alone. Logging a recipe portion is one line pointing at the recipe.

Totals add up lines, not entries. Fluid, caffeine and missing values then work per line without special cases. In the coffee example, fluid counts the 200 ml of water and milk; the sweetener is counted in pieces and adds none; caffeine comes from the coffee line; milk gives the calories. Label versions stay on the items, so a past coffee keeps the milk values from its day.

Follow-up also works per line. One unsure line, such as "some syrup", sends the entry to the inbox while its other lines still count as known. The timeline shows a multi-line entry as one row that expands to its lines.

## I drank and I exercised start with defaults

The MVP has no onboarding flow. A person opens the app and logs.

- **Drinks** start with Water, Coffee and Tea cards plus an add button.
- **Activities** start with Walk, Run and Cycle plus search over the full list. The prototype's activity-starring step goes away.
- Cards and activities reorder by use. Pinning and hiding are optional.
- Body details (weight, height, age) are asked for on the goal screen. Until then the budget shows a labelled placeholder, which the prototype already supports.

A guided first run can return later as polish.

## Icons and pickers

Every item and activity has an icon from one consistent set, found or made, instead of system emoji. Platform emoji render differently on each device, which is part of why the prototype reads as emoji-heavy. User-uploaded photos would be more direct but raise privacy, storage and licensing questions, so they stay out of the MVP.

Candidate sets keyed by emoji codepoint, such as OpenMoji (CC BY-SA) or Microsoft Fluent Emoji (MIT), keep the prototype's stored emoji valid as icon ids. Unicode has gaps for this domain, such as yoghurt, protein bars or plant milk. Custom icons fill those gaps in the same style, with their own ids. Choosing the set needs a look at its food, drink and sport coverage side by side.

Icons are not shown as a large grid on the item or activity form. The form shows the current icon as one small control, and tapping it opens a picker: search, recently used, and categories. Dash suggests an icon from the name, so most items never need the picker.

The same pattern applies to the label's source and to time. The form shows the current value in one compact control; a picker opens only when the person wants to change it.

Source appears only where a label is being created or edited: the New screen, the label editor, and the item editor in either app. Logging an existing item never shows it. Source defaults to product database after a barcode hit and to package label otherwise, and stays changeable.

Product photos from Open Food Facts by barcode are a later option. They are public, so privacy is not a concern, but they need attribution. Private user photos come later still, if at all.

## Library

Remove the prototype's one-way "publish to library" action for items and activities. SPEC.md puts sharing outside the two-person MVP, and publishing is where pictures, conflicting nutrition values and consent become real problems.

## Changes to the existing specs

| Existing text | Change |
| --- | --- |
| SPEC.md, "Mobile and desktop prototypes": keep one frontend project | Two apps over a shared domain package |
| SPEC.md and capture_spec.md, "I ate" as the single capture flow | Three verbs: I ate, I drank, I exercised |
| SPEC.md, PWA paragraph, and capture_spec.md, "Offline PWA behavior": offline saving, local cache, sync | Not in the MVP; online saving with retry and phone-generated ids |
| SPEC.md, "Core concepts": a capture records one item or name | An entry holds lines; combos log several lines at once |
| SPEC.md, "Core concepts": item source and data shape undecided | An item is a nutrition label with a basis, values and a recorded source |
| SPEC.md, "Daily dashboard", and capture_spec.md, "Daily totals": estimates distinguished from calculated values | Values are known or missing; no estimated state |
| capture_spec.md, "After saving": done with estimate | Removed; entries are needs follow-up or done |
| capture_spec.md, quick flow step 4: optional calorie and macro estimates | Replaced by an optional label on the New screen, or entry only |
| capture_spec.md, MRU list | Applies to I ate. I drank uses cards ordered by use |
| SPEC.md, "Drinks, fluids, and caffeine": coffee additions open | Coffee is a combo: a saved set of items logged together, each amount adjustable |
| SPEC.md, "Drinks": all drink volume counts as fluid | ml items count 100% by default, with a toggle; g and piece items have no fluid |
| SPEC.md, "Recipes, variants": tags as the initial grouping | Recipes are captured through I cooked, with ingredient lists, sized by cooked weight or portions; each cooking is a preparation in a recipe group; variants stay for related items |
| SPEC.md, "Shared items and measurements": custom measures as conversions | Servings on the label; no density in the MVP |

## Changes to the prototype

- Onboarding and activity starring: removed.
- Library publishing: removed.
- "Just log calories": becomes entry only.
- Estimate fields and the `≈` marker: removed.
- Chained measures: replaced by servings.
- Density and "Can be weighed": removed.
- Unsure items created before save: created only on the final save.
- Fluid flag on items: replaced by the ml default and toggle.
- One item per entry: entries hold lines, and totals add up lines.

## Open decisions

- **Saving a combo from a log.** Should an adjusted combo log, or several items logged together, offer "Save as combo"?

- **New or existing.** When a search or scan misses, how does a person say "this is another version of something I have"? This covers variants, attaching a barcode to an existing item, and prompting raw or cooked when someone logs plain rice by weight.
- **Recipe depth.** Should recipes inside recipes, such as a stock used in a stew, come after the MVP?
- **Shared package boundary.** Types and pure functions only, or also data access?
