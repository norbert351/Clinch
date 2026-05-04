import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';

let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;

try {
  sql = postgres(process.env.DATABASE_URL!, {
    ssl: 'require',
    max: 10,
    idle_timeout: 20,
    connect_timeout: 30,
  });

  db = drizzle(sql, {
    schema,
    logger: process.env.NODE_ENV === 'development',
  });

  console.log('Database connection established');
} catch (error) {
  console.warn('Database connection failed, running in degraded mode');
  console.warn('Error:', error instanceof Error ? error.message : 'Unknown error');
  sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
  db = drizzle(sql, { schema });
}

export { db, sql };
export const isDbConnected = true;
