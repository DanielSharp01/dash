import { useState } from "react";
import { allItems } from "../data/catalogue";
import { measureInBase } from "../data/measures";
import { latestNutrition, valuesOf, versionLabel } from "../data/nutrition";
import { itemById, itemIcon } from "../data/catalogue";
import { foodIcons, IconPicker } from "./IconPicker";
import { todayKey } from "../data/time";
import { saveUserItem } from "../data/userItems";
import type { BaseUnit, FoodEntry, Item, Measure, NutritionVersion } from "../data/types";
import { NumberInput } from "./NumberInput";

type Macro = "kcal" | "protein" | "carbs" | "fat";

const round = (n: number) => Math.round(n * 10) / 10;

interface Props {
  item: Item;
  /** Entries using this item; their guesses can seed the nutrition. */
  entries: FoodEntry[];
  onSaved: (item: Item) => void;
  /** Offered for provisional items: their entries become calorie-only and the item goes away. */
  onOneOff?: () => void;
  /** Offered for provisional items: it was an existing item all along. */
  onMerge?: (target: Item) => void;
  /** Offered for your saved items; publishing can't be undone. */
  onPublish?: () => void;
  /** Opens another item, e.g. a sibling variant. */
  onOpenItem?: (item: Item) => void;
}

/**
 * Edits any item. For a provisional one this is the follow-up: the name, barcode and guesses
 * from its captures are the starting point, and saving makes it a real item.
 */
export function ItemEditor({ item, entries, onSaved, onOneOff, onMerge, onPublish, onOpenItem }: Props) {
  const [name, setName] = useState(item.name);
  const [variant, setVariant] = useState(item.variant ?? "");
  const [type, setType] = useState(item.type);
  const [icon, setIcon] = useState(item.icon);
  const [fluid, setFluid] = useState(!!item.fluid);
  const [baseUnit, setBaseUnit] = useState<BaseUnit>(item.baseUnit);
  // A liquid's weight per volume is stored as the measure "1 g = x ml" but edited as one number.
  const [gramsPer100ml, setGramsPer100ml] = useState<number | undefined>(() => {
    const g = item.baseUnit === "ml" ? item.measures.find((m) => m.label === "g" && m.unit === "ml") : undefined;
    return g ? round(100 / g.qty) : undefined;
  });
  const [measures, setMeasures] = useState<Measure[]>(() => {
    // Units a provisional item was logged in become measures waiting for a size.
    const logged = item.provisional
      ? [...new Set(entries.map((e) => e.amount.unit).filter((u): u is string => !!u && !["g", "ml", item.baseUnit].includes(u)))]
      : [];
    return [...item.measures.filter((m) => m.label !== "g"), ...logged.filter((l) => !item.measures.some((m) => m.label === l)).map((label) => ({ label, qty: NaN, unit: item.baseUnit }))];
  });
  const [versions, setVersions] = useState<NutritionVersion[]>(item.nutrition ?? []);
  const latest = versions[versions.length - 1];
  // Typed as on the label: per 100 g/ml or per serving; stored per 100 either way.
  const [values, setTyped] = useState<Partial<Record<Macro, number>>>(() => valuesOf(latest));
  const [labelBasis, setLabelBasis] = useState<"100" | "serving">("100");
  const [servingSize, setServingSize] = useState<number>();
  const [servingCount, setServingCount] = useState<number>();
  const [servingName, setServingName] = useState("");
  const perServing = labelBasis === "serving" && baseUnit !== "piece";
  const scale = (v: Partial<Record<Macro, number>>, f: number) =>
    Object.fromEntries(Object.entries(v).map(([k, n]) => [k, n === undefined ? undefined : round(n * f)])) as Partial<Record<Macro, number>>;
  const per100 = perServing ? (servingSize ? scale(values, 100 / servingSize) : {}) : values;
  /** For values that are already per 100, like a guess or another variant's nutrition. */
  const setValues = (v: Partial<Record<Macro, number>>) => {
    setLabelBasis("100");
    setTyped(v);
  };
  const switchBasis = (next: "100" | "serving") => {
    if (next === labelBasis) return;
    if (servingSize) setTyped(next === "serving" ? scale(values, servingSize / 100) : per100);
    setLabelBasis(next);
  };
  const [change, setChange] = useState<"fix" | "changed">();
  const [changedFrom, setChangedFrom] = useState(todayKey);
  const [barcode, setBarcode] = useState(item.barcode);
  const [picking, setPicking] = useState(false);

  const draft = { baseUnit, measures };
  const typedValue = (k: Macro) => values[k];
  const setTypedValue = (k: Macro, n?: number) => setTyped({ ...values, [k]: n });
  const isNew = !itemById(item.id);
  const per = baseUnit === "piece" ? "per piece" : `per 100 ${baseUnit}`;
  const siblings = allItems().filter((i) => i.id !== item.id && !i.provisional && item.name && i.name.trim().toLowerCase() === item.name.trim().toLowerCase());

  const guessEntry = [...entries].reverse().find((e) => e.estimate?.kcal !== undefined && e.amount.value !== undefined);
  const guessBase = guessEntry?.amount.unit ? measureInBase(draft, guessEntry.amount.unit) : undefined;
  const fillFromGuess = () => {
    if (!guessEntry?.estimate || guessBase === undefined) return;
    const qty = guessEntry.amount.value! * guessBase;
    const scale = baseUnit === "piece" ? 1 / qty : 100 / qty;
    const g = guessEntry.estimate;
    const r = (v?: number) => (v === undefined ? undefined : round(v * scale));
    setValues({ kcal: r(g.kcal), protein: r(g.protein), carbs: r(g.carbs), fat: r(g.fat) });
  };

  /** Starts from the picked item's details; the captured name becomes the variant unless it's the same. */
  const becomeVariantOf = (target: Item) => {
    setName(target.name);
    if (name.trim() && name.trim().toLowerCase() !== target.name.trim().toLowerCase()) setVariant(name.trim());
    setType(target.type);
    setIcon(target.icon);
    setBaseUnit(target.baseUnit);
    setMeasures([...target.measures, ...measures.filter((m) => !target.measures.some((t) => t.label === m.label) && !Number.isFinite(m.qty))]);
    setValues(valuesOf(latestNutrition(target)));
    setPicking(false);
  };

  const setMeasure = (i: number, patch: Partial<Measure>) => setMeasures(measures.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const macroKeys = ["kcal", "protein", "carbs", "fat"] as const;
  // Only a real item's published values can change; filling in an unsure one is just completing it.
  const differs = (a?: number, b?: number) => (a === undefined) !== (b === undefined) || (a !== undefined && Math.abs(a - b!) > 0.05);
  const nutritionChanged = !!latest && !item.provisional && macroKeys.some((k) => differs(per100[k], latest[k]));
  const changedFromValid = !!changedFrom && changedFrom > latest?.from;

  const nextVersions = (): NutritionVersion[] | undefined => {
    if (per100.kcal === undefined) return versions.length > 1 ? versions.slice(0, -1) : undefined;
    const current = { kcal: per100.kcal, protein: per100.protein, carbs: per100.carbs, fat: per100.fat };
    if (!latest) return [{ from: "", ...current }];
    if (nutritionChanged && change === "changed") return [...versions, { from: changedFrom, ...current }];
    return [...versions.slice(0, -1), { from: latest.from, ...current }];
  };

  /** The label's serving (and what it's made of, e.g. 2 cookies) is worth keeping as measures. */
  const savedMeasures = (): Measure[] => {
    const kept = measures.filter((m) => m.label.trim() && Number.isFinite(m.qty) && m.qty > 0).map((m) => ({ ...m, label: m.label.trim() }));
    const has = (label: string) => kept.some((m) => m.label.toLowerCase() === label.toLowerCase());
    const extra: Measure[] = [];
    if (perServing && servingSize) {
      if (!has("serving")) extra.push({ label: "serving", qty: servingSize, unit: baseUnit });
      const piece = servingName.trim();
      if (piece && servingCount && servingCount > 0 && !has(piece)) extra.push({ label: piece, qty: round(servingSize / servingCount), unit: baseUnit });
    }
    if (baseUnit === "ml" && gramsPer100ml && gramsPer100ml > 0) extra.push({ label: "g", qty: Math.round((100 / gramsPer100ml) * 1000) / 1000, unit: "ml" });
    return [...kept, ...extra];
  };

  const save = () => {
    const next: Item = {
      ...item,
      name: name.trim(),
      variant: variant.trim() || undefined,
      type,
      icon,
      fluid: baseUnit === "ml" && fluid ? true : undefined,
      baseUnit,
      barcode,
      measures: savedMeasures(),
      nutrition: nextVersions(),
      provisional: false,
    };
    saveUserItem(next);
    onSaved(next);
  };

  if (picking)
    return (
      <KindOfPicker
        item={item}
        name={name.trim()}
        entryCount={isNew ? undefined : entries.length}
        onExisting={(target) => (isNew ? onOpenItem?.(target) : onMerge?.(target))}
        onNewVariant={becomeVariantOf}
        onCancel={() => setPicking(false)}
      />
    );

  return (
    <div className="item-editor">
      {(item.provisional || isNew) && (
        <button className="row row-unsure" onClick={() => setPicking(true)}>
          <span className="row-icon">⑂</span>
          <span className="row-main">
            <span className="row-title">It's a kind of…</span>
            <span className="row-sub">{isNew ? "Start from an item you have, as a new variant" : "One of your items, as an existing or a new variant"}</span>
          </span>
        </button>
      )}
      {item.provisional && (
        <div className="notice">
          <span>
            Created from {entries.length === 1 ? "a capture" : `${entries.length} captures`}. Fill in what you know; saving makes it one of your
            items and updates {entries.length === 1 ? "that entry" : "those entries"}.
          </span>
        </div>
      )}

      <label className="field">
        <span className="field-label">Name</span>
        <input className="big-text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Variant (optional)</span>
        <input className="text-input" placeholder="Brand, batch or recipe version, e.g. Ceres or Sept batch" value={variant} onChange={(e) => setVariant(e.target.value)} />
      </label>
      {siblings.length > 0 && (
        <div className="field">
          <span className="field-label">Other variants of “{item.name}”</span>
          <ul className="list">
            {siblings.map((s) => (
              <li key={s.id}>
                <button className="row row-variant" disabled={!onOpenItem} onClick={() => onOpenItem?.(s)}>
                  <span className="row-main">
                    <span className="row-title">
                      <span className="badge badge-variant">{s.variant ?? "No variant"}</span>
                    </span>
                    <span className="row-sub">{[latestNutrition(s) && `${Math.round(latestNutrition(s)!.kcal)} kcal / ${s.baseUnit === "piece" ? "piece" : `100 ${s.baseUnit}`}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  {onOpenItem && <span className="row-chevron">›</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="field">
        <span className="field-label">Kind</span>
        <div className="segmented small">
          <button aria-selected={type === "item"} onClick={() => setType("item")}>
            🥫 Product
          </button>
          <button aria-selected={type === "recipe"} onClick={() => setType("recipe")}>
            🍲 Recipe
          </button>
        </div>

      <div className="field">
        <span className="field-label">Icon</span>
        <IconPicker value={icon ?? itemIcon({ type })} options={foodIcons} onChange={setIcon} />
      </div>
      </div>

      <div className="field">
        <span className="field-label">Measured in</span>
        <div className="segmented small">
          {(["g", "ml", "piece"] as const).map((u) => (
            <button key={u} aria-selected={baseUnit === u} onClick={() => setBaseUnit(u)}>
              {u === "piece" ? "pieces" : u}
            </button>
          ))}
        </div>
        {baseUnit === "ml" && (
          <label className="check-line">
            <input type="checkbox" checked={fluid} onChange={(e) => setFluid(e.target.checked)} />
            💧 Counts as fluid (water, coffee, tea, soft drinks; not oil or sauces)
          </label>
        )}
      </div>

      <div className="field">
        <span className="field-label">Measures</span>
        <p className="hint">What a slice, pack or box means for this item. A measure can be built from one above it.</p>
        {measures.map((m, i) => {
          const options = [baseUnit, ...measures.slice(0, i).map((x) => x.label).filter(Boolean)];
          const inBase = measureInBase(draft, m.label);
          return (
            <div key={i} className="measure-row">
              <div className="measure-def">
                1
                <input placeholder="slice, pack…" value={m.label} onChange={(e) => setMeasure(i, { label: e.target.value })} />=
                <NumberInput placeholder="?" value={Number.isFinite(m.qty) ? m.qty : undefined} onChange={(n) => setMeasure(i, { qty: n ?? NaN })} />
                <button className="icon-btn small" onClick={() => setMeasures(measures.filter((_, j) => j !== i))} aria-label={`Remove ${m.label || "measure"}`}>
                  ✕
                </button>
              </div>
              <div className="chip-row measure-units" role="radiogroup" aria-label="In">
                {options.map((o) => (
                  <button key={o} role="radio" aria-checked={m.unit === o} className="chip" onClick={() => setMeasure(i, { unit: o })}>
                    {o}
                  </button>
                ))}
                {m.unit !== baseUnit && inBase !== undefined && (
                  <span className="measure-total">
                    = {round(inBase)} {baseUnit}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <button className="link-btn" onClick={() => setMeasures([...measures, { label: "", qty: NaN, unit: baseUnit }])}>
          ＋ Add measure
        </button>
        {baseUnit === "ml" && (
          <div className="density">
            <span className="field-label">Can be weighed</span>
            <div className="measure-def">
              100 ml weighs
              <NumberInput placeholder="?" value={gramsPer100ml} onChange={setGramsPer100ml} />g
            </div>
            <p className="hint">Lets you log it in grams from a kitchen scale. Water-like drinks are about 100 g, oil 92, honey 140.</p>
          </div>
        )}
      </div>

      <div className="field">
        <span className="field-label">
          Nutrition {perServing ? "per serving" : per}
          {versions.length > 1 && latest && ` · ${versionLabel(latest.from).toLowerCase()}`}
        </span>
        {baseUnit !== "piece" && (
          <>
            <div className="segmented small">
              <button aria-selected={!perServing} onClick={() => switchBasis("100")}>
                Per 100 {baseUnit}
              </button>
              <button aria-selected={perServing} onClick={() => switchBasis("serving")}>
                Per serving
              </button>
            </div>
            {perServing && (
              <div className="serving-def">
                <div className="measure-def">
                  A serving is
                  <NumberInput placeholder="?" value={servingSize} onChange={setServingSize} />
                  {baseUnit}
                </div>
                <div className="measure-def">
                  made of
                  <NumberInput placeholder="–" value={servingCount} onChange={setServingCount} />
                  <input placeholder="cookie, slice… (optional)" value={servingName} onChange={(e) => setServingName(e.target.value)} />
                </div>
                <p className="hint">
                  Type it as the label shows it.
                  {servingSize && per100.kcal !== undefined ? ` That's ${per100.kcal} kcal per 100 ${baseUnit}.` : ""}
                  {servingSize && servingCount && servingName.trim() ? ` Adds “serving” and “${servingName.trim()}” (${round(servingSize / servingCount)} ${baseUnit}) as measures.` : servingSize ? " Adds “serving” as a measure." : ""}
                </p>
              </div>
            )}
          </>
        )}
        {guessEntry && (
          <div className="guess-hint">
            <span>
              You guessed {guessEntry.estimate!.kcal} kcal for {guessEntry.amount.value} {guessEntry.amount.unit}.
            </span>
            <button className="link" disabled={guessBase === undefined} onClick={fillFromGuess} title={guessBase === undefined ? `Give “${guessEntry.amount.unit}” a size first` : undefined}>
              Use my guess
            </button>
          </div>
        )}
        <label className="kcal-field">
          <NumberInput placeholder="?" value={typedValue("kcal")} onChange={(n) => setTypedValue("kcal", n)} />
          <span>kcal</span>
        </label>
        <div className="macro-fields">
          {(
            [
              ["protein", "Protein", "P"],
              ["carbs", "Carbs", "C"],
              ["fat", "Fat", "F"],
            ] as const
          ).map(([key, label, short]) => (
            <label key={key} className={`macro-field macro-${key}`}>
              <span className="macro-field-label">
                <span className="macro-icon" aria-hidden>
                  {short}
                </span>
                {label}
              </span>
              <span className="macro-field-input">
                <NumberInput placeholder="–" value={typedValue(key)} onChange={(n) => setTypedValue(key, n)} />
                <span>g</span>
              </span>
            </label>
          ))}
        </div>
        {nutritionChanged && (
          <div className="version-choice">
            <span className="field-label">What happened?</span>
            <div className="segmented small">
              <button aria-selected={change === "fix"} onClick={() => setChange("fix")}>
                Fix a mistake
              </button>
              <button aria-selected={change === "changed"} onClick={() => setChange("changed")}>
                It changed
              </button>
            </div>
            {change === "fix" && <p className="hint">Rewrites the current values; every entry using them is recalculated.</p>}
            {change === "changed" && (
              <>
                <label className="field version-date">
                  <span className="field-label">New values valid from</span>
                  <input className="text-input" type="date" value={changedFrom} min={latest?.from || undefined} onChange={(e) => setChangedFrom(e.target.value)} />
                </label>
                <p className="hint">
                  {changedFromValid
                    ? "Entries before that day keep the old values."
                    : `Pick a day after the current values started (${versionLabel(latest!.from).toLowerCase()}).`}
                </p>
              </>
            )}
          </div>
        )}
        {versions.length > 1 && (
          <details className="version-history">
            <summary>History · {versions.length} versions</summary>
            <ul>
              {[...versions].reverse().map((v, i) => (
                <li key={v.from}>
                  <span>
                    <b>{versionLabel(v.from)}</b> {Math.round(v.kcal)} kcal
                    {(["protein", "carbs", "fat"] as const).map((k) => (v[k] === undefined ? "" : ` · ${k[0].toUpperCase()} ${v[k]} g`)).join("")}
                  </span>
                  {i > 0 && (
                    <button className="icon-btn small" onClick={() => setVersions(versions.filter((x) => x !== v))} aria-label={`Remove ${versionLabel(v.from)} version`}>
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {barcode && (
        <div className="field">
          <span className="field-label">Barcode</span>
          <div className="barcode-row">
            <code>{barcode}</code>
            <button className="icon-btn small" onClick={() => setBarcode(undefined)} aria-label="Remove barcode">
              ✕
            </button>
          </div>
        </div>
      )}

      {onPublish && (
        <button className="row row-unsure" onClick={onPublish}>
          <span className="row-icon">📚</span>
          <span className="row-main">
            <span className="row-title">Publish to library</span>
            <span className="row-sub">Moves it from your items to the library; this can't be undone</span>
          </span>
        </button>
      )}
      {item.library && <p className="hint">In the library.</p>}

      {onOneOff && (
        <button className="row row-unsure" onClick={onOneOff}>
          <span className="row-icon">1×</span>
          <span className="row-main">
            <span className="row-title">It was a one-off</span>
            <span className="row-sub">Its entries keep just their calories; no item is kept</span>
          </span>
        </button>
      )}

      <div className="flow-footer">
        <button className="btn btn-primary btn-block" disabled={!name.trim() || (perServing && !servingSize && values.kcal !== undefined) || (nutritionChanged && (!change || (change === "changed" && !changedFromValid)))} onClick={save}>
          {item.provisional ? "Save as item" : "Save"}
        </button>
      </div>
    </div>
  );
}

/**
 * An unsure item is always some variant of a known item: either one that already exists
 * (its entries move there) or a new one started from the picked item's details.
 */
function KindOfPicker({
  item,
  name,
  entryCount,
  onExisting,
  onNewVariant,
  onCancel,
}: {
  item: Item;
  name: string;
  /** Undefined for a brand-new item, where picking an existing variant just opens it. */
  entryCount?: number;
  onExisting: (target: Item) => void;
  onNewVariant: (template: Item) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>();
  const known = allItems().filter((i) => i.id !== item.id && !i.provisional);
  const key = (i: Item) => i.name.trim().toLowerCase();

  if (group !== undefined) {
    const variants = known.filter((i) => key(i) === group);
    return (
      <div className="item-picker">
        <div className="picker-head">
          <strong>Which {variants[0].name}?</strong>
          <button className="link-btn" onClick={() => setGroup(undefined)}>
            Back
          </button>
        </div>
        <p className="hint">
          {entryCount === undefined
            ? "Already have it? Pick it to open it instead."
            : `Picking one moves ${entryCount === 1 ? "its entry" : `its ${entryCount} entries`} there and “${item.name}” goes away.`}
        </p>
        <ul className="list">
          {variants.map((v) => (
            <li key={v.id}>
              <button className="row" onClick={() => onExisting(v)}>
                <span className="row-main">
                  <span className="row-title">
                    <span className="badge badge-variant">{v.variant ?? "No variant"}</span>
                  </span>
                  {latestNutrition(v) && <span className="row-sub">{Math.round(latestNutrition(v)!.kcal)} kcal / {v.baseUnit === "piece" ? "piece" : `100 ${v.baseUnit}`}</span>}
                </span>
                <span className="row-chevron">›</span>
              </button>
            </li>
          ))}
          <li>
            <button className="row row-create" onClick={() => onNewVariant(variants[0])}>
              <span className="row-icon">＋</span>
              <span className="row-main">
                <span className="row-title">New variant{name && name.toLowerCase() !== group && ` “${name}”`}</span>
                <span className="row-sub">Starts from {variants[0].variant ? `the ${variants[0].variant} one` : "it"}; adjust what differs</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const names = [...new Map(known.filter((i) => !q || `${i.name} ${i.variant ?? ""}`.toLowerCase().includes(q)).map((i) => [key(i), i])).values()];

  return (
    <div className="item-picker">
      <div className="picker-head">
        <strong>{name ? `“${name}” is` : "It's"} a kind of…</strong>
        <button className="link-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="search-bar">
        <input type="search" autoFocus placeholder="Search items & recipes" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ul className="list">
        {names.map((i) => {
          const count = known.filter((k) => key(k) === key(i)).length;
          return (
            <li key={key(i)}>
              <button className="row" onClick={() => setGroup(key(i))}>
                <span className="row-icon">{itemIcon(i)}</span>
                <span className="row-main">
                  <span className="row-title">{i.name}</span>
                  <span className="row-sub">{count === 1 ? (i.variant ?? "No variants yet") : `${count} variants`}</span>
                </span>
                <span className="row-chevron">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
