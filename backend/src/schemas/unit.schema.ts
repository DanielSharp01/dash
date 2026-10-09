import z from "zod";
import { createSelectSchema } from "drizzle-zod";
import { filterSchema, sortSchema } from "@danielsharp/drizzle";
import { unitsTable } from "../db/schema";
import { paginationSchema } from "./common.schema";

export const unitQuery = paginationSchema.extend({
  id: filterSchema(z.string()),
  userId: filterSchema(z.string().nullable()),
  private: filterSchema(z.boolean()),
  baseUnitId: filterSchema(z.string()),
  sorts: sortSchema(["id", "userId", "private", "baseUnitId"]),
});

export const unitSchema = createSelectSchema(unitsTable).omit({
  itemId: true,
});
