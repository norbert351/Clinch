import { pgTable, text, timestamp, uuid, bigint, unique } from 'drizzle-orm/pg-core';

export const votes = pgTable('votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  onChainId: bigint('on_chain_id', { mode: 'number' }).notNull(),
  party: text('party').notNull(),
  outcome: text('outcome').notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
}, (table) => ({
  uniqueVote: unique().on(table.onChainId, table.party),
}));

export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;