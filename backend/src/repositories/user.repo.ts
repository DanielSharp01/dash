import type { GoogleIdentity } from "@danielsharp/auth/google";
import { eq } from "drizzle-orm";
import { usersTable } from "../db/schema";
import type { Db, Executor } from "../providers/db";

export class UserRepository {
  constructor(private db: Db) {}

  /** Signing in creates the user the first time and keeps email and name current after that. */
  async upsertFromGoogle(identity: GoogleIdentity): Promise<{ id: string }> {
    const profile = { email: identity.email ?? null, name: identity.name ?? null };
    const [user] = await this.db
      .insert(usersTable)
      .values({ googleSub: identity.sub, ...profile })
      .onConflictDoUpdate({ target: usersTable.googleSub, set: profile })
      .returning({ id: usersTable.id });
    return user!;
  }
}

export async function findUser(ex: Executor, id: string) {
  const [user] = await ex.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, id));
  return user;
}
