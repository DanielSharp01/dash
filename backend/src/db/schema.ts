import { boolean, text, timestamp } from "drizzle-orm/pg-core";
import { foreignKey } from "drizzle-orm/pg-core";
import { uuid } from "drizzle-orm/pg-core";
import { pgTable, pgEnum, integer } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid().primaryKey(),
  googleId: integer().unique(),
});

export const itemTypeEnum = pgEnum("item_type", ["food", "drink", "exercise"]);

export const itemsTable = pgTable(
  "items",
  {
    id: uuid().primaryKey(),
    type: itemTypeEnum().notNull(),
    userId: uuid(),
    private: boolean().notNull(),
    oneTime: boolean().notNull(),
    name: text().notNull(),
    calories: integer().notNull(),
    fat: integer().notNull(),
    protein: integer().notNull(),
    carbs: integer().notNull(),
    baseUnitId: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }),
    0,
  ],
);

export const unitsTable = pgTable(
  "units",
  {
    id: text().primaryKey(),
    itemId: uuid(),
    userId: uuid(),
    private: boolean().notNull(),
    baseUnitId: text(),
    multiplier: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [itemsTable.id],
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }),
    foreignKey({
      columns: [table.baseUnitId],
      foreignColumns: [table.id],
    }),
    foreignKey({
      columns: [itemsTable.baseUnitId],
      foreignColumns: [table.id],
    }),
  ],
);

export const entriesTable = pgTable(
  "entries",
  {
    id: uuid().primaryKey(),
    userId: uuid().notNull(),
    itemId: uuid().notNull(),
    entryDate: timestamp().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [itemsTable.id],
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }),
  ],
);

export const entryMeasurementsTable = pgTable(
  "entry_measurements",
  {
    id: uuid().primaryKey(),
    entryId: uuid().notNull(),
    unitId: text().notNull(),
    quantity: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.entryId],
      foreignColumns: [entriesTable.id],
    }),
    foreignKey({
      columns: [table.unitId],
      foreignColumns: [unitsTable.id],
    }),
  ],
);
