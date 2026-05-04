import { pgTable, text, timestamp, uuid, bigint } from 'drizzle-orm/pg-core';

export const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  onChainId: bigint('on_chain_id', { mode: 'number' }).notNull(),
  raisedBy: text('raised_by').notNull(),
  reasonText: text('reason_text'),
  ruling: text('ruling'),
  ruledByWallet: text('ruled_by_wallet'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  ruledAt: timestamp('ruled_at'),
  resolvedAt: timestamp('resolved_at'),
});

export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;