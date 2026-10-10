import { BadRequest, Conflict, Forbidden, NotFound, UnprocessableEntity } from "@danielsharp/typeline-http";

export const notFound = () => new NotFound();
export const readOnly = () => new Forbidden({ reason: "Public items are read-only" });
export const unprocessable = (reason: string, details: Record<string, unknown> = {}) => new UnprocessableEntity({ reason, ...details });

/** The body names the row too; a mismatch with the path is a client bug, not a second row. */
export function sameId(pathId: string, bodyId: string) {
  if (pathId !== bodyId) throw new BadRequest({ reason: "The id in the body doesn't match the path" });
}

/** A save must send the revision it read; `current` lets the client reload without another request. */
export function expectRevision(stored: number, sent: number, current: () => Promise<unknown>) {
  if (stored === sent) return Promise.resolve();
  return current().then((c) => {
    throw new Conflict({ reason: "Changed since it was read", current: c });
  });
}

type Owned = { userId: string | null } | undefined;

/**
 * What a create finds under its id: nothing, the person's own row (a retry, answered with what
 * is stored), or someone else's row.
 */
export function claimId(row: Owned, userId: string): "new" | "retry" {
  if (!row) return "new";
  if (row.userId === userId) return "retry";
  throw new Conflict({ reason: "The id is taken" });
}

/** A row the person may change: their own, never a public one, and a foreign one doesn't exist for them. */
export function writable<T extends { userId: string | null }>(row: T | undefined, userId: string): T {
  if (!row || (row.userId !== null && row.userId !== userId)) throw notFound();
  if (row.userId === null) throw readOnly();
  return row;
}

/** A row the person may read or refer to: their own or a public one. */
export function visible<T extends { userId: string | null }>(row: T | undefined, userId: string): T {
  if (!row || (row.userId !== null && row.userId !== userId)) throw notFound();
  return row;
}
