import type { DailyTargets } from "@dash/core";
import { useOpen } from "./useSteps";

/** Weight, height and age are all asked for in the goal setup, which starts at whichever is missing. */
export function MissingDetails({ missing, lead }: { missing: DailyTargets["missing"]; lead: string }) {
  const open = useOpen();
  if (!missing.length) return null;
  const list = missing.join(", ").replace(/, ([^,]*)$/, " and $1");

  return (
    <div className="notice">
      <span>
        {lead} {list}.{" "}
        <button className="link" onClick={() => open("/goal/setup")}>
          Set up your goals
        </button>
      </span>
    </div>
  );
}
