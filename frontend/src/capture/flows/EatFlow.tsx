import { useCallback, useEffect, useMemo, useState } from "react";
import { frequentFoodIds, recentFoodIds, saveEntry, useEntries, usualAmount } from "../../core/entries";
import { comboAsLines, undoPoint } from "../../core/followUp";
import { allFoods, batchLabel, comboById, currentBatch, displayName, foodById, foodIcon, isFinished, itemByBarcode, itemById, leftovers, loggable, recipeById, saveFood, setBatchGone, useFoods, variantsOf } from "../../core/foods";
import { suggestIcon } from "../../core/icons";
import { contents, defaultAmount, formatAmount, quantity, unitDimension, unitsFor } from "../../core/label";
import { batchPerUnit, type Contents, lineContents, lineFood, withBase } from "../../core/nutrition";
import { lookupBarcode, type Found } from "../../core/openFoodFacts";
import { useProfile } from "../../core/profile";
import { initialWhen, nowWhen, todayKey } from "../../core/time";
import { type Amount, BEGINNING, type Combo, type Food, type FoodData, type FoodEntry, type Item, type Line, type Nutrients, type Portion, type Recipe, type Serving, type When } from "../../core/types";
import { PortionList } from "../editors/PortionList";
import { ItemEditor } from "../editors/ItemEditor";
import { AmountInput } from "../ui/AmountInput";
import { FlowShell } from "../ui/FlowShell";
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
  icon?: string;
  barcode?: string;
  draft: LabelDraft;
  servings: Serving[];
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

function lineFor(f: Item | Recipe, amount: Amount): Line {
  if (f.kind === "item") return { id: newId(), itemId: f.id, amount };
  return { id: newId(), recipeId: f.id, batchId: currentBatch(f)?.id, amount };
}

function comboLines(c: Combo): Line[] {
  return c.parts.flatMap((p) => {
    const f = foodById(p.foodId);
    return f && f.kind !== "combo" ? [lineFor(f, p.amount)] : [];
  });
}

function recipeUnits(r: Recipe, batchId: string | undefined, system: "metric" | "imperial") {
  const batch = r.batches.find((b) => b.id === batchId) ?? currentBatch(r);
  const sized = batch && batchPerUnit(batch);
  if (!sized) return ["g"];
  return sized.unit === "portion" ? ["portion"] : system === "imperial" ? ["oz", "g"] : ["g"];
}

export function usualFor(f: Item | Recipe, entries: ReturnType<typeof useEntries>, system: "metric" | "imperial"): Amount {
  const usual = usualAmount(entries, f.id);
  if (usual) return usual;
  if (f.kind === "item") return defaultAmount(f, system);
  return recipeUnits(f, undefined, system)[0] === "portion" ? { value: 1, unit: "portion" } : { value: 300, unit: "g" };
}

export function EatFlow({ via, date, mode = { kind: "new" }, onDone }: { via: FoodEntry["via"]; date: string; mode?: EatMode; onDone: (saved?: FoodEntry, undo?: () => void) => void }) {
  const source = mode.kind === "new" ? undefined : mode.entry;
  const starting = mode.kind === "new" && mode.foodId ? foodById(mode.foodId) : undefined;
  const exit = useCallback(() => onDone(), [onDone]);
  const first: Step = source || starting ? "amount" : "cards";
  const { step, depth, go, back, replace, close } = useSteps<Step>(first, exit);
  const entries = useEntries();
  const { units } = useProfile();
  useFoods();

  const [entryId] = useState(() => (mode.kind === "edit" ? mode.entry.id : newId()));
  const [when, setWhen] = useState<When>(() => (mode.kind === "edit" ? mode.entry.when : mode.kind === "duplicate" ? nowWhen() : initialWhen(date)));
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState<string>();
  const [found, setFound] = useState<Found>();
  const [attachTo, setAttachTo] = useState<Item>();
  const [comboId, setComboId] = useState(source?.comboId);
  const [title, setTitle] = useState(source?.title);
  const [lines, setLines] = useState<Line[]>(() => {
    if (source) return source.lines.map((l) => (mode.kind === "duplicate" ? { ...l, id: newId() } : l));
    if (starting && starting.kind !== "combo") return [lineFor(starting, usualFor(starting, entries, units))];
    return [];
  });
  // An entry-only line is edited the same way it was made: as a new food that isn't saved yet.
  const [newFood, setNewFood] = useState<NewFood | undefined>(() => {
    const only = source?.lines.length === 1 ? source.lines[0] : undefined;
    if (!only || only.itemId || only.recipeId) return undefined;
    const label = only.own?.labels[only.own.labels.length - 1];
    return { kind: "item", parts: [], name: only.rawName ?? "", variant: "", barcode: only.barcode, draft: draftFrom(only.own?.unit, label, "typed"), servings: only.own?.servings ?? [] };
  });
  const [calories, setCalories] = useState<Nutrients>({});
  const [note, setNote] = useState("");
  const [openLine, setOpenLine] = useState<string>();
  const [lastOfIt, setLastOfIt] = useState(false);

  // A reload keeps the step in history but not what was picked, so start the pick over.
  useEffect(() => {
    if (step === "amount" && lines.length === 0 && !newFood) replace(first === "amount" ? "what" : first);
  }, []);

  useEffect(() => {
    if (!barcode || itemByBarcode(barcode)) return;
    const ctrl = new AbortController();
    lookupBarcode(barcode, ctrl.signal).then(setFound);
    return () => ctrl.abort();
  }, [barcode]);

  /** An edit keeps what a line came to on the day unless its amount was changed. */
  const untouched = (l: Line) => {
    const before = mode.kind === "edit" ? mode.entry.lines.find((x) => x.id === l.id) : undefined;
    return !!before && before.base !== undefined && before.itemId === l.itemId && JSON.stringify(before.amount) === JSON.stringify(l.amount);
  };

  const commit = (lineList: Line[], extra: Partial<FoodEntry> = {}) => {
    const undo = undoPoint();
    const entry: FoodEntry = {
      id: entryId,
      kind: "food",
      when,
      createdAt: mode.kind === "edit" ? mode.entry.createdAt : new Date().toISOString(),
      via: source?.via ?? via,
      comboId,
      title,
      lines: lineList.map((l) => (l.recipeId || untouched(l) ? l : withBase(l, lineFood(l)))),
      ...extra,
    };
    saveEntry(entry);
    const eaten = lineList.length === 1 ? lineList[0] : undefined;
    if (lastOfIt && eaten?.recipeId && eaten.batchId) setBatchGone(eaten.recipeId, eaten.batchId, true);
    onDone(entry, undo);
    close();
  };

  const pickFood = (f: Food) => {
    setNewFood(undefined);
    if (f.kind === "combo") {
      setComboId(f.id);
      setTitle(f.name);
      setLines(comboLines(f));
      go("amount");
      return;
    }
    if (f.kind === "item" && barcode && f.barcode !== barcode && !itemByBarcode(barcode)) {
      setAttachTo(f);
      go("attach");
      return;
    }
    const kept = lines.length === 1 ? lines[0].amount : undefined;
    const fits = kept && (f.kind === "item" ? quantity(f, kept) !== undefined : recipeUnits(f, undefined, units).includes(kept.unit ?? ""));
    setComboId(undefined);
    setTitle(undefined);
    setLines([{ ...lineFor(f, fits ? kept : usualFor(f, entries, units)), id: lines[0]?.id ?? newId(), barcode: f.kind === "item" && f.barcode === barcode ? barcode : undefined }]);
    go("amount");
  };

  const startNew = (name: string, base?: Item) => {
    const fromDb = found && !base && (!name || name === found.name);
    setNewFood({
      kind: "item",
      parts: [],
      name: base?.name ?? (name || found?.name || ""),
      variant: fromDb ? (found.brand ?? "") : "",
      icon: base?.icon,
      barcode,
      draft: fromDb ? draftFrom(found.unit, found.label, "database") : draftFrom(base?.unit ?? (via === "drank" ? "ml" : undefined), undefined),
      servings: fromDb ? found.servings : [],
    });
    setComboId(undefined);
    setTitle(undefined);
    setLines([{ id: newId(), rawName: name, barcode, amount: {} }]);
    go("new");
  };

  const onCode = (code: string) => {
    const match = itemByBarcode(code);
    setBarcode(code);
    if (match) {
      setLines([{ ...lineFor(match, usualFor(match, entries, units)), barcode: code }]);
      setComboId(undefined);
      setTitle(undefined);
      setNewFood(undefined);
      replace("amount");
    } else back();
  };

  /** Saves the new food as asked, then the entry with one line pointing at it, or carrying it. */
  const saveNew = (as: "completed" | "unsure" | "entry") => {
    if (!newFood) return;
    const line = lines[0];
    const data = newFoodData(newFood, line.amount);
    const name = newFood.name.trim() || "Something";
    if (as === "entry") {
      commit([{ id: line.id, rawName: name, barcode: newFood.barcode, amount: line.amount, own: data }]);
      return;
    }
    const item: Item = {
      id: newId(),
      kind: "item",
      name,
      variant: newFood.variant.trim() || undefined,
      icon: newFood.icon,
      barcode: newFood.barcode,
      ...data,
      unsure: as === "unsure" || undefined,
    };
    saveFood(item);
    commit([{ id: line.id, itemId: item.id, rawName: name, barcode: newFood.barcode, amount: line.amount }]);
  };

  const newCombo = (): Combo | undefined =>
    newFood?.kind === "combo" ? { id: newId(), kind: "combo", name: newFood.name.trim() || "Something", icon: newFood.icon, parts: newFood.parts } : undefined;

  /** Coming back from a combo's parts, the single line for the new item starts over. */
  const toItemAmount = () => {
    if (lines.length !== 1 || lines[0].itemId || lines[0].recipeId) setLines([{ id: newId(), rawName: newFood?.name, barcode, amount: {} }]);
    go("amount");
  };

  const toComboAmount = () => {
    const combo = newCombo();
    if (!combo) return;
    setLines(comboAsLines(combo));
    go("amount");
  };

  /** Logs the parts; with keep, the combo is saved too, so next time it's one tap. */
  const saveNewCombo = (keep: boolean) => {
    const combo = newCombo();
    if (!combo) return;
    if (keep) saveFood(combo);
    commit(lines, keep ? { comboId: combo.id, title: undefined } : { comboId: undefined, title: combo.name });
  };

  const quickLog = (f: Food) => {
    if (f.kind === "combo") return commit(comboLines(f), { comboId: f.id, title: undefined });
    commit([lineFor(f, usualFor(f, entries, units))], { comboId: undefined, title: undefined });
  };

  const header = { canGoBack: depth > 1, onBack: back, onClose: close, when, onWhen: () => go("when") };

  if (step === "scan") return <Scanner onCode={onCode} onClose={back} />;

  if (step === "when")
    return (
      <FlowShell title="When?" canGoBack onBack={back} onClose={close}>
        <WhenPicker value={when} onChange={setWhen} onDone={back} />
      </FlowShell>
    );

  if (step === "item") {
    const item = itemById(lines[0]?.itemId);
    if (!item) return null;
    return (
      <FlowShell title={item.unsure ? "Complete item" : "Edit item"} canGoBack onBack={back} onClose={close}>
        <ItemEditor
          item={item}
          onSaved={back}
          onMerged={(target) => {
            if (target.kind === "combo") {
              setComboId(target.id);
              setTitle(target.name);
              setLines(comboAsLines(target, lines[0].amount.value ?? 1));
            } else setLines([target.kind === "item" ? { ...lines[0], itemId: target.id } : { ...lineFor(target, lines[0].amount), id: lines[0].id }]);
            back();
          }}
          onCombo={(combo) => {
            setComboId(combo.id);
            setTitle(combo.name);
            setLines(comboAsLines(combo, lines[0].amount.value ?? 1));
            back();
          }}
        />
      </FlowShell>
    );
  }

  if (step === "attach" && attachTo)
    return (
      <FlowShell title={attachTo.name} subtitle={`Barcode ${barcode}`} canGoBack onBack={back} onClose={close}>
        <p className="hint">This barcode isn't on {displayName(attachTo)} yet.</p>
        <button
          className="row"
          onClick={() => {
            saveFood({ ...attachTo, barcode });
            setBarcode(undefined);
            setLines([{ ...lineFor(attachTo, usualFor(attachTo, entries, units)), barcode }]);
            replace("amount");
          }}
        >
          <span className="row-icon">{foodIcon(attachTo)}</span>
          <span className="row-main">
            <span className="row-title">It's this one</span>
            <span className="row-sub">Add the barcode to {displayName(attachTo)}, so the next scan finds it</span>
          </span>
        </button>
        <button className="row" onClick={() => startNew(attachTo.name, attachTo)}>
          <span className="row-icon">＋</span>
          <span className="row-main">
            <span className="row-title">Another variant of it</span>
            <span className="row-sub">A different brand or size, with its own label</span>
          </span>
        </button>
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
            onClick={() =>
              commit(
                [
                  {
                    id: newId(),
                    rawName: note.trim() || undefined,
                    amount: { value: 1, unit: "piece" },
                    own: { unit: "piece", labels: [{ from: BEGINNING, per: "serving", values: calories, source: "typed" }], servings: [] },
                  },
                ],
                { comboId: undefined, title: undefined },
              )
            }
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
    const twins = newFood.name.trim() ? variantsOf({ id: "", name: newFood.name }) : [];
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
    const line = lines[0];
    const buildingCombo = newFood?.kind === "combo";
    const newItem = buildingCombo ? undefined : newFood;
    const single = lines.length === 1 && !comboId && !buildingCombo;
    const item = itemById(line?.itemId);
    const recipe = recipeById(line?.recipeId);
    const combo = comboById(comboId);
    const preview = newItem ? previewNew(newItem, line.amount, when.date) : lines.reduce<Contents>((sum, l) => mergeContents(sum, lineContents(l, when.date)), {});
    const changeable = mode.kind !== "edit" || single;

    return (
      <FlowShell
        title={combo?.name ?? title ?? (newFood ? newFood.name || "Unnamed" : recipe ? recipe.name : item ? item.name : (line?.rawName ?? "How much?"))}
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
            item?.variant
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
            {recipe && line.batchId && (
              <label className="check-line">
                <input type="checkbox" checked={lastOfIt} onChange={(e) => setLastOfIt(e.target.checked)} />
                That was the last of it
              </label>
            )}
            <AmountInput
              amount={line.amount}
              units={newItem ? unitsFor(labelFrom(newItem.draft) ? newFoodData(newItem, line.amount) : undefined, units) : recipe ? recipeUnits(recipe, line.batchId, units) : unitsFor(item ?? line.own, units)}
              allowOther={!!newItem || !!item?.unsure}
              onChange={(amount) => setLines([{ ...line, amount }])}
            />
          </>
        ) : (
          <ComboLines lines={lines} openId={openLine} onOpen={setOpenLine} onChange={setLines} />
        )}
        <NutritionPreview contents={preview} />
      </FlowShell>
    );
  }

  if (step === "cards")
    return (
      <FlowShell title={via === "drank" ? "I drank" : "I ate"} {...header}>
        <FoodCards
          via={via}
          onPick={via === "drank" ? quickLog : pickFood}
          onSearch={(q) => {
            setQuery(q);
            go("what");
          }}
          onScan={() => go("scan")}
        />
      </FlowShell>
    );

  return (
    <FlowShell title={source ? "What was it?" : via === "drank" ? "What did you drink?" : "I ate"} {...header}>
      <FoodSearch
        query={query}
        onQuery={setQuery}
        kinds={["item", "combo", "recipe"]}
        recentIds={recentFoodIds(entries, via)}
        placeholder="Search items, combos, recipes"
        onPick={pickFood}
        onNew={(name) => startNew(name)}
        onScan={() => go("scan")}
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

function NewFoodHead({ value, onChange, twins }: { value: NewFood; onChange: (n: NewFood) => void; twins: Item[] }) {
  const icon = value.icon ?? suggestIcon(value.name, ["drink", "food"]);
  return (
    <>
      <div className="name-row">
        <span className="row-icon big">{icon ?? "🍽️"}</span>
        <input className="big-text" placeholder="What was it?" autoFocus={!value.name} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </div>
      <label className="field compact">
        <span className="field-label">Variant (optional)</span>
        <input className="text-input" placeholder="Brand, store, raw or cooked" value={value.variant} onChange={(e) => onChange({ ...value, variant: e.target.value })} />
      </label>
      {twins.length > 0 && !value.variant.trim() && (
        <p className="hint">
          You already have {twins.map((t) => (t.variant ? `${t.name} (${t.variant})` : t.name)).join(", ")}. Give this one a variant to tell them apart.
        </p>
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
  const batches = recipe.batches.filter(isFinished).reverse();
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

/** A combo logs at its usual amounts; each part opens for a day with more milk. */
function ComboLines({ lines, openId, onOpen, onChange }: { lines: Line[]; openId?: string; onOpen: (id?: string) => void; onChange: (l: Line[]) => void }) {
  const { units } = useProfile();
  return (
    <ul className="list combo-lines">
      {lines.map((l) => {
        const food = foodById(l.itemId ?? l.recipeId);
        const open = openId === l.id;
        return (
          <li key={l.id} className={`combo-line ${open ? "open" : ""}`}>
            <button className="row" onClick={() => onOpen(open ? undefined : l.id)} aria-expanded={open}>
              <span className="row-icon">{food ? foodIcon(food) : "✎"}</span>
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
                      ? recipeUnits(food, l.batchId, units)
                      : food?.kind === "item" && food.unsure
                        ? [...new Set([...unitsFor(food, units), ...unitsFor(undefined, units)])]
                        : unitsFor(food?.kind === "item" ? food : l.own, units)
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
              <b>{has ? `${v.complete ? "" : "≥"}${Math.round(v.value * 10) / 10} g` : "?"}</b>
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
  const entries = useEntries();
  const { units } = useProfile();
  const foods = useFoods();
  const cards = useMemo(() => {
    const isDrink = (f: Food) => (f.kind === "item" ? f.unit === "ml" : f.kind === "combo" && f.parts.some((p) => itemById(p.foodId)?.unit === "ml"));
    const ordered =
      via === "drank"
        ? [...frequentFoodIds(entries, "drank", todayKey()).map(foodById), ...allFoods().filter((f) => f.id.startsWith("seed-")), ...allFoods().filter(isDrink)]
        : [...leftovers(), ...recentFoodIds(entries, "ate").map(foodById)];
    const offered = (f: Food | undefined): f is Food => !!f && !f.deleted && loggable(f) && !(f.kind === "item" && f.unsure) && (via === "ate" || isDrink(f));
    return ordered.filter((f, i, all): f is Food => offered(f) && all.indexOf(f) === i).slice(0, via === "drank" ? 12 : 9);
  }, [entries, foods, via]);

  const sub = (f: Food) => {
    if (f.kind === "combo") return "combo";
    if (f.kind === "recipe") {
      const b = currentBatch(f);
      return b && !b.gone ? `${batchLabel(b)} batch` : "recipe";
    }
    return formatAmount(usualAmount(entries, f.id) ?? defaultAmount(f, units));
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
              <span className="tile-icon">{foodIcon(f)}</span>
              <span className="tile-label">{f.name}</span>
              <span className="tile-sub">{sub(f)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty">Nothing logged yet. Search above, scan a barcode, or add something new.</p>
      )}
      {cards.length > 0 && <p className="hint center">{via === "drank" ? "Tap to log your usual amount. Change it from the message that follows." : "Tap to pick an amount."}</p>}
    </>
  );
}
