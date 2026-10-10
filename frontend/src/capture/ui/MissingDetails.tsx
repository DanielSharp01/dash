import type { DailyTargets } from "@dash/core";
import { useOpen } from "./useSteps";

/** Weight comes from weigh-ins; height and age live in Settings. */
export function MissingDetails({ missing, lead }: { missing: DailyTargets["missing"]; lead: string }) {
  const open = useOpen();
  if (!missing.length) return null;
  const inSettings = missing.filter((m) => m !== "weight");
  const list = (words: string[]) => words.join(", ").replace(/, ([^,]*)$/, " and $1");

  return (
    <div className="notice">
      <span>
        {lead} {list(missing)}.{" "}
        {missing.includes("weight") && (
          <button className="link" onClick={() => open("/weigh-ins")}>
            Add a weigh-in
          </button>
        )}
        {missing.includes("weight") && inSettings.length > 0 && " · "}
        {inSettings.length > 0 && (
          <button className="link" onClick={() => open("/settings")}>
            Add {list(inSettings)} in Settings
          </button>
        )}
      </span>
    </div>
  );
}
