import { zodStringify } from "@danielsharp/zod";
import { idSchema, type Preview } from "@dash/core";
import { z } from "zod";
import { ok, type Responded } from "../http/respond";
import type { WriteResult } from "../services/write";

export const idParams = z.object({ id: idSchema });

/** `?preview=true` runs the write, reports every affected day before and after, and rolls back. */
export const previewQuery = zodStringify(z.object({ preview: z.boolean().default(false) }));

export function written<T>(out: WriteResult<T> | { kind: "done"; result: T }): Responded<T | Preview> {
  return out.kind === "preview" ? ok(out.preview) : ok(out.result);
}
