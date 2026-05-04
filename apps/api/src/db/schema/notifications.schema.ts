import { pgTable, text, timestamp, uuid, bigint, boolean, jsonb } from 'drizzle-orm/pg-core';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletAddress: text('wallet_address').notNull(),
  onChainId: bigint('on_chain_id', { mode: 'number' }),
  type: text('type').notNull(),
  title: text('title').notNull().default(''),
  message: text('message').notNull().default(''),
  metadata: jsonb('metadata'),
  read: boolean('read').default(false).notNull(),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  readAt: timestamp('read_at'),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
