import { validateBody, validateParams } from "@danielsharp/typeline-http";
import {
  commandResultSchema,
  completeAsComboRequestSchema,
  mergeRequestSchema,
  moveToBatchRequestSchema,
  previewSchema,
  reconvertRequestSchema,
  undoResponseSchema,
} from "@dash/core";
import { z } from "zod";
import { jsonSend, ok } from "../http/respond";
import { authedRouter } from "../routers";
import * as commands from "../services/command.service";
import { undo } from "../services/undo.service";
import { idParams, previewQuery, written } from "./params";
import { validateQuery } from "@danielsharp/typeline-http";

const commandResponse = z.union([commandResultSchema, previewSchema]);

export function commandController() {
  const r = authedRouter.use({ metadata: { tags: ["Commands"] } });

  r.post("/foods/:id/merge", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(validateQuery(previewQuery))
      .pipe(validateBody(mergeRequestSchema))
      .pipe(async ({ auth, params, query, body }) => written(await commands.merge(auth.userId, params.id, body.targetId, query.preview)))
      .pipe(jsonSend(commandResponse, 200)),
  );

  r.post("/foods/:id/complete-as-combo", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(validateQuery(previewQuery))
      .pipe(validateBody(completeAsComboRequestSchema))
      .pipe(async ({ auth, params, query, body }) => written(await commands.completeAsCombo(auth.userId, params.id, body, query.preview)))
      .pipe(jsonSend(commandResponse, 200)),
  );

  r.post("/entries/reconvert", (line) =>
    line
      .pipe(validateQuery(previewQuery))
      .pipe(validateBody(reconvertRequestSchema))
      .pipe(async ({ auth, query, body }) => written(await commands.reconvert(auth.userId, body.lineIds, query.preview)))
      .pipe(jsonSend(commandResponse, 200)),
  );

  r.post("/entries/move-to-batch", (line) =>
    line
      .pipe(validateQuery(previewQuery))
      .pipe(validateBody(moveToBatchRequestSchema))
      .pipe(async ({ auth, query, body }) => written(await commands.moveToBatch(auth.userId, body.lineIds, body.batchId, query.preview)))
      .pipe(jsonSend(commandResponse, 200)),
  );

  r.post("/undo/:token", (line) =>
    line
      .pipe(validateParams(z.object({ token: z.uuid() })))
      .pipe(async ({ auth, params }) => ok(await undo(auth.userId, params.token)))
      .pipe(jsonSend(undoResponseSchema, 200)),
  );
}
