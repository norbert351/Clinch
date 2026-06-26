import { pgTable, text, timestamp, uuid, numeric, integer, jsonb } from 'drizzle-orm/pg-core';

export const gatewayTransfers = pgTable('gateway_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletAddress: text('wallet_address').notNull(),
  sourceChainId: integer('source_chain_id').notNull(),
  sourceDomain: integer('source_domain').notNull(),
  sourceChainName: text('source_chain_name').notNull(),
  destinationChainId: integer('destination_chain_id').notNull(),
  destinationDomain: integer('destination_domain').notNull(),
  destinationChainName: text('destination_chain_name').notNull(),
  amount: numeric('amount').notNull(),
  status: text('status').notNull().default('initiated'),
  sourceTxHash: text('source_tx_hash'),
  gatewayTransferId: text('gateway_transfer_id'),
  timeline: jsonb('timeline').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export type GatewayTransfer = typeof gatewayTransfers.$inferSelect;
export type NewGatewayTransfer = typeof gatewayTransfers.$inferInsert;
