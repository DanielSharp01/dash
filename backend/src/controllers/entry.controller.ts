import { zodStringify } from "@danielsharp/zod";
import { resEnd, validateBody, validateParams, validateQuery } from "@danielsharp/typeline-http";
import {
  createEntryRequestSchema,
  entriesQuerySchema,
  entriesResponseSchema,
  entryResponseSchema,
  entrySchema,
  followUpResponseSchema,
  updateEntryRequestSchema,
} from "@dash/core";
import { created, jsonSend, ok } from "../http/respond";
import { authedRouter } from "../routers";
import * as entries from "../services/entry.service";
import { followUp } from "../services/followUp.service";
import { idParams } from "./params";

export function entryController() {
  const r = authedRouter.use({ metadata: { tags: ["Entries"] } });

  r.get("/entries", (line) =>
    line
      .pipe(validateQuery(zodStringify(entriesQuerySchema)))
      .pipe(async ({ auth, query }) => ok(await entries.listEntries(auth.userId, query)))
      .pipe(jsonSend(entriesResponseSchema, 200)),
  );

  r.post("/entries", (line) =>
    line
      .pipe(validateBody(createEntryRequestSchema))
      .pipe(async ({ auth, body }) => {
        const { isNew, body: out } = await entries.createEntry(auth.userId, body);
        return created(out, isNew);
      })
      .pipe(jsonSend(entryResponseSchema, 201, 200)),
  );

  r.put("/entries/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(validateBody(updateEntryRequestSchema))
      .pipe(async ({ auth, params, body }) => ok(await entries.updateEntryDoc(auth.userId, params.id, body)))
      .pipe(jsonSend(entryResponseSchema, 200)),
  );

  r.delete("/entries/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(async ({ auth, params }) => entries.setEntryDeletedFor(auth.userId, params.id, true))
      .pipe(resEnd(204)),
  );

  r.post("/entries/:id/restore", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(async ({ auth, params }) => ok(await entries.setEntryDeletedFor(auth.userId, params.id, false)))
      .pipe(jsonSend(entrySchema, 200)),
  );

  r.get("/follow-up", (line) =>
    line.pipe(async ({ auth }) => ok(await followUp(auth.userId))).pipe(jsonSend(followUpResponseSchema, 200)),
  );
}
