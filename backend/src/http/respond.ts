import { createHash } from "node:crypto";
import { stop } from "@danielsharp/typeline";
import type { HttpContext, HttpMetadata } from "@danielsharp/typeline-http";
import type { output, ZodType } from "zod";

export type Responded<T> = { status: number; body: T; etag?: string };

/** Like jsonResSend, for routes whose status depends on the outcome, such as an idempotent create. */
export function jsonSend<TSchema extends ZodType>(schema: TSchema, ...statuses: number[]) {
  return {
    metadata: {
      responses: statuses.map((status) => ({ status, content: { contentType: "application/json" as const, schema } })),
    } satisfies HttpMetadata,
    async mw(input: Responded<output<TSchema>>, { req, res }: HttpContext): Promise<never> {
      if (input.etag) {
        res.header("etag", input.etag);
        if (etagMatches(req.headers["if-none-match"], input.etag)) {
          res.status(304).send();
          return stop();
        }
      }
      res.status(input.status).header("content-type", "application/json; charset=utf-8").send(JSON.stringify(input.body));
      return stop();
    },
  };
}

export const ok = <T>(body: T, etag?: string): Responded<T> => (etag ? { status: 200, body, etag } : { status: 200, body });
export const created = <T>(body: T, isNew: boolean): Responded<T> => ({ status: isNew ? 201 : 200, body });

export function weakEtag(...parts: unknown[]) {
  return `W/"${createHash("sha1").update(JSON.stringify(parts)).digest("base64url")}"`;
}

function etagMatches(header: string | undefined, etag: string) {
  if (!header) return false;
  return header.split(",").some((t) => t.trim() === etag || t.trim() === "*");
}
