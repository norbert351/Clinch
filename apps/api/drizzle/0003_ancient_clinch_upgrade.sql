ALTER TABLE "notifications" ADD COLUMN "title" text DEFAULT '' NOT NULL;
ALTER TABLE "notifications" ADD COLUMN "message" text DEFAULT '' NOT NULL;
ALTER TABLE "notifications" ADD COLUMN "metadata" jsonb;
ALTER TABLE "notifications" ADD COLUMN "read" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN "email_notifications" boolean DEFAULT true NOT NULL;
