import { pgTable, text, timestamp, uuid, bigint, numeric } from 'drizzle-orm/pg-core';

export const deposits = pgTable('deposits', {
  id: uuid('id').primaryKey().defaultRandom(),
  onChainId: bigint('on_chain_id', { mode: 'number' }).notNull(),
  party: text('party').notNull(),
  amount: numeric('amount').notNull(),
  txHash: text('tx_hash').notNull().unique(),
  depositedAt: timestamp('deposited_at').defaultNow().notNull(),
});

export type Deposit = typeof deposits.$inferSelect;
export type NewDeposit = typeof deposits.$inferInsert;
