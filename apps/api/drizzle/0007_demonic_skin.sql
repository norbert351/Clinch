ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "ai_settlement_summary" text;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "ai_dispute_summary" text;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "ai_summary_generated_at" timestamp;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "ai_summary_status" text;
