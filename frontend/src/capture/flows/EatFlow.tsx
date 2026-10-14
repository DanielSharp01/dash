import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Amount,
  asItem,
  asRecipe,
  autoFoodIcon,
  batchPerUnit,
  BEGINNING,
  type ComboInput,
  comboAsLines,
  type Contents,
  contents,
  currentBatch,
  defaultAmount,
  displayName,
  estimated,
  type Food,
  type FoodData,
  type FoodEntry,
  type FoodEntryInput,
  type FoodInput,
  type FoodItem,
  type FoodItemInput,
  type FoodLookup,
  type FoodUsage,
  formatAmount,
  labelAt,
  lineContents,
  type Line,
  loggable,
  type Nutrients,
  type OpenFoodFactsResult,
  type Portion,
  quantity,
  type Recipe,
  type Serving,
  unitDimension,
  type UnitSystem,
  unitsFor,
  type When,
  withBase,
} from "@dash/core";
import { deleteEntry, saveEntry } from "../../queries/entries.queries";
import { saveBatch, saveFood, useFoodLookup, useFoodUsage } from "../../queries/foods.queries";
import { lookupBarcode } from "../../queries/lookups.queries";
import { useProfile } from "../../queries/me.queries";
import { PortionList } from "../editors/PortionList";
import { ItemEditor } from "../editors/ItemEditor";
import { batchLabel, finishedBatches, foodInput, frequentDrinkIds, isDrink, leftovers, recentFoodIds, sharedEdit, useListedFoods, usualAmount, variantsOf } from "../foods";
import { initialWhen, nowWhen } from "../time";
import { AmountInput } from "../ui/AmountInput";
import { Breakdown, ingredientRows } from "../ui/Breakdown";
import { FlowShell } from "../ui/FlowShell";
import { Sheet } from "../ui/Sheet";
import { BarcodeIcon, FoodSearch } from "../ui/FoodSearch";
import { canScan } from "../ui/Scanner";
import { draftFrom, hasValues, type LabelDraft, LabelForm, labelFrom, unitOf } from "../ui/LabelForm";
import { NumberInput } from "../ui/NumberInput";
import { Scanner } from "../ui/Scanner";
import { useSteps } from "../ui/useSteps";
import { WhenPicker } from "../ui/WhenPicker";

type Step = "cards" | "what" | "scan" | "attach" | "new" | "amount" | "item" | "when" | "calories";

export type EatMode = { kind: "new"; foodId?: string } | { kind: "edit"; entry: FoodEntry } | { kind: "duplicate"; entry: FoodEntry };

/** A food being created during capture; nothing is written until the final save. */
interface NewFood {
  /** A combo lists what's in it instead of a label, e.g. a sandwich. */
  kind: "item" | "combo";
  parts: Portion[];
  name: string;
  variant: string;
  brand: string;
  /** Undefined while it follows the name. */
  icon?: string;
  barcode?: string;
  draft: LabelDraft;
  servings: Serving[];
  /** The entry-only item being edited, which is saved in place instead of created. */
  existing?: FoodItem;
}

const newId = () => crypto.randomUUID();

/** What a new food knows so far, in the shape nutrition reads. */
function newFoodData(n: NewFood, amount: Amount): FoodData {
  const label = labelFrom(n.draft);
  const servings = [...n.servings];
  // A word typed as the unit ("bowl") becomes a serving waiting for its size.
  if (amount.unit && !unitDimension(amount.unit) && !servings.some((s) => s.name === amount.unit) && amount.unit !== n.draft.servingName.trim())
    servings.push({ name: amount.unit });
  const unit = label ? unitOf(n.draft) : (unitDimension(amount.unit) ?? "piece");
  return { unit, labels: label ? [label] : [], servings };
}

/** Without a label yet, the unit the label form starts on comes first, so a typed number lands in g or ml rather than pieces. */
function newItemUnits(n: NewFood, amount: Amount, system: UnitSystem) {
  if (labelFrom(n.draft)) return unitsFor(newFoodData(n, amount), system);
  const unit = unitOf(n.draft);
  const all = unitsFor(undefined, system);
  return [...all.filter((u) => unitDimension(u) === unit), ...all.filter((u) => unitDimension(u) !== unit)];
}

function lineFor(f: FoodItem | Recipe, amount: Amount): Line {
  if (f.kind === "item") return { id: newId(), foodId: f.id, amount };
  const batchId = currentBatch(f)?.id;
  return { id: newId(), foodId: f.id, ...(batchId ? { batchId } : {}), amount };
}

function recipeUnits(r: Recipe, batchId: string | undefined, system: "metric" | "imperial", foods: FoodLookup) {
  const batch = r.batches.find((b) => b.id === batchId) ?? currentBatch(r);
  const sized = batch && batchPerUnit(batch, foods);
  if (!sized) return ["g"];
  return sized.unit === "portion" ? ["portion"] : system === "imperial" ? ["oz", "g"] : ["g"];
}

function usualFor(f: FoodItem | Recipe, usage: Map<string, FoodUsage>, system: "metric" | "imperial", foods: FoodLookup): Amount {
  const usual = usualAmount(usage, f.id);
  if (usual) return usual;
  if (f.kind === "item") return defaultAmount(f, system);
  return recipeUnits(f, undefined, system, foods)[0] === "portion" ? { value: 1, unit: "portion" } : { value: 300, unit: "g" };
}

/** An entry-only line is edited the same way it was made: as a new food that isn't saved yet. */
function newFoodOf(source: FoodEntry | undefined, foods: FoodLookup): NewFood | undefined {
  const only = source?.lines.length === 1 ? source.lines[0] : undefined;
  if (!only) return undefined;
  const existing = asItem(foods(only.foodId));
  if (only.foodId && (!existing || existing.catalogued)) return undefined;
  return {
    kind: "item",
    parts: [],
    name: existing?.name ?? only.rawName ?? "",
    variant: existing?.variant ?? "",
    brand: existing?.brand ?? "",
    icon: existing && !existing.iconAuto ? existing.icon : undefined,
    barcode: only.barcode ?? existing?.barcode,
    draft: draftFrom(existing?.unit, existing && labelAt(existing), estimated),
    servings: existing?.servings ?? [],
    existing,
  };
}

export function EatFlow({ via, date, mode = { kind: "new" }, onDone }: { via: FoodEntry["via"]; date: string; mode?: EatMode; onDone: (saved?: FoodEntry, undo?: () => void) => void }) {
  const foods = useFoodLookup();
  const usage = useFoodUsage();
  const listed = useListedFoods();
  const source = mode.kind === "new" ? undefined : mode.entry;
  const starting = mode.kind === "new" && mode.foodId ? foods(mode.foodId) : undefined;
  const exit = useCallback(() => onDone(), [onDone]);
  const first: Step = source || starting ? "amount" : "cards";
  const { step, depth, go, back, replace, close } = useSteps<Step>(first, exit);
  const { units } = useProfile();
  const usual = (f: FoodItem | Recipe) => usualFor(f, usage, units, foods);

  const [entryId] = useState(() => (mode.kind === "edit" ? mode.entry.id : newId()));
  const [when, setWhen] = useState<When>(() => (mode.kind === "edit" ? mode.entry.when : mode.kind === "duplicate" ? nowWhen() : initialWhen(date)));
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState<string>();
  const [found, setFound] = useState<OpenFoodFactsResult>();
  const [scanFrom, setScanFrom] = useState<"cards" | "what">();
  const [attachTo, setAttachTo] = useState<FoodItem>();
  const [comboId, setComboId] = useState(source?.comboId);
  const [lines, setLines] = useState<Line[]>(() => {
    if (source) return source.lines.map((l) => (mode.kind === "duplicate" ? { ...l, id: newId() } : l));
    if (starting && starting.kind !== "combo") return [lineFor(starting, usual(starting))];
    return [];
  });
  const [newFood, setNewFood] = useState<NewFood | undefined>(() => newFoodOf(source, foods));
  const [calories, setCalories] = useState<Nutrients>({});
  const [note, setNote] = useState("");
  const [openLine, setOpenLine] = useState<string>();
  const [lastOfIt, setLastOfIt] = useState(false);

  // A reload keeps the step in history but not what was picked, so start the pick over.
  useEffect(() => {
    const lost =
      (step === "amount" && lines.length === 0 && !newFood) ||
      (step === "item" && !lines[0]?.foodId) ||
      (step === "attach" && !attachTo) ||
      (step === "new" && !newFood);
    if (lost) replace(first === "amount" ? "what" : first);
  }, []);

  /** An edit keeps what a line came to on the day unless its amount was changed. */
  const untouched = (l: Line) => {
    const before = mode.kind === "edit" ? mode.entry.lines.find((x) => x.id === l.id) : undefined;
    return !!before && before.base !== undefined && before.foodId === l.foodId && JSON.stringify(before.amount) === JSON.stringify(l.amount);
  };

  /** Saves the entry, along with the foods it creates; an explicit comboId, even undefined, replaces the current one. */
  const commit = (lineList: Line[], extra: { comboId?: string } = {}, created: FoodInput[] = []) => {
    const withCreated = (id: string | undefined) => created.find((c) => c.id === id) ?? foods(id);
    const combo = "comboId" in extra ? extra.comboId : comboId;
    const input: FoodEntryInput = {
      id: entryId,
      kind: "food",
      when,
      via: source?.via ?? via,
      ...(combo ? { comboId: combo } : {}),
      lines: lineList.map((l) => {
        const food = withCreated(l.foodId);
        return food?.kind === "recipe" || untouched(l) ? l : withBase(l, food?.kind === "item" ? food : undefined);
      }),
    };
    void saveEntry(input, { newFoods: created, stored: mode.kind === "edit" ? mode.entry : undefined });
    const eaten = lineList.length === 1 ? lineList[0] : undefined;
    const recipe = asRecipe(foods(eaten?.foodId));
    const batch = recipe?.batches.find((b) => b.id === eaten?.batchId);
    if (lastOfIt && recipe && batch) void saveBatch(recipe.id, { ...batch, gone: true });
    const shown = { ...input, revision: 0, deleted: false, createdAt: new Date().toISOString() } as FoodEntry;
    onDone(shown, mode.kind === "edit" ? undefined : () => void deleteEntry(shown));
    close();
  };

  const pickFood = (f: Food) => {
    setNewFood(undefined);
    if (f.kind === "combo") {
      setComboId(f.id);
      setLines(comboAsLines(f, 1, foods, newId));
      go("amount");
      return;
    }
    // The scan matched nothing, so this is the first time the barcode meets the item.
    if (f.kind === "item" && barcode && f.barcode !== barcode) {
      setAttachTo(f);
      go("attach");
      return;
    }
    const kept = lines.length === 1 ? lines[0]!.amount : undefined;
    const fits = kept && (f.kind === "item" ? quantity(f, kept) !== undefined : recipeUnits(f, undefined, units, foods).includes(kept.unit ?? ""));
    setComboId(undefined);
    const line = { ...lineFor(f, fits ? kept : usual(f)), id: lines[0]?.id ?? newId() };
    setLines([f.kind === "item" && f.barcode === barcode && barcode ? { ...line, barcode } : line]);
    go("amount");
  };

  /**
   * A new item starts empty, so the scanned product fills it whatever name was typed. Another
   * variation copies the item it's a variation of, except a label the scanned product has,
   * which is closer to what's in hand.
   */
  const startNew = (name: string, base?: FoodItem) => {
    const scannedLabel = found?.label && { unit: found.unit, label: found.label };
    const copied = base && { unit: base.unit, label: labelAt(base) };
    const label = base ? (scannedLabel ?? copied) : scannedLabel;
    setNewFood({
      kind: "item",
      parts: [],
      name: base?.name ?? (name || found?.name || ""),
      variant: base?.variant ?? "",
      brand: base ? (base.brand ?? "") : (found?.brand ?? ""),
      icon: base && !base.iconAuto ? base.icon : undefined,
      barcode,
      draft: label ? draftFrom(label.unit, label.label) : draftFrom(base?.unit ?? found?.unit ?? (via === "drank" ? "ml" : undefined), undefined),
      servings: base ? base.servings : (found?.servings ?? []),
    });
    setComboId(undefined);
    setLines([{ id: newId(), ...(name ? { rawName: name } : {}), ...(barcode ? { barcode } : {}), amount: {} }]);
    go("new");
  };

  /** The person's matching items come first; with none, Open Food Facts may know the product. */
  const onCode = async (code: string) => {
    setBarcode(code);
    const result = await lookupBarcode(code).catch(() => undefined);
    setFound(result?.openFoodFacts);
    const match = result?.foods.find((f): f is FoodItem => f.kind === "item" && loggable(f));
    if (match) {
      setLines([{ ...lineFor(match, usual(match)), barcode: code }]);
      setComboId(undefined);
      setNewFood(undefined);
      replace("amount");
      return;
    }
    // The cards have nowhere to offer a new item, so a scan from there lands on the search.
    setQuery("");
    if (scanFrom === "cards") replace("what");
    else back();
  };

  const scan = (from: "cards" | "what") => {
    setScanFrom(from);
    go("scan");
  };

  /** Saves the new food as asked, then the entry with one line pointing at it, or a bare name with no label. */
  const saveNew = (as: "completed" | "unsure" | "entry") => {
    if (!newFood) return;
    const line = lines[0]!;
    const data = newFoodData(newFood, line.amount);
    const name = newFood.name.trim() || "Something";
    const scanned = newFood.barcode ? { barcode: newFood.barcode } : {};
    if (as === "entry" && !data.labels.length && !newFood.existing) {
      commit([{ id: line.id, rawName: name, ...scanned, amount: line.amount }], { comboId: undefined });
      return;
    }
    const item: FoodItemInput = {
      id: newFood.existing?.id ?? newId(),
      kind: "item",
      name,
      ...(newFood.variant.trim() ? { variant: newFood.variant.trim() } : {}),
      ...(newFood.brand.trim() ? { brand: newFood.brand.trim() } : {}),
      icon: newFood.icon ?? autoFoodIcon(name, "item", data.unit),
      iconAuto: newFood.icon === undefined,
      catalogued: as !== "entry",
      ...scanned,
      unit: data.unit,
      notFluid: false,
      unsure: as === "unsure",
      labels: data.labels,
      servings: data.servings,
    };
    if (newFood.existing) void saveFood(item);
    commit([{ id: line.id, foodId: item.id, rawName: name, ...scanned, amount: line.amount }], { comboId: undefined }, newFood.existing ? [] : [item]);
  };

  const newCombo = (catalogued: boolean): ComboInput | undefined => {
    if (newFood?.kind !== "combo") return undefined;
    const name = newFood.name.trim() || "Something";
    return { id: newId(), kind: "combo", name, icon: newFood.icon ?? autoFoodIcon(name, "combo"), iconAuto: newFood.icon === undefined, catalogued, parts: newFood.parts };
  };

  /** Coming back from a combo's parts, the single line for the new item starts over. */
  const toItemAmount = () => {
    if (lines.length !== 1 || lines[0]!.foodId) setLines([{ id: newId(), ...(newFood?.name ? { rawName: newFood.name } : {}), ...(barcode ? { barcode } : {}), amount: {} }]);
    go("amount");
  };

  const toComboAmount = () => {
    if (newFood?.kind !== "combo") return;
    setLines(comboAsLines(newFood, 1, foods, newId));
    go("amount");
  };

  /** Logs the parts as a combo; kept, it shows up next time as one tap, otherwise only on this entry. */
  const saveNewCombo = (keep: boolean) => {
    const combo = newCombo(keep);
    if (combo) commit(lines, { comboId: combo.id }, [combo]);
  };

  const header = { canGoBack: depth > 1, onBack: back, onClose: close, when, onWhen: () => go("when") };

  if (step === "scan") return <Scanner onCode={(code) => void onCode(code)} onClose={back} />;

  if (step === "when")
    return (
      <FlowShell title="When?" canGoBack onBack={back} onClose={close}>
        <WhenPicker value={when} onChange={setWhen} onDone={back} />
      </FlowShell>
    );

  if (step === "item") {
    const item = asItem(foods(lines[0]?.foodId));
    if (!item) return null;
    return (
      <FlowShell title={item.unsure ? "Complete item" : "Edit item"} canGoBack onBack={back} onClose={close}>
        <ItemEditor
          item={item}
          onSaved={back}
          onMerged={(target) => {
            const line = lines[0]!;
            if (target.kind === "combo") {
              setComboId(target.id);
              setLines(comboAsLines(target, line.amount.value ?? 1, foods, newId));
            } else setLines([target.kind === "item" ? { ...line, foodId: target.id } : { ...lineFor(target, line.amount), id: line.id }]);
            back();
          }}
          onCombo={(combo) => {
            setComboId(combo.id);
            setLines(comboAsLines(combo, lines[0]!.amount.value ?? 1, foods, newId));
            back();
          }}
        />
      </FlowShell>
    );
  }

  // A barcode is only ever added, never swapped: one already there belongs to another flavour or pack.
  const canTakeBarcode = !!attachTo && !attachTo.barcode;
  const logAttached = (keep: boolean) => {
    if (!attachTo) return;
    if (keep && barcode) void saveFood(sharedEdit({ ...(foodInput(attachTo) as FoodItemInput), barcode }, attachTo));
    setBarcode(undefined);
    setLines([{ ...lineFor(attachTo, usual(attachTo)), ...(keep && barcode ? { barcode } : {}) }]);
    replace("amount");
  };

  if (step === "attach" && attachTo)
    return (
      <FlowShell title={attachTo.name} subtitle={`Barcode ${barcode}`} canGoBack onBack={back} onClose={close}>
        <p className="hint">This barcode isn't on {displayName(attachTo)} yet.</p>
        {canTakeBarcode && (
          <button className="row" onClick={() => logAttached(true)}>
            <span className="row-icon">{attachTo.icon}</span>
            <span className="row-main">
              <span className="row-title">It's this one</span>
              <span className="row-sub">Add the barcode to {displayName(attachTo)}, so the next scan finds it</span>
            </span>
          </button>
        )}
        <button className="row" onClick={() => startNew(attachTo.name, attachTo)}>
          <span className="row-icon">＋</span>
          <span className="row-main">
            <span className="row-title">Another flavour or pack of it</span>
            <span className="row-sub">A copy of {displayName(attachTo)} with this barcode; check the label against the pack</span>
          </span>
        </button>
        {!canTakeBarcode && (
          <button className="row" onClick={() => logAttached(false)}>
            <span className="row-icon">{attachTo.icon}</span>
            <span className="row-main">
              <span className="row-title">Just log {displayName(attachTo)}</span>
              <span className="row-sub">The barcode isn't kept</span>
            </span>
          </button>
        )}
      </FlowShell>
    );

  if (step === "calories")
    return (
      <FlowShell
        title="Just calories"
        {...header}
        footer={
          <button
            className="btn btn-primary btn-block"
            disabled={calories.kcal === undefined}
            onClick={() => {
              const item: FoodItemInput = {
                id: newId(),
                kind: "item",
                name: note.trim() || "Calories",
                icon: "🔥",
                iconAuto: false,
                catalogued: false,
                unit: "piece",
                notFluid: false,
                unsure: false,
                labels: [{ from: BEGINNING, per: "serving", values: calories, verified: false, origin: "estimate" }],
                servings: [],
              };
              commit([{ id: newId(), foodId: item.id, ...(note.trim() ? { rawName: note.trim() } : {}), amount: { value: 1, unit: "piece" } }], { comboId: undefined }, [item]);
            }}
          >
            Save
          </button>
        }
      >
        <p className="hint">For when the details don't matter, like a meal you forgot to log.</p>
        <label className="kcal-field">
          <NumberInput integer autoFocus placeholder="?" value={calories.kcal} onChange={(kcal) => setCalories({ ...calories, kcal })} />
          <span>kcal</span>
        </label>
        <MacroFields values={calories} onChange={setCalories} />
        <label className="field">
          <span className="field-label">Note (optional)</span>
          <input className="text-input" placeholder="e.g. forgot to log lunch" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </FlowShell>
    );

  if (step === "new" && newFood) {
    const twins = newFood.name.trim() ? variantsOf(listed, { id: newFood.existing?.id ?? "", name: newFood.name }) : [];
    return (
      <FlowShell
        title={source ? "Label" : "New"}
        subtitle={newFood.barcode && `Barcode ${newFood.barcode}`}
        {...header}
        footer={
          newFood.kind === "combo" ? (
            <button className="btn btn-primary btn-block" disabled={newFood.parts.length === 0} onClick={toComboAmount}>
              Next
            </button>
          ) : (
            <button className={`btn btn-block ${hasValues(newFood.draft) ? "btn-primary" : ""}`} onClick={toItemAmount}>
              {hasValues(newFood.draft) ? "Next" : "Skip, fill in later"}
            </button>
          )
        }
      >
        <div className="segmented small" role="radiogroup" aria-label="Kind">
          <button role="radio" aria-selected={newFood.kind === "item"} onClick={() => setNewFood({ ...newFood, kind: "item" })}>
            Item, with a label
          </button>
          <button role="radio" aria-selected={newFood.kind === "combo"} onClick={() => setNewFood({ ...newFood, kind: "combo" })}>
            Combo of things
          </button>
        </div>
        <NewFoodHead value={newFood} onChange={setNewFood} twins={newFood.kind === "item" ? twins : []} />
        {newFood.kind === "combo" ? (
          <div className="field">
            <span className="field-label">What's in it</span>
            <PortionList portions={newFood.parts} kinds={["item", "recipe"]} addLabel="Add an item" onChange={(parts) => setNewFood({ ...newFood, parts })} />
          </div>
        ) : (
          <LabelForm draft={newFood.draft} onChange={(draft) => setNewFood({ ...newFood, draft })} />
        )}
      </FlowShell>
    );
  }

  if (step === "amount" && (lines.length > 0 || newFood)) {
    const line = lines[0]!;
    const buildingCombo = newFood?.kind === "combo";
    const newItem = buildingCombo ? undefined : newFood;
    const single = lines.length === 1 && !comboId && !buildingCombo;
    const item = asItem(foods(line?.foodId));
    const recipe = asRecipe(foods(line?.foodId));
    const combo = foods(comboId);
    const preview = newItem ? previewNew(newItem, line.amount, when.date) : lines.reduce<Contents>((sum, l) => mergeContents(sum, lineContents(l, when.date, foods)), {});
    const changeable = mode.kind !== "edit" || single;

    return (
      <FlowShell
        title={combo?.name ?? (newFood ? newFood.name || "Unnamed" : recipe ? recipe.name : item ? item.name : (line?.rawName ?? "How much?"))}
        subtitle={
          buildingCombo ? (
            <span className="badge badge-warn">New combo</span>
          ) : newFood ? (
            <span className="badge badge-warn">Not an item yet</span>
          ) : item?.unsure ? (
            <span className="badge badge-warn">Unsure item</span>
          ) : recipe ? (
            `${batchLabel(recipe.batches.find((b) => b.id === line.batchId) ?? currentBatch(recipe)!)} batch`
          ) : (
            item && [item.variant, item.brand].filter(Boolean).join(" · ")
          )
        }
        {...header}
        footer={
          buildingCombo ? (
            <div className="save-choices">
              <button className="btn btn-primary btn-block" onClick={() => saveNewCombo(true)}>
                Save combo and log
              </button>
              <button className="btn btn-block" onClick={() => saveNewCombo(false)}>
                Just log it
              </button>
            </div>
          ) : newItem ? (
            <NewFoodChoices canComplete={!!labelFrom(newItem.draft)?.values.kcal || labelFrom(newItem.draft)?.values.kcal === 0} onSave={saveNew} />
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => commit(lines)}>
              Save
            </button>
          )
        }
      >
        {single || newItem ? (
          <>
            <div className="selected-links">
              {changeable && (
                <button className="link-btn" onClick={() => go("what")}>
                  Change
                </button>
              )}
              {newItem && (
                <button className="link-btn" onClick={() => go("new")}>
                  {hasValues(newItem.draft) ? "Edit label" : "Add label"}
                </button>
              )}
              {item && (
                <button className="link-btn" onClick={() => go("item")}>
                  {item.unsure ? "Complete item" : "Edit item"}
                </button>
              )}
            </div>
            {recipe && <BatchChoice recipe={recipe} batchId={line.batchId} onChange={(batchId) => setLines([{ ...line, batchId }])} />}
            {item && changeable && (
              <VariationChoice
                item={item}
                onChange={(v) => setLines([{ ...lineFor(v, quantity(v, line.amount) !== undefined ? line.amount : usual(v)), id: line.id }])}
              />
            )}
            {recipe && line.batchId && (
              <label className="check-line">
                <input type="checkbox" checked={lastOfIt} onChange={(e) => setLastOfIt(e.target.checked)} />
                That was the last of it
              </label>
            )}
            <AmountInput
              amount={line.amount}
              units={newItem ? newItemUnits(newItem, line.amount, units) : recipe ? recipeUnits(recipe, line.batchId, units, foods) : unitsFor(item, units)}
              allowOther={!!newItem || !!item?.unsure}
              onChange={(amount) => setLines([{ ...line, amount }])}
            />
          </>
        ) : (
          <ComboLines lines={lines} openId={openLine} onOpen={setOpenLine} onChange={setLines} />
        )}
        <NutritionPreview contents={preview} />
        {single && recipe && <RecipeIngredients recipe={recipe} line={line} foods={foods} />}
      </FlowShell>
    );
  }

  if (step === "cards")
    return (
      <FlowShell title={via === "drank" ? "I drank" : "I ate"} {...header}>
        <FoodCards
          via={via}
          onPick={pickFood}
          onSearch={(q) => {
            setQuery(q);
            go("what");
          }}
          onScan={() => scan("cards")}
        />
      </FlowShell>
    );

  return (
    <FlowShell title={source ? "What was it?" : via === "drank" ? "What did you drink?" : "I ate"} {...header}>
      <FoodSearch
        query={query}
        onQuery={setQuery}
        kinds={["item", "combo", "recipe"]}
        recentIds={recentFoodIds(usage, via)}
        placeholder="Search items, combos, recipes"
        onPick={pickFood}
        onNew={(name) => startNew(name)}
        onScan={() => scan("what")}
        barcode={barcode}
        foundName={found?.name}
        onClearBarcode={() => {
          setBarcode(undefined);
          setFound(undefined);
        }}
        extra={
          !query.trim() &&
          !barcode &&
          !source && (
            <li>
              <button className="row row-unsure" onClick={() => go("calories")}>
                <span className="row-icon">🔥</span>
                <span className="row-main">
                  <span className="row-title">Just calories</span>
                  <span className="row-sub">No item, e.g. “forgot to log, about 800”</span>
                </span>
              </button>
            </li>
          )
        }
      />
    </FlowShell>
  );
}

function NewFoodHead({ value, onChange, twins }: { value: NewFood; onChange: (n: NewFood) => void; twins: FoodItem[] }) {
  return (
    <>
      <div className="name-row">
        <span className="row-icon big">{value.icon ?? autoFoodIcon(value.name, value.kind)}</span>
        <input className="big-text" placeholder="What was it?" autoFocus={!value.name} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </div>
      <label className="field compact">
        <span className="field-label">Variant (optional)</span>
        <input className="text-input" placeholder="Flavour, size, raw or cooked" value={value.variant} onChange={(e) => onChange({ ...value, variant: e.target.value })} />
      </label>
      <label className="field compact">
        <span className="field-label">Brand (optional)</span>
        <input className="text-input" placeholder="Who makes or sells it" value={value.brand} onChange={(e) => onChange({ ...value, brand: e.target.value })} />
      </label>
      {twins.length > 0 && !value.variant.trim() && !value.brand.trim() && (
        <p className="hint">You already have {twins.map(displayName).join(", ")}. Give this one a variant or brand to tell them apart.</p>
      )}
    </>
  );
}

function NewFoodChoices({ canComplete, onSave }: { canComplete: boolean; onSave: (as: "completed" | "unsure" | "entry") => void }) {
  return (
    <div className="save-choices">
      <button className="btn btn-primary btn-block" disabled={!canComplete} onClick={() => onSave("completed")}>
        Add as item
      </button>
      <div className="footer-row">
        <button className="btn" onClick={() => onSave("unsure")}>
          Add as unsure
        </button>
        <button className="btn" onClick={() => onSave("entry")}>
          Entry only
        </button>
      </div>
      {!canComplete && <p className="hint">A complete item needs at least its calories. Unsure ones wait in the inbox.</p>}
    </div>
  );
}

function BatchChoice({ recipe, batchId, onChange }: { recipe: Recipe; batchId?: string; onChange: (id: string) => void }) {
  const batches = finishedBatches(recipe).reverse();
  if (batches.length < 2) return null;
  return (
    <div className="chip-row" role="radiogroup" aria-label="Batch">
      {batches.slice(0, 4).map((b) => (
        <button key={b.id} role="radio" aria-checked={b.id === batchId} className="chip" onClick={() => onChange(b.id)}>
          {batchLabel(b)}
        </button>
      ))}
    </div>
  );
}

/** Other flavours or packs of the item, by its name; the amount carries over where it fits. */
/**
 * Other flavours or packs of the item, by its name; the amount carries over where it fits. One
 * dropdown however many there are.
 */
function VariationChoice({ item, onChange }: { item: FoodItem; onChange: (v: FoodItem) => void }) {
  const listed = useListedFoods();
  const [open, setOpen] = useState(false);
  const others = variantsOf(listed, item);
  if (!others.length) return null;
  const all = [item, ...others];
  const label = (v: FoodItem) => [v.variant, v.brand].filter(Boolean).join(" · ") || "Plain";
  const variations = all.sort((a, b) => (a.brand ?? "").localeCompare(b.brand ?? "") || (a.variant ?? "").localeCompare(b.variant ?? ""));
  const pick = (v: FoodItem) => {
    setOpen(false);
    if (v.id !== item.id) onChange(v);
  };

  return (
    <>
      <button className="value-chip variation-choice" onClick={() => setOpen(true)}>
        <small>Variation</small> {label(item)} ▾
      </button>
      {open && (
        <Sheet title={item.name} onClose={() => setOpen(false)}>
          {variations.map((v) => (
            <button key={v.id} className={`row ${v.id === item.id ? "row-selected" : ""}`} onClick={() => pick(v)}>
              <span className="row-main">
                <span className="row-title">{label(v)}</span>
              </span>
              {v.id === item.id && <span className="row-check">✓</span>}
            </button>
          ))}
        </Sheet>
      )}
    </>
  );
}

/** A combo logs at its usual amounts; each part opens for a day with more milk. */
function ComboLines({ lines, openId, onOpen, onChange }: { lines: Line[]; openId?: string; onOpen: (id?: string) => void; onChange: (l: Line[]) => void }) {
  const { units } = useProfile();
  const foods = useFoodLookup();
  return (
    <ul className="list combo-lines">
      {lines.map((l) => {
        const food = foods(l.foodId);
        const open = openId === l.id;
        return (
          <li key={l.id} className={`combo-line ${open ? "open" : ""}`}>
            <button className="row" onClick={() => onOpen(open ? undefined : l.id)} aria-expanded={open}>
              <span className="row-icon">{food?.icon ?? "✎"}</span>
              <span className="row-main">
                <span className="row-title">
                  {food ? displayName(food) : (l.rawName ?? "Something")} {food?.kind === "item" && food.unsure && <span className="badge badge-warn">Unsure</span>}
                </span>
                <span className="row-sub">{formatAmount(l.amount)}</span>
              </span>
              <span className="row-chevron">{open ? "⌃" : "⌄"}</span>
            </button>
            {open && (
              <div className="combo-line-edit">
                <AmountInput
                  amount={l.amount}
                  units={
                    food?.kind === "recipe"
                      ? recipeUnits(food, l.batchId, units, foods)
                      : food?.kind === "item" && food.unsure
                        ? [...new Set([...unitsFor(food, units), ...unitsFor(undefined, units)])]
                        : unitsFor(asItem(food), units)
                  }
                  allowOther={food?.kind === "item" && food.unsure}
                  onChange={(amount) => onChange(lines.map((x) => (x.id === l.id ? { ...x, amount } : x)))}
                />
                <button className="link-btn danger" onClick={() => onChange(lines.filter((x) => x.id !== l.id))}>
                  Leave this out
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function mergeContents(sum: Contents, part: Contents | undefined): Contents {
  const out: Contents = { ...sum };
  for (const k of ["kcal", "protein", "carbs", "fat"] as const) {
    const p = part?.[k];
    const s = out[k];
    out[k] = p ? { value: (s?.value ?? 0) + p.value, complete: (s?.complete ?? true) && p.complete } : { value: s?.value ?? 0, complete: false };
  }
  return out;
}

function previewNew(n: NewFood, amount: Amount, date: string): Contents {
  const c = contents(newFoodData(n, amount), amount, date);
  return mergeContents({}, c && Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { value: v, complete: true }])));
}

/** One decimal only where it matters, as labels print it; a whole pot's "168.3 g" doesn't fit a chip. */
const grams = (n: number) => (n < 10 ? Math.round(n * 10) / 10 : Math.round(n));

function RecipeIngredients({ recipe, line, foods }: { recipe: Recipe; line: Line; foods: FoodLookup }) {
  const { rows, whole } = ingredientRows(recipe, line.batchId, line.amount, foods);
  return <Breakdown title={whole ? "In the whole batch" : "In this portion"} rows={rows} className="breakdown-flow" />;
}

export function NutritionPreview({ contents: c }: { contents: Contents }) {
  const kcal = c.kcal;
  const known = kcal && (kcal.complete || kcal.value > 0);
  return (
    <div className={`nutrition ${known ? "known" : ""}`}>
      <div className="kcal-total">
        <strong>{known ? `${kcal.complete ? "" : "≥"}${Math.round(kcal.value)}` : "?"}</strong>
        <span>kcal</span>
      </div>
      <div className="macro-chips">
        {(
          [
            ["protein", "P", "Protein"],
            ["carbs", "C", "Carbs"],
            ["fat", "F", "Fat"],
          ] as const
        ).map(([k, short, label]) => {
          const v = c[k];
          const has = v && (v.complete || v.value > 0);
          return (
            <span key={k} className={`macro macro-${k}`}>
              <span className="macro-icon" aria-hidden>
                {short}
              </span>
              <b>{has ? `${v.complete ? "" : "≥"}${grams(v.value)} g` : "?"}</b>
              <small>{label}</small>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function MacroFields({ values, onChange }: { values: Nutrients; onChange: (n: Nutrients) => void }) {
  return (
    <div className="macro-fields">
      {(
        [
          ["protein", "P", "Protein"],
          ["carbs", "C", "Carbs"],
          ["fat", "F", "Fat"],
        ] as const
      ).map(([k, short, label]) => (
        <label key={k} className={`macro-field macro-${k}`}>
          <span className="macro-field-label">
            <span className="macro-icon" aria-hidden>
              {short}
            </span>
            {label}
          </span>
          <span className="macro-field-input">
            <NumberInput placeholder="–" value={values[k]} onChange={(n) => onChange({ ...values, [k]: n })} />
            <span>g</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * The same card screen for both verbs. Drinks go by how often they're had and log in one tap;
 * food goes by most recent, with cooked dishes not eaten up yet first, and opens the amount.
 */
function FoodCards({ via, onPick, onSearch, onScan }: { via: FoodEntry["via"]; onPick: (f: Food) => void; onSearch: (query: string) => void; onScan: () => void }) {
  const usage = useFoodUsage();
  const { units } = useProfile();
  const foods = useFoodLookup();
  const listed = useListedFoods();
  const cards = useMemo(() => {
    const drink = (f: Food) => isDrink(f, foods);
    const starters = listed.filter((f) => f.starter && (via === "drank") === drink(f));
    const ordered =
      via === "drank"
        ? [...frequentDrinkIds(usage).map(foods), ...starters, ...listed.filter(drink)]
        : [...leftovers(listed), ...recentFoodIds(usage, "ate").map(foods), ...starters];
    const live = new Set(listed);
    const offered = (f: Food | undefined): f is Food => !!f && live.has(f) && loggable(f) && !(f.kind === "item" && f.unsure) && (via === "ate" || drink(f));
    return ordered.filter((f, i, all): f is Food => offered(f) && all.indexOf(f) === i).slice(0, via === "drank" ? 12 : 9);
  }, [usage, foods, listed, via]);

  const sub = (f: Food) => {
    if (f.kind === "combo") return "combo";
    if (f.kind === "recipe") {
      const b = currentBatch(f);
      return b && !b.gone ? `${batchLabel(b)} batch` : "recipe";
    }
    return formatAmount(usualAmount(usage, f.id) ?? defaultAmount(f, units));
  };

  return (
    <>
      <div className="search-bar">
        <input type="search" placeholder="Search, or add something new" onChange={(e) => onSearch(e.target.value)} />
        {canScan() && (
          <button className="scan-btn" onClick={onScan} aria-label="Scan barcode">
            <BarcodeIcon />
          </button>
        )}
      </div>
      {cards.length > 0 ? (
        <div className="drink-grid">
          {cards.map((f) => (
            <button key={f.id} className={`tile drink-card ${f.kind === "recipe" ? "tile-leftover" : ""}`} onClick={() => onPick(f)}>
              <span className="tile-icon">{f.icon}</span>
              <span className="tile-label">{f.name}</span>
              {f.kind === "item" && (f.variant || f.brand) && <span className="tile-variation">{[f.variant, f.brand].filter(Boolean).join(" · ")}</span>}
              <span className="tile-sub">{sub(f)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty">Nothing logged yet. Search above, scan a barcode, or add something new.</p>
      )}
      {cards.length > 0 && <p className="hint center">Tap to pick an amount.</p>}
    </>
  );
}
