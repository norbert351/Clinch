import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { deals } from './deals.schema';

export type MessageSenderRole =
  | 'creator'
  | 'counterparty'
  | 'client'
  | 'worker'
  | 'arbitrator'
  | 'system';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  onChainId: bigint('on_chain_id', { mode: 'number' })
    .notNull()
    .references(() => deals.onChainId, { onDelete: 'cascade' }),
  senderAddress: text('sender_address').notNull(),
  senderRole: text('sender_role').$type<MessageSenderRole>().notNull(),
  content: varchar('content', { length: 1000 }).notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  editedAt: timestamp('edited_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  dealCreatedAtIdx: index('messages_deal_created_at_idx').on(table.onChainId, table.createdAt),
  dealDeletedAtIdx: index('messages_deal_deleted_at_idx').on(table.onChainId, table.deletedAt),
  senderIdx: index('messages_sender_idx').on(table.senderAddress),
  searchIdx: index('messages_deal_content_idx').on(table.onChainId, table.content),
}));

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
