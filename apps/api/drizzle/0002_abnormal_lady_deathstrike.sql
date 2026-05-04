ALTER TABLE "disputes" DROP CONSTRAINT "disputes_on_chain_id_unique";--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "winner_payout" numeric;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "platform_fee" numeric;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "winner" text;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "resolved_at" timestamp;