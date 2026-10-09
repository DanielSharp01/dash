import { zodStringify } from "@danielsharp/zod";
import { filterSchema, sortSchema } from "@danielsharp/drizzle";
import { createSelectSchema } from "drizzle-zod";
import z from "zod";
import { entriesTable } from "../db/schema";
import { itemRequest, itemSchema } from "./item.schema";
import { paginationSchema } from "./common.schema";

export const entryQuery = paginationSchema.extend({
  id: filterSchema(z.string()),
  itemId: filterSchema(z.string()),
  "item.type": filterSchema(z.enum(["food", "drink", "exercise"])),
  entryDate: filterSchema(z.date()),
  sorts: sortSchema(["id", "itemId", "item.type", "entryDate"]),
});

export type EntryQuery = z.output<typeof entryQuery>;

export const entrySchema = createSelectSchema(entriesTable)
  .omit({
    userId: true,
  })
  .extend({
    item: itemSchema,
  });

export type Entry = z.output<typeof entrySchema>;

export const entryRequest = createSelectSchema(entriesTable)
  .omit({
    id: true,
    userId: true,
  })
  .extend({
    item: z.union([itemSchema.pick({ id: true }), itemRequest]),
  });

export type EntryRequest = z.output<typeof entryRequest>;
