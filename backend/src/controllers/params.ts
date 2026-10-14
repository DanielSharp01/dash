import { zodStringify } from "@danielsharp/zod";
import { idSchema, type Preview } from "@dash/core";
import { z } from "zod";
import { ok, type Responded } from "../http/respond";
import type { WriteResult } from "../services/write";

export const idParams = z.object({ id: idSchema });

/** `?preview=true` runs the write, reports every affected day before and after, and rolls back. */
export const previewQuery = zodStringify(z.object({ preview: z.boolean().default(false) }));

/** `?batch=<id>` picks a published recipe's reference batch; the latest finished one otherwise. */
export const publishQuery = zodStringify(z.object({ batch: idSchema.optional() }));

/** `?q=` searches the shared catalogue by name, variant and brand, accents ignored. */
export const searchQuery = zodStringify(z.object({ q: z.string().trim().min(2).max(100) }));

export function written<T>(out: WriteResult<T> | { kind: "done"; result: T }): Responded<T | Preview> {
  return out.kind === "preview" ? ok(out.preview) : ok(out.result);
}
