import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** One row per person; Google's subject id is the stable key, since email can change. */
export const usersTable = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  googleSub: text().notNull().unique(),
  email: text(),
  name: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
