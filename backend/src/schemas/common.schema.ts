import z, { ZodType } from "zod";

export const paginationSchema = z.object({
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(10),
});

export const listResponse = <Z extends ZodType<any, any, any>>(schema: Z) =>
  z.object({
    items: z.array(schema),
    total: z.number().int().min(0),
  });
