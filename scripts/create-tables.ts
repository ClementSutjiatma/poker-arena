/**
 * Creates the 4 default poker tables on the deployed PokerEscrow contract
 * using the Privy server wallet (the contract owner).
 *
 * Usage:
 *   npx tsx scripts/create-tables.ts
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET,
 *   PRIVY_SERVER_WALLET_ID, NEXT_PUBLIC_ESCROW_CONTRACT
 */

import { PrivyClient } from '@privy-io/node';
import { encodeFunctionData, keccak256, toHex } from 'viem';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_FILE = resolve(ROOT, '.env.local');

// ABI for createTable only
const CREATE_TABLE_ABI = [
  {
    type: 'function' as const,
    name: 'createTable' as const,
    inputs: [
      { name: 'tableId', type: 'bytes32' as const },
      { name: 'minBuyIn', type: 'uint256' as const },
      { name: 'maxBuyIn', type: 'uint256' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
] as const;

// The 4 default tables (amounts in 6-decimal aUSD token units)
const TABLES = [
  { name: 'micro', minBuyIn: 40_000000n, maxBuyIn: 200_000000n },
  { name: 'low', minBuyIn: 200_000000n, maxBuyIn: 1000_000000n },
  { name: 'mid', minBuyIn: 1000_000000n, maxBuyIn: 5000_000000n },
  { name: 'high', minBuyIn: 4000_000000n, maxBuyIn: 20000_000000n },
];

const TEMPO_CHAIN_ID = 42431;

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) {
    console.error('ERROR: .env.local not found');
    process.exit(1);
  }
  for (const line of readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

async function main() {
  const env = loadEnv();

  const appId = env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = env.PRIVY_APP_SECRET;
  const walletId = env.PRIVY_SERVER_WALLET_ID;
  const escrowAddress = env.NEXT_PUBLIC_ESCROW_CONTRACT;

  if (!appId || !appSecret) {
    console.error('ERROR: Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET');
    process.exit(1);
  }
  if (!walletId) {
    console.error('ERROR: Missing PRIVY_SERVER_WALLET_ID');
    process.exit(1);
  }
  if (!escrowAddress || escrowAddress === '0x') {
    console.error('ERROR: Missing NEXT_PUBLIC_ESCROW_CONTRACT');
    process.exit(1);
  }

  const privy = new PrivyClient({ appId, appSecret });

  console.log(`Creating 4 tables on PokerEscrow at ${escrowAddress}...\n`);

  for (const table of TABLES) {
    const tableIdBytes32 = keccak256(toHex(table.name));

    const data = encodeFunctionData({
      abi: CREATE_TABLE_ABI,
      functionName: 'createTable',
      args: [tableIdBytes32, table.minBuyIn, table.maxBuyIn],
    });

    try {
      const result = await privy.wallets().ethereum().sendTransaction(walletId, {
        caip2: `eip155:${TEMPO_CHAIN_ID}`,
        params: {
          transaction: {
            to: escrowAddress,
            data,
          },
        },
      });

      console.log(`  ${table.name.padEnd(6)} table created (tx: ${result.hash})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ${table.name.padEnd(6)} table FAILED: ${message}`);
    }
  }

  console.log('\nDone! All tables created.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
