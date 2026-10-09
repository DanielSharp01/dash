# Dash capture spec

Status: draft for discussion. This is the first product flow to get working well. It describes behavior, not a database schema or a fixed screen layout. [SPEC.md](SPEC.md) covers the wider product.

## Purpose

A person should be able to record that they ate or drank something immediately, even when the product, amount, or nutrition is uncertain. Capturing must be quicker than creating an item. One initial user has almost no saved data; another may bring data from a previous app later. Both must be able to start capturing without first building a catalogue or importing data.

## Quick "I ate" flow

1. Start an "I ate" entry. **Now** is the default time. The person can choose an exact past time, a past date, or an approximate **time of day**: dawn or early morning, morning, afternoon, evening, or night. Approximate time remains approximate in the saved entry.
2. Identify what was consumed by scanning an ordinary product barcode, searching items and recipes, or typing an unsure name. Scanning should be a prominent option where supported. Search opens with a most-recently-used (MRU) list and remains searchable. A scanned barcode may select a matching item; if no match is available, keep the code and ask for a name for later.
3. Record the amount using a common unit, a measure saved for the selected item, or free text such as "one pack" or "about half a bowl." Offer **1 piece** as an editable starting amount where no better measure is known. The person may leave the amount unsure and must not have to invent a conversion to save.
4. Optionally enter estimated calories and, if known, estimated protein, carbohydrates, and fat. These estimates can be added even when the item or amount is unsure. Skipping macros must be easy.
5. Save. The entry appears on the selected day's timeline immediately, with its unknown or estimated parts visible. Item creation and detailed resolution belong to the later follow-up flow.

The scan action should be offered only when camera access and a suitable scanner are available on the device. Search, typing a name, and manual barcode entry remain available. A lookup failure or unavailable backend never blocks saving. Until a real item or recipe is selected, the UI should say explicitly that the entered name or barcode is **not an actual item** in the catalogue.

## What can remain unsure

These are independent properties of an entry:

| Part | Known example | Unsure example |
| --- | --- | --- |
| What it was | Selected item or recipe | Raw name, optionally with a scanned code, awaiting identification |
| How much | `250 g`, `330 ml`, or an item-specific saved measure | `some`, `one pack` without a known conversion, or no amount yet |
| Calories | Value calculated from a known item and amount, or an explicitly entered estimate | No calorie value yet |
| Macros | Calculated values or explicitly entered estimates | One or more macro values omitted |

An unsure item does not force an unsure measurement, and a known item does not force a known measurement. Preserve the raw code, typed words, original time precision, and entered estimate when more details are added later. Do not turn an absent value into zero.

## After saving

An entry can need follow-up or be considered done. This is separate from whether its item, amount, calories, or macros are known.

- **Needs follow-up:** The person wants to identify the item, clarify the amount, or add an estimate later. It appears in an inbox for unfinished captures.
- **Done with item:** An item or recipe, usable amount, and enough item data are known to calculate its contribution. The person can still correct the entry.
- **Done with estimate:** The person chooses to finish the entry using estimated calories, optionally with macro estimates. This creates no item and does not require a known measurement. It leaves the inbox but remains visibly estimated in the timeline and totals. Missing macros remain missing. The person can edit or identify the item later if they choose.

The follow-up flow offers these ways forward:

1. Create a new item from the capture, then use it for this entry.
2. Choose an existing item or recipe, or create a related item or recipe variant, then clarify the amount as needed.
3. Keep the item unsure, enter or retain a calorie estimate, optionally add macro estimates, and mark the entry done with an estimate.

A code match is a candidate, not proof that the item or amount is correct. The person confirms the choice. The follow-up flow must be able to start from any saved entry, including one previously marked done with an estimate.

## Daily totals and graphs

- Calories from known item-and-amount entries and calories entered as estimates can both inform the daily budget, but estimated contributions and missing contributions must be distinguishable. A day with unknown calories has an incomplete total.
- Macro totals include only known or explicitly estimated macro values. If a done-with-estimate entry has calories but no macros, the day and its macro distribution remain visibly incomplete. Unknown protein, carbohydrate, or fat must not appear as zero grams.
- A completed inbox does not imply complete nutrition data. Timeline and dashboards should report data completeness separately from follow-up status.
- Correcting an estimate or later linking an item updates the calculated day while retaining the original capture details.

## Offline PWA behavior

The capture flow must work in the installed PWA when the backend is unavailable. Aim to cache the available item and recipe catalogue for offline search, then measure its size and adjust the strategy if browser storage limits make a full cache impractical. An empty or incomplete cache must still allow an unsure name and optional barcode. A new entry is saved locally first and shown in the timeline. The person can see whether it is saved locally, awaiting sync, synced, or needs sync attention. Returning online should not create duplicate entries. Being offline is separate from being unsure: an item can be known but unsynced, or unsure but synced.

## Examples to verify the flow

| Situation | Expected result |
| --- | --- |
| New user eats now, types "chicken stew," and writes "one bowl" | Entry saves at the current time with unsure item and amount; no catalogue setup is required. |
| Barcode scans offline with no cached match | Person adds an unsure name; code, name, editable `1 piece` amount, and time save locally. |
| User selects a recent recipe and enters `250 g` | Entry saves with the selected recipe and usable amount, subject to that recipe's available nutrition data. |
| User selects an item but types "one pack" with no saved pack conversion | Item is known, amount remains unsure; entry still saves. |
| User cannot identify an item, enters `400 kcal`, skips macros, and marks it done | Entry leaves the inbox; calories count as estimated and the macro view shows incomplete data. |
| User enters an estimate, then creates an item variant later | The entry can use the new variant and amount without losing the original text, code, time, or estimate history. |

## Open design decisions

- Which ordinary barcode formats should the scanner recognize first?
- How large is the catalogue in practice, and can the full useful set fit in browser storage?
- How should the MRU list rank items and recipes?
- How should the UI show a selected item with an unsure amount without implying that its nutrition is known?
- What wording best separates "done with estimate" from "fully known" without making the quick flow feel like unfinished work?
