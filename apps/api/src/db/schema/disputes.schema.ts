import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  onChainId: bigint('on_chain_id', { mode: 'number' }).notNull(),
  raisedBy: text('raised_by').notNull(),
  reasonText: text('reason_text'),
  ruling: text('ruling'),
  ruledByWallet: text('ruled_by_wallet'),
  aiAnalysis: jsonb('ai_analysis'),
  aiRecommendedOutcome: text('ai_recommended_outcome'),
  aiConfidence: text('ai_confidence'),
  aiCreatorScore: integer('ai_creator_score'),
  aiCounterpartyScore: integer('ai_counterparty_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  ruledAt: timestamp('ruled_at'),
  resolvedAt: timestamp('resolved_at'),
});

export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;
