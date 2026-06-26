import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { deals } from './deals.schema';
import { messages } from './messages.schema';

export const messageReads = pgTable('message_reads', {
  id: uuid('id').primaryKey().defaultRandom(),
  onChainId: bigint('on_chain_id', { mode: 'number' })
    .notNull()
    .references(() => deals.onChainId, { onDelete: 'cascade' }),
  walletAddress: text('wallet_address').notNull(),
  lastReadMessageId: uuid('last_read_message_id').references(() => messages.id, {
    onDelete: 'set null',
  }),
  lastReadAt: timestamp('last_read_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniqueDealWallet: unique().on(table.onChainId, table.walletAddress),
  dealIdx: index('message_reads_deal_idx').on(table.onChainId),
  walletIdx: index('message_reads_wallet_idx').on(table.walletAddress),
  lastReadMessageIdx: index('message_reads_last_read_message_idx').on(table.lastReadMessageId),
}));

export type MessageRead = typeof messageReads.$inferSelect;
export type NewMessageRead = typeof messageReads.$inferInsert;
