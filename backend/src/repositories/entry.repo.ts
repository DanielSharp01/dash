import {
  filterResolver,
  flattenColumns,
  sortResolver,
} from "@danielsharp/drizzle";
import type { Auth } from "../providers/auth";
import { filtersForColumns, type Db } from "../providers/db";
import type { Entry, EntryQuery, EntryRequest } from "../schemas/entry.schema";
import { entriesTable, itemsTable, unitsTable } from "../db/schema";
import { and, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export class EntryRepository {
  constructor(private db: Db) {}

  async list(
    { sorts, offset, limit, ...filters }: EntryQuery,
    auth: Auth,
  ): Promise<{
    items: Entry[];
    total: number;
  }> {
    const whereSql = and(
      sql`${entriesTable.userId}=${auth.userId}`,
      ...filterResolver(
        filtersForColumns({
          id: entriesTable.id.getSQL(),
          userId: entriesTable.userId.getSQL(),
          itemId: entriesTable.itemId.getSQL(),
          "item.type": itemsTable.type.getSQL(),
          entryDate: entriesTable.entryDate.getSQL(),
        }),
      ).filters(filters as any), // TODO: Fix type,
    );
    const orderBys = sortResolver({
      id: entriesTable.id.getSQL(),
      itemId: entriesTable.itemId.getSQL(),
      "item.type": itemsTable.type.getSQL(),
      entryDate: entriesTable.entryDate.getSQL(),
    }).sorts(sorts);

    const count =
      (
        await this.db
          .select({ count: sql<number>`count(*)` })
          .from(entriesTable)
          .innerJoin(itemsTable, sql`${entriesTable.itemId}=${itemsTable.id}`)
          .where(whereSql)
      )?.[0]?.count ?? 0;

    if (count === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    const entries = await this.db
      .select({
        entry: entriesTable,
        item: itemsTable,
      })
      .from(entriesTable)
      .innerJoin(itemsTable, sql`${itemsTable.id}=${entriesTable.itemId}`)
      .where(whereSql)
      .orderBy(...(orderBys as any[])) // TODO: Fix type
      .offset(offset)
      .limit(limit);

    const itemUnits = await this.db
      .select()
      .from(unitsTable)
      .where(
        sql`${unitsTable.itemId} IN (${sql.join(
          entries.map((entry) => entry.item.id),
          ",",
        )})`,
      );

    const entriesMapped = entries.map(({ entry, item }) => ({
      ...entry,
      item: {
        ...item,
        units: itemUnits.filter((unit) => unit.itemId === item.id),
      },
    }));

    return {
      items: entriesMapped,
      total: count,
    };
  }

  async get(id: string, auth: Auth): Promise<Entry | null> {
    const entries = await this.db
      .select({
        entry: entriesTable,
        item: itemsTable,
        itemUnit: unitsTable,
      })
      .from(entriesTable)
      .innerJoin(itemsTable, sql`${itemsTable.id}=${entriesTable.itemId}`)
      .leftJoin(unitsTable, sql`${unitsTable.itemId}=${itemsTable.id}`)
      .where(
        and(
          sql`${entriesTable.id}=${id}`,
          sql`${entriesTable.userId}=${auth.userId}`,
        ),
      );

    if (entries.length === 0) {
      return null;
    }

    const entry = entries[0]!.entry;
    const item = entries[0]!.item;
    const itemUnits = entries.map((x) => x.itemUnit).filter((x) => x !== null);

    return {
      ...entry,
      item: {
        ...item,
        units: itemUnits,
      },
    };
  }

  async create(entry: EntryRequest, auth: Auth): Promise<Entry> {
    const creatable = {
      id: randomUUID(),
      userId: auth.userId,
      ...entry,
    };

    await this.db.insert(entriesTable).values(creatable);
    return creatable;
  }
}
