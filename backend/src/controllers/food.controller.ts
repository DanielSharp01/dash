import { resEnd, validateBody, validateParams, validateQuery } from "@danielsharp/typeline-http";
import {
  createFoodRequestSchema,
  createFoodResponseSchema,
  foodSchema,
  foodsResponseSchema,
  foodResponseSchema,
  idSchema,
  previewSchema,
  saveBatchRequestSchema,
  saveBatchResponseSchema,
  storedBatchSchema,
  updateFoodRequestSchema,
  updateFoodResponseSchema,
  usageResponseSchema,
} from "@dash/core";
import { z } from "zod";
import { created, jsonSend, ok } from "../http/respond";
import { authedRouter } from "../routers";
import * as foods from "../services/food.service";
import { idParams, previewQuery, publishQuery, written } from "./params";

const batchParams = z.object({ recipeId: idSchema, batchId: idSchema });

export function foodController() {
  const r = authedRouter.use({ metadata: { tags: ["Foods"] } });

  r.get("/foods", (line) =>
    line
      .pipe(async ({ auth }) => {
        const { foods: list, etag } = await foods.listFoods(auth.userId);
        return ok({ foods: list }, etag);
      })
      .pipe(jsonSend(foodsResponseSchema, 200)),
  );

  r.get("/foods/usage", (line) =>
    line.pipe(async ({ auth }) => ok(await foods.foodUsage(auth.userId))).pipe(jsonSend(usageResponseSchema, 200)),
  );

  r.post("/foods", (line) =>
    line
      .pipe(validateBody(createFoodRequestSchema))
      .pipe(async ({ auth, body }) => {
        const { isNew, body: out } = await foods.createFood(auth.userId, body);
        return created(out, isNew);
      })
      .pipe(jsonSend(createFoodResponseSchema, 201, 200)),
  );

  r.put("/foods/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(validateQuery(previewQuery))
      .pipe(validateBody(updateFoodRequestSchema))
      .pipe(async ({ auth, params, query, body }) => {
        const out = await foods.updateFoodDoc(auth.userId, params.id, body, query.preview);
        return written(out.kind === "preview" ? out : { kind: "done", result: { ...out.result, ...out.undo! } });
      })
      .pipe(jsonSend(z.union([updateFoodResponseSchema, previewSchema]), 200)),
  );

  r.post("/foods/:id/copy", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(async ({ auth, params }) => ok(await foods.copyFood(auth.userId, params.id)))
      .pipe(jsonSend(foodResponseSchema, 200)),
  );

  r.post("/foods/:id/publish", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(validateQuery(publishQuery))
      .pipe(async ({ auth, params, query }) => ok(await foods.publishFood(auth.userId, params.id, { batch: query.batch, asNew: query.as === "new" })))
      .pipe(jsonSend(foodResponseSchema, 200)),
  );

  r.delete("/foods/:id", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(async ({ auth, params }) => foods.setFoodDeletedFor(auth.userId, params.id, true))
      .pipe(resEnd(204)),
  );

  r.post("/foods/:id/restore", (line) =>
    line
      .pipe(validateParams(idParams))
      .pipe(async ({ auth, params }) => ok(await foods.setFoodDeletedFor(auth.userId, params.id, false)))
      .pipe(jsonSend(foodSchema, 200)),
  );

  r.put("/foods/:recipeId/batches/:batchId", (line) =>
    line
      .pipe(validateParams(batchParams))
      .pipe(validateBody(saveBatchRequestSchema))
      .pipe(async ({ auth, params, body }) => ok(await foods.saveBatch(auth.userId, params.recipeId, params.batchId, body)))
      .pipe(jsonSend(saveBatchResponseSchema, 200)),
  );

  r.delete("/foods/:recipeId/batches/:batchId", (line) =>
    line
      .pipe(validateParams(batchParams))
      .pipe(async ({ auth, params }) => foods.setBatchDeleted(auth.userId, params.recipeId, params.batchId, true))
      .pipe(resEnd(204)),
  );

  r.post("/foods/:recipeId/batches/:batchId/restore", (line) =>
    line
      .pipe(validateParams(batchParams))
      .pipe(async ({ auth, params }) => ok(await foods.setBatchDeleted(auth.userId, params.recipeId, params.batchId, false)))
      .pipe(jsonSend(storedBatchSchema, 200)),
  );
}
