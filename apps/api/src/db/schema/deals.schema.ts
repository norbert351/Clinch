import { pgTable, text, timestamp, uuid, bigint, numeric, boolean } from 'drizzle-orm/pg-core';

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  onChainId: bigint('on_chain_id', { mode: 'number' }).unique().notNull(),
  partyA: text('party_a').notNull(),
  partyB: text('party_b').notNull(),
  dealType: text('deal_type').notNull(),
  status: text('status').notNull().default('Active'),
  amountA: numeric('amount_a').notNull(),
  amountB: numeric('amount_b').notNull(),
  arbitratorWallet: text('arbitrator_wallet'),
  title: text('title'),
  description: text('description'),
  aiSettlementSummary: text('ai_settlement_summary'),
  aiDisputeSummary: text('ai_dispute_summary'),
  aiSummaryGeneratedAt: timestamp('ai_summary_generated_at'),
  aiSummaryStatus: text('ai_summary_status').$type<'Pending' | 'Generated' | 'Failed'>(),
  inviteToken: text('invite_token').unique(),
  feePercent: numeric('fee_percent').notNull(),
  expiryTimestamp: timestamp('expiry_timestamp').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  partyADepositComplete: boolean('party_a_deposit_complete').notNull().default(false),
  partyBDepositComplete: boolean('party_b_deposit_complete').notNull().default(false),
  winner: text('winner'),
  winnerPayout: numeric('winner_payout'),
  platformFee: numeric('platform_fee'),
});

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
