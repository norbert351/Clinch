const dotenv = require('dotenv');
const postgres = require('postgres');

dotenv.config();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const sql = postgres(process.env.DATABASE_URL, {
    ssl: 'require',
  });

  try {
    await sql`
      ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "ai_settlement_summary" text
    `;
    await sql`
      ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "ai_dispute_summary" text
    `;
    await sql`
      ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "ai_summary_generated_at" timestamp
    `;
    await sql`
      ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "ai_summary_status" text
    `;

    await sql.unsafe(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'deals'
            AND column_name = 'ai_summary'
        ) THEN
          UPDATE "deals"
          SET "ai_settlement_summary" = COALESCE("ai_settlement_summary", "ai_summary")
          WHERE "ai_settlement_summary" IS NULL
            AND "ai_summary" IS NOT NULL;
        END IF;
      END
      $$;
    `);

    console.log('Deal AI columns repaired successfully');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('Deal AI column repair failed:', error);
  process.exitCode = 1;
});
