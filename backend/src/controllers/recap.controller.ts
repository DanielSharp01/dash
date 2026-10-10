import { zodStringify } from "@danielsharp/zod";
import { resEnd, validateBody, validateQuery } from "@danielsharp/typeline-http";
import { dayRecapSchema, recapQuerySchema, recapSeenRequestSchema, recapSeenResponseSchema } from "@dash/core";
import { jsonSend, ok } from "../http/respond";
import { authedRouter } from "../routers";
import * as recap from "../services/recap.service";

export function recapController() {
  const r = authedRouter.use({ metadata: { tags: ["Recap"] } });

  r.get("/recap", (line) =>
    line
      .pipe(validateQuery(zodStringify(recapQuerySchema)))
      .pipe(async ({ auth, query }) => ok(await recap.recap(auth.userId, query.day)))
      .pipe(jsonSend(dayRecapSchema, 200)),
  );

  r.post("/recap/seen", (line) =>
    line
      .pipe(validateBody(recapSeenRequestSchema))
      .pipe(async ({ auth, body }) => ok(await recap.markSeen(auth.userId, body.day)))
      .pipe(jsonSend(recapSeenResponseSchema, 200)),
  );

  /** Lets yesterday's recap play again; only the dev tools ask for it. */
  r.delete("/recap/seen", (line) => line.pipe(async ({ auth }) => recap.clearSeen(auth.userId)).pipe(resEnd(204)));
}
