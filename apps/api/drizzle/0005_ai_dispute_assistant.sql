ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "ai_analysis" jsonb;
--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "ai_recommended_outcome" text;
--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "ai_confidence" text;
--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "ai_creator_score" integer;
--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN IF NOT EXISTS "ai_counterparty_score" integer;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "ai_summary" text;
