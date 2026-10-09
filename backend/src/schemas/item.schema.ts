import z from "zod";
import { createSelectSchema } from "drizzle-zod";
import { filterSchema, sortSchema } from "@danielsharp/drizzle";
import { itemsTable } from "../db/schema";
import { unitSchema } from "./unit.schema";
import { paginationSchema } from "./common.schema";

export const itemQuery = paginationSchema.extend({
  id: filterSchema(z.string()),
  userId: filterSchema(z.string().nullable()),
  private: filterSchema(z.boolean()),
  name: filterSchema(z.string()),
  baseUnitId: filterSchema(z.string()),
  sorts: sortSchema(["id", "userId", "private", "name", "baseUnitId"]),
});

export const itemSchema = createSelectSchema(itemsTable).extend({
  units: unitSchema.array(),
});

export const itemRequest = itemSchema
  .omit({
    id: true,
    userId: true,
    oneTime: true,
  })
  .extend({
    units: unitSchema.partial({ id: true }).array(),
  });
