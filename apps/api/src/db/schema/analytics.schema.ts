import {
  bigint,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
} from 'drizzle-orm/pg-core';

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  wallet: text('wallet'),
  dealId: bigint('deal_id', { mode: 'number' }),
  amount: numeric('amount'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  typeIdx: index('analytics_events_type_idx').on(table.type),
  walletIdx: index('analytics_events_wallet_idx').on(table.wallet),
  dealIdIdx: index('analytics_events_deal_id_idx').on(table.dealId),
  createdAtIdx: index('analytics_events_created_at_idx').on(table.createdAt),
  walletCreatedAtIdx: index('analytics_events_wallet_created_at_idx').on(table.wallet, table.createdAt),
}));

export const analyticsSnapshots = pgTable('analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  totalUsers: integer('total_users').notNull(),
  activeUsers24h: integer('active_users_24h').notNull(),
  totalDeals: integer('total_deals').notNull(),
  activeDeals: integer('active_deals').notNull(),
  disputedDeals: integer('disputed_deals').notNull(),
  resolvedDeals: integer('resolved_deals').notNull(),
  totalVolume: numeric('total_volume').notNull(),
  totalFees: numeric('total_fees').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index('analytics_snapshots_created_at_idx').on(table.createdAt),
}));

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type NewAnalyticsSnapshot = typeof analyticsSnapshots.$inferInsert;
