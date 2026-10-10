import type { GoogleIdentity } from "@danielsharp/auth/google";
import { usersTable } from "../db/schema";
import type { Db } from "../providers/db";

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
