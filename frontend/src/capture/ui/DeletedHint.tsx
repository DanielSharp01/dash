import { displayName, type Food } from "@dash/core";
import { restoreFood } from "../../queries/foods.queries";

export function DeletedHint({ gone, advice }: { gone: Food[]; advice: string }) {
  if (!gone.length) return null;
  return (
    <p className="hint warn-hint">
      {gone.map(displayName).join(", ")} {gone.length === 1 ? "was" : "were"} deleted. {advice}{" "}
      {gone.map((f) => (
        <button key={f.id} className="link-btn" onClick={() => void restoreFood(f.id)}>
          Restore {gone.length === 1 ? "it" : displayName(f)}
        </button>
      ))}
    </p>
  );
}
