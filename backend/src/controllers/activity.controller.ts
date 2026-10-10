import { resEnd, validateBody, validateParams } from "@danielsharp/typeline-http";
import { activitiesResponseSchema, activityInputSchema, activitySchema, updateActivityRequestSchema } from "@dash/core";
import { created, jsonSend, ok } from "../http/respond";
import { authedRouter } from "../routers";
import * as activities from "../services/activity.service";
import { idParams } from "./params";

export function activityController() {
  const r = authedRouter.use({ metadata: { tags: ["Activities"] } });

  r.get("/activities", (line) =>
    line
      .pipe(async ({ auth }) => {
        const { activities: list, etag } = await activities.listActivities(auth.userId);
        return ok({ activities: list }, etag);
      })
      .pipe(jsonSend(activitiesResponseSchema, 200)),
  );

  r.post("/activities", (line) =>
    line
      .pipe(validateBody(activityInputSchema))
      .pipe(async ({ auth, body }) => {
        const { isNew, body: a } = await activities.createActivity(auth.userId, body);
        return created(a, isNew);
      })
      .pipe(jsonSend(activitySchema, 201, 200)),
  );

  r.put("/activities/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(validateBody(updateActivityRequestSchema))
      .pipe(async ({ auth, params, body }) => ok(await activities.updateActivityDoc(auth.userId, params.id, body)))
      .pipe(jsonSend(activitySchema, 200)),
  );

  r.delete("/activities/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(async ({ auth, params }) => activities.setActivityDeletedFor(auth.userId, params.id, true))
      .pipe(resEnd(204)),
  );

  r.post("/activities/:id/restore", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(async ({ auth, params }) => ok(await activities.setActivityDeletedFor(auth.userId, params.id, false)))
      .pipe(jsonSend(activitySchema, 200)),
  );
}
