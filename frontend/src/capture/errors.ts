import { ApiError, isConflict, OfflineError } from "../api/client";
import { undo } from "../queries/commands.queries";
import { notify } from "./ui/notify";

export function showSaveError(error: unknown, retry: () => void) {
  if (error instanceof OfflineError) return notify("No connection, so that wasn't saved", undefined, { label: "Retry", run: retry });
  if (isConflict(error) && error.current !== undefined) return notify("Changed on another device, so this shows the latest");
  notify(error instanceof ApiError && error.reason ? `Not saved: ${error.reason}` : "Not saved, something went wrong");
}

/** A toast's undo for a command or a food save, which the server reverses as a whole. */
export const undoBy = (token: string | undefined) =>
  token
    ? () =>
        void undo(token).catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 410) notify("Too late to undo that");
          else if (isConflict(e)) notify("Can't undo, it has been edited since");
          else if (e instanceof OfflineError) notify("No connection, so nothing was undone");
          else notify("Couldn't undo that");
        })
    : undefined;
