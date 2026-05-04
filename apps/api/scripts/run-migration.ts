import { db } from '../src/config/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  try {
    console.log('Adding missing columns...');
    await db.execute(sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS winner TEXT`);
    await db.execute(sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS winner_payout numeric`);
    await db.execute(sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS platform_fee numeric`);
    await db.execute(sql`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS resolved_at timestamp`);
    await db.execute(sql`ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_on_chain_id_unique`);
    console.log('Migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();