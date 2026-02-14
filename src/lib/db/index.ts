import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

// Lazy initialization: only connect when DATABASE_URL is set.
// This allows the app to run without a DB (in-memory only) during development.
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  if (!connectionString) {
    console.warn('[db] DATABASE_URL not set — persistence disabled');
    return null;
  }

  const client = postgres(connectionString, {
    prepare: false, // Required for Supabase Transaction Mode (pgBouncer)
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  _db = drizzle(client, { schema });
  return _db;
}

export type Database = NonNullable<ReturnType<typeof getDb>>;
