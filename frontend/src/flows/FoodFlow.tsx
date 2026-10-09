import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ensureProvisionalItem, isCalorieOnly, mergeInto } from "../data/followUp";
import { allItems, itemById, itemByBarcode, itemIcon } from "../data/catalogue";
import { measureInBase } from "../data/measures";
import { nutritionAt, versionLabel } from "../data/nutrition";
import { useProfile } from "../data/profile";
import type { UnitSystem } from "../data/units";
import { useUserItems } from "../data/userItems";
import { addEntry, calculatedKcal, recentIds, updateEntry, useEntries, baseQuantity } from "../data/store";
import { initialWhen, nowWhen } from "../data/time";
import type { Amount, Estimate, FoodEntry, Item, When } from "../data/types";
import { FlowShell } from "../components/FlowShell";
import { ItemEditor } from "../components/ItemEditor";
import { canScan, Scanner } from "../components/Scanner";
import { useSteps } from "../components/useSteps";
import { WhenPicker } from "../components/WhenPicker";
import { NumberInput } from "../components/NumberInput";

type Step = "what" | "scan" | "amount" | "calories" | "item" | "when";

export type FoodFlowMode = { kind: "new" } | { kind: "edit"; entry: FoodEntry } | { kind: "duplicate"; entry: FoodEntry };

/**
 * Capturing, editing and duplicating are one flow; edit and duplicate start prefilled. A name
 * that isn't an item yet is saved as an unsure item, which is what gets followed up later.
 */
export function FoodFlow({
  date,
  mode = { kind: "new" },
  onDone,
}: {
  date: string;
  mode?: FoodFlowMode;
  onDone: (saved?: FoodEntry, previous?: FoodEntry) => void;
}) {
  const source = mode.kind === "new" ? undefined : mode.entry;
  const exit = useCallback(() => onDone(), [onDone]);
  const { step, depth, go, back, replace, close } = useSteps<Step>(source ? (isCalorieOnly(source) ? "calories" : "amount") : "what", exit);
  const entries = useEntries();
  const { units } = useProfile();
  useUserItems();

  const [when, setWhen] = useState<When>(() => (mode.kind === "edit" ? mode.entry.when : mode.kind === "duplicate" ? nowWhen() : initialWhen(date)));
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState(source?.barcode);
  const [itemId, setItemId] = useState(source?.itemId);
  const item = itemById(itemId);
  const [rawName, setRawName] = useState(source?.rawName);
  const [note, setNote] = useState(source?.note ?? "");
  const [amount, setAmount] = useState<Amount>(source?.amount ?? {});

  // A reload keeps the step in history but not what was picked, so start the pick over.
  useEffect(() => {
    if (!source && step === "amount" && !itemId && !rawName) replace("what");
  }, []);
  const [estimate, setEstimate] = useState<Estimate>(source?.estimate ?? {});

  const choose = (picked: Item | string) => {
    if (typeof picked === "string") {
      setItemId(undefined);
      setRawName(picked);
    } else {
      setItemId(picked.id);
      setRawName(source?.rawName);
    }
    if (typeof picked !== "string" && source && unitsFor(picked, units).some((u) => u.unit === amount.unit)) return;
    const measure = typeof picked === "string" ? undefined : picked.measures[0];
    setAmount({ value: 1, unit: measure?.label ?? "piece" });
  };

  /** Keeps the amount when the new item understands its unit, e.g. switching between batches. */
  const switchTo = (next: Item) => {
    setItemId(next.id);
    if (!unitsFor(next, units).some((u) => u.unit === amount.unit)) setAmount({ value: 1, unit: next.measures[0]?.label ?? next.baseUnit });
  };

  const onCode = (code: string) => {
    const match = itemByBarcode(code);
    setBarcode(code);
    if (match) {
      choose(match);
      replace("amount");
    } else {
      back();
    }
  };

  const hasEstimate = Object.values(estimate).some((v) => v !== undefined);
  const draft: FoodEntry = {
    id: mode.kind === "edit" ? mode.entry.id : crypto.randomUUID(),
    kind: "food",
    when,
    createdAt: mode.kind === "edit" ? mode.entry.createdAt : new Date().toISOString(),
    itemId,
    rawName,
    barcode,
    amount,
    estimate: hasEstimate ? estimate : undefined,
    followUp: "needs-follow-up",
  };
  const kcal = calculatedKcal(draft);

  const commit = (entry: FoodEntry) => {
    if (mode.kind === "edit") updateEntry(entry);
    else addEntry(entry);
    onDone(entry, mode.kind === "edit" ? mode.entry : undefined);
    close();
  };

  const linkedItemId = () => itemId ?? (rawName ? ensureProvisionalItem(rawName, barcode).id : undefined);

  const save = () => {
    const id = linkedItemId();
    commit({ ...draft, itemId: id, note: undefined, followUp: calculatedKcal({ ...draft, itemId: id }) !== undefined ? "done-with-item" : "needs-follow-up" });
  };

  const saveCalories = () =>
    commit({
      ...draft,
      itemId: undefined,
      rawName: undefined,
      barcode: undefined,
      amount: {},
      note: note.trim() || undefined,
      followUp: estimate.kcal !== undefined ? "done-with-estimate" : "needs-follow-up",
    });

  if (step === "scan") return <Scanner onCode={onCode} onClose={back} />;

  if (step === "when")
    return (
      <FlowShell title="When?" canGoBack onBack={back} onClose={close}>
        <WhenPicker value={when} onChange={setWhen} onDone={back} />
      </FlowShell>
    );

  if (step === "item" && item)
    return (
      <FlowShell title={item.provisional ? "Complete item" : "Edit item"} canGoBack onBack={back} onClose={close}>
        <ItemEditor
          item={item}
          entries={[...entries.filter((e): e is FoodEntry => e.kind === "food" && e.itemId === item.id && e.id !== draft.id), draft]}
          onSaved={back}
          onMerge={(target) => {
            mergeInto(item, target);
            switchTo(target);
            back();
          }}
        />
      </FlowShell>
    );

  if (step === "calories")
    return (
      <FlowShell
        title="Just calories"
        canGoBack={depth > 1}
        onBack={back}
        onClose={close}
        when={when}
        onWhen={() => go("when")}
        footer={
          <button className="btn btn-primary btn-block" disabled={estimate.kcal === undefined} onClick={saveCalories}>
            Save
          </button>
        }
      >
        <p className="hint">For when the details don't matter, like a day you forgot to log. Nothing to follow up later.</p>
        <EstimateFields estimate={estimate} onChange={setEstimate} label="kcal" autoFocus />
        <label className="field note-field">
          <span className="field-label">Note (optional)</span>
          <input className="text-input" placeholder="e.g. forgot to log lunch" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </FlowShell>
    );

  if (step === "amount")
    return (
      <FlowShell
        title={mode.kind === "edit" ? "Edit" : mode.kind === "duplicate" ? "Duplicate" : "How much?"}
        canGoBack={depth > 1}
        onBack={back}
        onClose={close}
        when={when}
        onWhen={() => go("when")}
        footer={
          <button className="btn btn-primary btn-block" onClick={save}>
            Save
          </button>
        }
      >
        <SelectedItem
          item={item}
          rawName={rawName}
          barcode={barcode}
          onChange={depth === 1 ? () => go("what") : undefined}
          onComplete={
            item?.provisional || (!item && rawName)
              ? () => {
                  setItemId(linkedItemId());
                  go("item");
                }
              : undefined
          }
        />

        <AmountInput item={item} amount={amount} onChange={setAmount} />

        <Nutrition kcal={kcal} item={item} draft={draft} estimate={estimate} onEstimate={setEstimate} />
      </FlowShell>
    );

  return (
    <FlowShell title={source ? "What was it?" : "I ate"} canGoBack={depth > 1} onBack={back} onClose={close} when={when} onWhen={() => go("when")}>
      <WhatStep
        extra={
          !query.trim() &&
          !barcode && (
            <button className="row row-unsure" onClick={() => go("calories")}>
              <span className="row-icon">🔥</span>
              <span className="row-main">
                <span className="row-title">Just log calories</span>
                <span className="row-sub">No item, e.g. “forgot to log, about 2,000”</span>
              </span>
            </button>
          )
        }
        entries={entries}
        query={query}
        onQuery={setQuery}
        barcode={barcode}
        onClearBarcode={() => setBarcode(undefined)}
        onScan={() => go("scan")}
        onPick={(p) => {
          choose(p);
          go("amount");
        }}
      />
    </FlowShell>
  );
}

export function WhatStep({
  entries,
  query,
  onQuery,
  barcode,
  onClearBarcode,
  onScan,
  onPick,
  extra,
}: {
  entries: ReturnType<typeof useEntries>;
  query: string;
  onQuery: (q: string) => void;
  barcode?: string;
  onClearBarcode?: () => void;
  /** Without it there is no scan button and typed names can't be kept as unsure items. */
  onScan?: () => void;
  onPick: (p: Item | string) => void;
  /** Shown above the list, e.g. "create an item from this capture". */
  extra?: ReactNode;
}) {
  const userItems = useUserItems();
  const recent = useMemo(
    () => recentIds(entries, "food", (e) => e.itemId).map(itemById).filter((i): i is Item => !!i && !i.deleted),
    [entries, userItems],
  );
  const items = allItems();
  const q = query.trim().toLowerCase();
  const matches = q ? items.filter((i) => `${i.name} ${i.variant ?? ""}`.toLowerCase().includes(q)) : [];
  const rest = items.filter((i) => !recent.includes(i));

  return (
    <>
      <div className="search-bar">
        <input
          type="search"
          placeholder={barcode ? "Name it for later…" : "Search items & recipes"}
          value={query}
          autoFocus={!!barcode}
          onChange={(e) => onQuery(e.target.value)}
        />
        {onScan && canScan() && (
          <button className="scan-btn" onClick={onScan} aria-label="Scan barcode">
            <BarcodeIcon />
            <span>Scan</span>
          </button>
        )}
      </div>

      {barcode && (
        <div className="notice">
          <span>
            Barcode <code>{barcode}</code> isn't one of your items yet. Pick a match or type a name for it.
          </span>
          <button className="icon-btn small" onClick={onClearBarcode} aria-label="Discard barcode">
            ✕
          </button>
        </div>
      )}

      {extra}
      <ul className="list">
        {q && onScan && (
          <li>
            <button className="row row-unsure" onClick={() => onPick(query.trim())}>
              <span className="row-icon">✎</span>
              <span className="row-main">
                <span className="row-title">“{query.trim()}”</span>
                <span className="row-sub">New unsure item, complete it later</span>
              </span>
            </button>
          </li>
        )}
        {q ? (
          matches.map((i) => <ItemRow key={i.id} item={i} onPick={onPick} />)
        ) : (
          <>
            {recent.length > 0 && <li className="list-heading">Recent</li>}
            {recent.map((i) => (
              <ItemRow key={i.id} item={i} onPick={onPick} />
            ))}
            <li className="list-heading">{recent.length ? "Everything else" : "Your items"}</li>
            {rest.map((i) => (
              <ItemRow key={i.id} item={i} onPick={onPick} />
            ))}
          </>
        )}
      </ul>
    </>
  );
}

function ItemRow({ item, onPick }: { item: Item; onPick: (i: Item) => void }) {
  return (
    <li>
      <button className="row" onClick={() => onPick(item)}>
        <span className="row-icon">{itemIcon(item)}</span>
        <span className="row-main">
          <span className="row-title">
            {item.name} {item.variant && <span className="badge badge-variant">{item.variant}</span>}
            {item.provisional && <span className="badge badge-warn">Unsure</span>}
          </span>
          <span className="row-sub">
            {[item.type === "recipe" ? "recipe" : null, item.measures[0] && `${item.measures[0].label} · ${measureInBase(item, item.measures[0].label) ?? "?"} ${item.baseUnit}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="row-chevron">›</span>
      </button>
    </li>
  );
}

export function SelectedItem({
  item,
  rawName,
  barcode,
  onChange,
  onComplete,
}: {
  item?: Item;
  rawName?: string;
  barcode?: string;
  onChange?: () => void;
  onComplete?: () => void;
}) {
  const unsure = !item || item.provisional;
  return (
    <div className={`selected ${unsure ? "selected-unsure" : ""}`}>
      <span className="row-icon">{!item ? "✎" : itemIcon(item)}</span>
      <div>
        <div className="row-title">
          {item ? item.name : rawName ? `“${rawName}”` : "Unnamed"} {item?.variant && <span className="badge badge-variant">{item.variant}</span>}
        </div>
        <div className="row-sub">
          {unsure && <span className="badge badge-warn">{item ? "Unsure item" : "New unsure item"}</span>}
          {[barcode].filter(Boolean).map((t) => (
            <span key={t}> {t}</span>
          ))}
        </div>
      </div>
      <div className="selected-links">
        {onComplete && (
          <button className="link-btn" onClick={onComplete}>
            Complete item
          </button>
        )}
        {onChange && (
          <button className="link-btn" onClick={onChange}>
            Change
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A known item offers only units it can convert: its own measures plus its base unit.
 * "piece" next to "can" would be two different counts of the same thing.
 */
export function unitsFor(item: Item | undefined, units: UnitSystem): { unit: string; hint?: string }[] {
  const generic = units === "metric" ? [{ unit: "piece" }, { unit: "g" }, { unit: "ml" }] : [{ unit: "piece" }, { unit: "oz" }, { unit: "fl oz" }];
  if (!item) return generic;
  const own = item.measures.map((m) => {
    const base = measureInBase(item, m.label);
    // "g" on a liquid is its density, not a portion, so a "0.97 ml" hint would only confuse.
    const portion = m.label !== "g" && base !== undefined;
    return { unit: m.label, hint: portion ? `${Math.round(base * 10) / 10} ${item.baseUnit}` : undefined };
  });
  // A provisional item doesn't know its unit yet, so any common unit can be logged.
  if (item.provisional) return [...own, ...generic].filter((u, i, all) => all.findIndex((x) => x.unit === u.unit) === i);
  // Imperial people weigh in oz but labels still print grams, so both stay available.
  const weighable = item.baseUnit === "ml" && item.measures.some((m) => m.label === "g");
  const imperialBase = units === "imperial" && item.baseUnit !== "piece" ? [{ unit: item.baseUnit === "g" ? "oz" : "fl oz" }, ...(weighable ? [{ unit: "oz" }] : [])] : [];
  return [...own, ...imperialBase, { unit: item.baseUnit }];
}

const isBulk = (unit?: string) => unit === "g" || unit === "ml";
const isOunce = (unit?: string) => unit === "oz" || unit === "fl oz";

export function AmountInput({ item, amount, onChange }: { item?: Item; amount: Amount; onChange: (a: Amount) => void }) {
  const units = unitsFor(item, useProfile().units);
  const quick = isBulk(amount.unit) ? [50, 100, 150, 200, 250, 330] : isOunce(amount.unit) ? [1, 2, 4, 8, 12, 16] : [0.5, 1, 1.5, 2, 3];
  const step = isBulk(amount.unit) ? 10 : isOunce(amount.unit) ? 1 : 0.5;
  const set = (value?: number) => onChange({ ...amount, value });

  return (
    <div className="amount">
      <div className="amount-display">
        <button className="round-btn" onClick={() => set(Math.max(0, (amount.value ?? 0) - step))} aria-label="Less">
          −
        </button>
        <NumberInput className="amount-value" value={amount.value} placeholder="?" onChange={set} />
        <button className="round-btn" onClick={() => set((amount.value ?? 0) + step)} aria-label="More">
          +
        </button>
      </div>
      <div className="chip-row center">
        {quick.map((n) => (
          <button key={n} className="chip chip-ghost" aria-pressed={amount.value === n} onClick={() => set(n)}>
            {n === 0.5 ? "½" : n === 1.5 ? "1½" : n}
          </button>
        ))}
      </div>
      <div className="chip-row center" role="radiogroup" aria-label="Unit">
        {units.map((u) => (
          <button
            key={u.unit}
            role="radio"
            aria-checked={amount.unit === u.unit}
            className="chip"
            onClick={() => onChange({ ...amount, unit: u.unit, value: isBulk(u.unit) ? 100 : isOunce(u.unit) ? 4 : 1 })}
          >
            {u.unit}
            {u.hint && <small> {u.hint}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

const macros = [
  { key: "protein", label: "Protein", short: "P" },
  { key: "carbs", label: "Carbs", short: "C" },
  { key: "fat", label: "Fat", short: "F" },
] as const;

export function Nutrition({
  kcal,
  item,
  draft,
  estimate,
  onEstimate,
}: {
  kcal?: number;
  item?: Item;
  draft: FoodEntry;
  estimate: Estimate;
  onEstimate: (e: Estimate) => void;
}) {
  const [open, setOpen] = useState(() => estimate.kcal !== undefined);

  const n = nutritionAt(item, draft.when.date);
  if (kcal !== undefined && n) {
    const base = baseQuantity(draft);
    const factor = base === undefined || !item ? NaN : item.baseUnit === "piece" ? base : base / 100;
    const versioned = (item?.nutrition?.length ?? 0) > 1;
    return (
      <div className="nutrition known">
        <div className="kcal-total">
          <strong>{Math.round(kcal)}</strong>
          <span>kcal</span>
        </div>
        <div className="macro-chips">
          {macros.map((m) => {
            const v = n[m.key];
            return (
              <span key={m.key} className={`macro macro-${m.key}`}>
                <span className="macro-icon" aria-hidden>
                  {m.short}
                </span>
                <b>{v === undefined || Number.isNaN(factor) ? "?" : Math.round(v * factor * 10) / 10} g</b>
                <small>{m.label}</small>
              </span>
            );
          })}
        </div>
        {versioned && <p className="hint nutrition-version">{versionLabel(n.from)} values. This item's nutrition changed over time; this uses what was valid on the day.</p>}
      </div>
    );
  }

  const reason = !draft.itemId
    ? "Item unknown"
    : item?.provisional
      ? "Unsure item"
      : draft.amount.value === undefined
        ? "Amount unknown"
        : n
          ? `Can't convert ${draft.amount.unit} for this item`
          : "No nutrition data for this item";

  return (
    <div className="nutrition">
      {!open ? (
        <button className="estimate-toggle" onClick={() => setOpen(true)}>
          <span>
            <strong>Calories unknown</strong>
            <small>{reason}</small>
          </span>
          <span className="link">+ Estimate</span>
        </button>
      ) : (
        <div className="estimate">
          <EstimateFields estimate={estimate} onChange={onEstimate} label="kcal (estimate)" autoFocus />
          <p className="hint">Macros are optional; skipped ones stay unknown, not zero.</p>
        </div>
      )}
    </div>
  );
}

export function EstimateFields({
  estimate,
  onChange,
  label,
  autoFocus,
}: {
  estimate: Estimate;
  onChange: (e: Estimate) => void;
  label: string;
  autoFocus?: boolean;
}) {
  return (
    <>
      <label className="kcal-field">
        <NumberInput integer autoFocus={autoFocus} placeholder="?" value={estimate.kcal} onChange={(kcal) => onChange({ ...estimate, kcal })} />
        <span>{label}</span>
      </label>
      <div className="macro-fields">
        {macros.map((m) => (
          <label key={m.key} className={`macro-field macro-${m.key}`}>
            <span className="macro-field-label">
              <span className="macro-icon" aria-hidden>
                {m.short}
              </span>
              {m.label}
            </span>
            <span className="macro-field-input">
              <NumberInput placeholder="–" value={estimate[m.key]} onChange={(n) => onChange({ ...estimate, [m.key]: n })} />
              <span>g</span>
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

export function BarcodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8" />
    </svg>
  );
}
