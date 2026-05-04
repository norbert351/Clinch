import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletAddress: text('wallet_address').unique().notNull(),
  email: text('email'),
  displayName: text('display_name'),
  emailNotifications: boolean('email_notifications').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
