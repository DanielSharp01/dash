import type { Contents } from "@dash/core";

export const macroMeta = [
  { key: "protein", label: "Protein", short: "P" },
  { key: "carbs", label: "Carbs", short: "C" },
  { key: "fat", label: "Fat", short: "F" },
] as const;

export function MiniMacros({ contents, className = "" }: { contents: Contents; className?: string }) {
  return (
    <span className={`entry-macros ${className}`}>
      {macroMeta.map((m) => {
        const v = contents[m.key];
        const has = v && (v.complete || v.value > 0);
        return (
          <span key={m.key} className={`mini-macro macro-${m.key}`} title={m.label}>
            <i aria-hidden /> {m.short} {has ? `${v.complete ? "" : "≥"}${Math.round(v.value)}` : "?"} g
          </span>
        );
      })}
    </span>
  );
}
