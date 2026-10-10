import { resEnd, validateBody, validateParams } from "@danielsharp/typeline-http";
import {
  meResponseSchema,
  planHistorySchema,
  potSchema,
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

  r.post("/pots", (line) =>
    line
      .pipe(validateBody(potSchema))
      .pipe(async ({ auth, body }) => {
        const { isNew, body: pot } = await settings.createPot(auth.userId, body);
        return created(pot, isNew);
      })
      .pipe(jsonSend(potSchema, 201, 200)),
  );

  r.put("/pots/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(validateBody(potSchema))
      .pipe(async ({ auth, params, body }) => ok(await settings.updatePot(auth.userId, params.id, body)))
      .pipe(jsonSend(potSchema, 200)),
  );

  r.delete("/pots/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(async ({ auth, params }) => settings.deletePot(auth.userId, params.id))
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
