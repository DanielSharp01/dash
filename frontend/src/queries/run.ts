import type { MutationOptions } from "@tanstack/react-query";
import { isConflict } from "../api/client";
import { queryClient } from "./client";

/**
 * Runs a mutation outside React. A hook's options are fixed per component, but the scope has to
 * name the row being saved, so two quick edits to one entry queue while edits to others don't.
 * The mutation lives in the cache, so its cache updates still run after the screen has closed.
 */
export function run<TData>(options: MutationOptions<TData, unknown, void, unknown>): Promise<TData> {
  const mutation = queryClient.getMutationCache().build(queryClient, queryClient.defaultMutationOptions(options));
  const done = mutation.execute();
  // Most callers close the screen and never look at the result; failures reach the toast instead.
  done.catch(() => {});
  return done;
}

/** Saves queued behind the one finishing now, in the same scope. */
const queuedBehind = (scope: string) =>
  queryClient.getMutationCache().findAll({ status: "pending", predicate: (m) => m.options.scope?.id === scope }).length > 1;

/**
 * Shows a row at once and reconciles it with the server's answer. A 409 shows the stored row the
 * server sent; any other failure puts back what was there.
 */
export function optimistic<TRow extends { revision: number }, TData>(o: {
  scope: string;
  get: () => TRow | undefined;
  /** Undefined takes the row out again, after a failed create. */
  set: (row: TRow | undefined) => void;
  next: TRow;
  /** Reads the revision to send when it runs, so a queued edit sends the one the edit before it got back. */
  send: () => Promise<TData>;
  stored: (data: TData) => TRow;
  onSuccess?: (data: TData) => void;
  onError?: () => void;
}): Promise<TData> {
  let before: TRow | undefined;
  return run<TData>({
    scope: { id: o.scope },
    onMutate: () => {
      before = o.get();
      o.set(o.next);
    },
    mutationFn: o.send,
    onSuccess: (data) => {
      const row = o.stored(data);
      const shown = o.get();
      // A later edit or delete is already on screen; keep it, with the revision the edit will need to send.
      if (!queuedBehind(o.scope)) o.set(row);
      else if (shown) o.set({ ...shown, revision: row.revision });
      o.onSuccess?.(data);
    },
    onError: (error) => {
      o.set(isConflict(error) && error.current ? (error.current as TRow) : before);
      o.onError?.();
    },
  });
}
