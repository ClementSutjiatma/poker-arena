import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY are required');
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('Seeding table_configs...');

  const { error } = await db.from('table_configs').upsert(
    [
      { id: 'micro', name: 'Micro Stakes', small_blind: 1, big_blind: 2, min_buy_in: 40, max_buy_in: 200, max_seats: 6 },
      { id: 'low', name: 'Low Stakes', small_blind: 5, big_blind: 10, min_buy_in: 200, max_buy_in: 1000, max_seats: 6 },
      { id: 'mid', name: 'Mid Stakes', small_blind: 25, big_blind: 50, min_buy_in: 1000, max_buy_in: 5000, max_seats: 6 },
      { id: 'high', name: 'High Rollers', small_blind: 100, big_blind: 200, min_buy_in: 4000, max_buy_in: 20000, max_seats: 6 },
    ],
    { onConflict: 'id', ignoreDuplicates: true },
  );

  if (error) throw error;
  console.log('Done! 4 table configs seeded.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
