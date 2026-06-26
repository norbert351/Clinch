CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on_chain_id" bigint NOT NULL,
	"sender_address" text NOT NULL,
	"sender_role" text NOT NULL,
	"content" varchar(1000) NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on_chain_id" bigint NOT NULL,
	"wallet_address" text NOT NULL,
	"last_read_message_id" uuid,
	"last_read_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_reads_on_chain_id_wallet_address_unique" UNIQUE("on_chain_id","wallet_address")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_on_chain_id_deals_on_chain_id_fk" FOREIGN KEY ("on_chain_id") REFERENCES "public"."deals"("on_chain_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_on_chain_id_deals_on_chain_id_fk" FOREIGN KEY ("on_chain_id") REFERENCES "public"."deals"("on_chain_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_deal_created_at_idx" ON "messages" USING btree ("on_chain_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_deal_deleted_at_idx" ON "messages" USING btree ("on_chain_id","deleted_at");--> statement-breakpoint
CREATE INDEX "messages_sender_idx" ON "messages" USING btree ("sender_address");--> statement-breakpoint
CREATE INDEX "messages_deal_content_idx" ON "messages" USING btree ("on_chain_id","content");--> statement-breakpoint
CREATE INDEX "message_reads_deal_idx" ON "message_reads" USING btree ("on_chain_id");--> statement-breakpoint
CREATE INDEX "message_reads_wallet_idx" ON "message_reads" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "message_reads_last_read_message_idx" ON "message_reads" USING btree ("last_read_message_id");