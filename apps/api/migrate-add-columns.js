import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

async function run() {
  try {
    console.log('Adding party_a_deposit_complete...');
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS party_a_deposit_complete BOOLEAN NOT NULL DEFAULT false`;
    console.log('Done: party_a_deposit_complete');
    
    console.log('Adding party_b_deposit_complete...');
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS party_b_deposit_complete BOOLEAN NOT NULL DEFAULT false`;
    console.log('Done: party_b_deposit_complete');
    
    console.log('Migration successful');
  } catch (e) {
    console.error('Migration error:', e);
  } finally {
    await sql.end();
  }
}

run();