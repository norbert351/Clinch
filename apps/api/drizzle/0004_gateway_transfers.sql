CREATE TABLE IF NOT EXISTS "gateway_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wallet_address" text NOT NULL,
  "source_chain_id" integer NOT NULL,
  "source_domain" integer NOT NULL,
  "source_chain_name" text NOT NULL,
  "destination_chain_id" integer NOT NULL,
  "destination_domain" integer NOT NULL,
  "destination_chain_name" text NOT NULL,
  "amount" numeric NOT NULL,
  "status" text DEFAULT 'initiated' NOT NULL,
  "source_tx_hash" text,
  "gateway_transfer_id" text,
  "timeline" jsonb NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gateway_transfers_wallet_address_idx"
  ON "gateway_transfers" ("wallet_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gateway_transfers_status_idx"
  ON "gateway_transfers" ("status");
