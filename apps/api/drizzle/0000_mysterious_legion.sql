CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"email" text,
	"display_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on_chain_id" bigint NOT NULL,
	"party_a" text NOT NULL,
	"party_b" text NOT NULL,
	"deal_type" text NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"amount_a" numeric NOT NULL,
	"amount_b" numeric NOT NULL,
	"arbitrator_wallet" text,
	"title" text,
	"description" text,
	"invite_token" text,
	"fee_percent" numeric NOT NULL,
	"expiry_timestamp" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"party_a_deposit_complete" boolean DEFAULT false NOT NULL,
	"party_b_deposit_complete" boolean DEFAULT false NOT NULL,
	CONSTRAINT "deals_on_chain_id_unique" UNIQUE("on_chain_id"),
	CONSTRAINT "deals_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on_chain_id" bigint NOT NULL,
	"party" text NOT NULL,
	"amount" numeric NOT NULL,
	"tx_hash" text NOT NULL,
	"deposited_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on_chain_id" bigint NOT NULL,
	"party" text NOT NULL,
	"outcome" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on_chain_id" bigint NOT NULL,
	"raised_by" text NOT NULL,
	"reason_text" text,
	"ruling" text,
	"ruled_by_wallet" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ruled_at" timestamp,
	CONSTRAINT "disputes_on_chain_id_unique" UNIQUE("on_chain_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"on_chain_id" bigint,
	"type" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "contract_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on_chain_id" bigint,
	"event_name" text NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" bigint NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
