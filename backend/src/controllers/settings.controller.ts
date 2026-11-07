import { resEnd, validateBody, validateParams } from "@danielsharp/typeline-http";
import {
  containerSchema,
  meResponseSchema,
  planHistorySchema,
  profileSchema,
  savePlanRequestSchema,
  updateProfileRequestSchema,
  weighInSchema,
  weighInsResponseSchema,
} from "@dash/core";
import { created, jsonSend, ok } from "../http/respond";
import { authedRouter } from "../routers";
import * as settings from "../services/settings.service";
import { idParams } from "./params";

export function settingsController() {
  const r = authedRouter.use({ metadata: { tags: ["Settings"] } });

  r.get("/me", (line) =>
    line.pipe(async ({ auth }) => ok(await settings.me(auth.userId))).pipe(jsonSend(meResponseSchema, 200)),
  );

  r.post("/setup/offered", (line) => line.pipe(async ({ auth }) => settings.markSetupOffered(auth.userId)).pipe(resEnd(204)));

  r.put("/profile", (line) =>
    line
      .pipe(validateBody(updateProfileRequestSchema))
      .pipe(async ({ auth, body }) => ok(await settings.saveProfile(auth.userId, body)))
      .pipe(jsonSend(profileSchema, 200)),
  );

  r.post("/plan", (line) =>
    line
      .pipe(validateBody(savePlanRequestSchema))
      .pipe(async ({ auth, body }) => ok(await settings.savePlan(auth.userId, body)))
      .pipe(jsonSend(planHistorySchema, 200)),
  );

  r.post("/containers", (line) =>
    line
      .pipe(validateBody(containerSchema))
      .pipe(async ({ auth, body }) => {
        const { isNew, body: container } = await settings.createContainer(auth.userId, body);
        return created(container, isNew);
      })
      .pipe(jsonSend(containerSchema, 201, 200)),
  );

  r.put("/containers/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(validateBody(containerSchema))
      .pipe(async ({ auth, params, body }) => ok(await settings.updateContainer(auth.userId, params.id, body)))
      .pipe(jsonSend(containerSchema, 200)),
  );

  r.delete("/containers/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(async ({ auth, params }) => settings.deleteContainer(auth.userId, params.id))
      .pipe(resEnd(204)),
  );

  r.get("/weigh-ins", (line) =>
    line.pipe(async ({ auth }) => ok(await settings.weighIns(auth.userId))).pipe(jsonSend(weighInsResponseSchema, 200)),
  );

  r.post("/weigh-ins", (line) =>
    line
      .pipe(validateBody(weighInSchema))
      .pipe(async ({ auth, body }) => {
        const { isNew, body: w } = await settings.addWeighIn(auth.userId, body);
        return created(w, isNew);
      })
      .pipe(jsonSend(weighInSchema, 201, 200)),
  );

  r.delete("/weigh-ins/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(async ({ auth, params }) => settings.deleteWeighIn(auth.userId, params.id))
      .pipe(resEnd(204)),
  );
}
