import { pgTable, text, timestamp, uuid, bigint, jsonb } from 'drizzle-orm/pg-core';

export const contractEvents = pgTable('contract_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  onChainId: bigint('on_chain_id', { mode: 'number' }),
  eventName: text('event_name').notNull(),
  txHash: text('tx_hash').notNull(),
  blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  indexedAt: timestamp('indexed_at').defaultNow().notNull(),
});

export type ContractEvent = typeof contractEvents.$inferSelect;
export type NewContractEvent = typeof contractEvents.$inferInsert;
