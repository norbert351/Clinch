CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"wallet" text,
	"deal_id" bigint,
	"amount" numeric,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"total_users" integer NOT NULL,
	"active_users_24h" integer NOT NULL,
	"total_deals" integer NOT NULL,
	"active_deals" integer NOT NULL,
	"disputed_deals" integer NOT NULL,
	"resolved_deals" integer NOT NULL,
	"total_volume" numeric NOT NULL,
	"total_fees" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_type_idx" ON "analytics_events" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_wallet_idx" ON "analytics_events" USING btree ("wallet");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_deal_id_idx" ON "analytics_events" USING btree ("deal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_wallet_created_at_idx" ON "analytics_events" USING btree ("wallet","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_snapshots_created_at_idx" ON "analytics_snapshots" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_party_a_lower_idx" ON "deals" USING btree (lower("party_a"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_party_b_lower_idx" ON "deals" USING btree (lower("party_b"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_status_idx" ON "deals" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deposits_on_chain_id_idx" ON "deposits" USING btree ("on_chain_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disputes_on_chain_id_idx" ON "disputes" USING btree ("on_chain_id");
