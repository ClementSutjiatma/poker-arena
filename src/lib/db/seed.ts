import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { tableConfigs } from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = postgres(connectionString, { prepare: false });
const db = drizzle(client);

async function seed() {
  console.log('Seeding table_configs...');
  await db
    .insert(tableConfigs)
    .values([
      { id: 'micro', name: 'Micro Stakes', smallBlind: 1, bigBlind: 2, minBuyIn: 40, maxBuyIn: 200, maxSeats: 6 },
      { id: 'low', name: 'Low Stakes', smallBlind: 5, bigBlind: 10, minBuyIn: 200, maxBuyIn: 1000, maxSeats: 6 },
      { id: 'mid', name: 'Mid Stakes', smallBlind: 25, bigBlind: 50, minBuyIn: 1000, maxBuyIn: 5000, maxSeats: 6 },
      { id: 'high', name: 'High Rollers', smallBlind: 100, bigBlind: 200, minBuyIn: 4000, maxBuyIn: 20000, maxSeats: 6 },
    ])
    .onConflictDoNothing();
  console.log('Done! 4 table configs seeded.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
