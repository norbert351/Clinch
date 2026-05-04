import { db } from '../../config/db';
import { users, deals } from '../../db/schema';
import { eq, or } from 'drizzle-orm';
import { User } from '../../db/schema';

export interface UpdateUserInput {
  email?: string;
  displayName?: string;
  emailNotifications?: boolean;
}

export async function getUserByAddress(address: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.walletAddress, address.toLowerCase()),
  });
  return user || null;
}

export async function updateUser(
  address: string,
  input: UpdateUserInput
): Promise<User | null> {
  const [updated] = await db
    .update(users)
    .set(input)
    .where(eq(users.walletAddress, address.toLowerCase()))
    .returning();

  return updated || null;
}

export async function getUserDeals(address: string) {
  const userDeals = await db
    .select()
    .from(deals)
    .where(
      or(
        eq(deals.partyA, address.toLowerCase()),
        eq(deals.partyB, address.toLowerCase())
      )
    )
    .orderBy(deals.createdAt);

  return userDeals;
}
