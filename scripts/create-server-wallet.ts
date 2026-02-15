/**
 * Creates a Privy server wallet for the Poker Arena treasury.
 *
 * This wallet will be the "owner" of the PokerEscrow contract and is used
 * to call settleAndWithdraw / batchSettle / emergencyRefund on behalf of the server.
 *
 * Usage:
 *   npx tsx scripts/create-server-wallet.ts
 *
 * Requires .env.local with NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET.
 */

import { PrivyClient } from '@privy-io/node';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_FILE = resolve(ROOT, '.env.local');

// ---------------------------------------------------------------------------
// 1. Load env
// ---------------------------------------------------------------------------

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) {
    console.error('ERROR: .env.local not found at', ENV_FILE);
    process.exit(1);
  }
  const lines = readFileSync(ENV_FILE, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

// ---------------------------------------------------------------------------
// 2. Create the server wallet
// ---------------------------------------------------------------------------

async function main() {
  const env = loadEnv();

  const appId = env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    console.error('ERROR: Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET in .env.local');
    process.exit(1);
  }

  // Check if a server wallet ID is already set
  if (env.PRIVY_SERVER_WALLET_ID) {
    console.log('PRIVY_SERVER_WALLET_ID already set:', env.PRIVY_SERVER_WALLET_ID);
    console.log('If you want to create a new wallet, remove PRIVY_SERVER_WALLET_ID from .env.local first.');
    process.exit(0);
  }

  console.log('Creating Privy server wallet for Poker Arena treasury...\n');

  const privy = new PrivyClient({ appId, appSecret });

  // Create a server-managed wallet (no owner = managed by Privy infra, controlled by our app)
  const wallet = await privy.wallets().create({
    chain_type: 'ethereum',
  });

  console.log('Server wallet created successfully!');
  console.log('  Wallet ID:     ', wallet.id);
  console.log('  Wallet Address:', wallet.address);
  console.log('  Chain Type:    ', wallet.chain_type);
  console.log();

  // ---------------------------------------------------------------------------
  // 3. Append to .env.local
  // ---------------------------------------------------------------------------

  const existingContent = readFileSync(ENV_FILE, 'utf-8');
  const newVars = `PRIVY_SERVER_WALLET_ID=${wallet.id}\nPRIVY_SERVER_WALLET_ADDRESS=${wallet.address}\n`;

  if (!existingContent.endsWith('\n')) {
    writeFileSync(ENV_FILE, existingContent + '\n' + newVars);
  } else {
    writeFileSync(ENV_FILE, existingContent + newVars);
  }

  console.log('Updated .env.local with PRIVY_SERVER_WALLET_ID and PRIVY_SERVER_WALLET_ADDRESS\n');

  // ---------------------------------------------------------------------------
  // 4. Set Vercel env vars
  // ---------------------------------------------------------------------------

  console.log('Setting environment variables on Vercel...\n');

  const vercelEnvVars: Record<string, string> = {
    PRIVY_SERVER_WALLET_ID: wallet.id,
    PRIVY_SERVER_WALLET_ADDRESS: wallet.address,
  };

  const environments = ['production', 'preview', 'development'] as const;

  for (const [key, value] of Object.entries(vercelEnvVars)) {
    for (const env of environments) {
      try {
        // Remove existing var if present (ignore errors if it doesn't exist)
        try {
          execSync(`vercel env rm ${key} ${env} -y`, { cwd: ROOT, stdio: 'pipe' });
        } catch {
          // Variable didn't exist yet — that's fine
        }

        // Add the new value
        execSync(`echo "${value}" | vercel env add ${key} ${env}`, {
          cwd: ROOT,
          stdio: 'pipe',
        });
      } catch (err) {
        console.error(`  Failed to set ${key} (${env}) on Vercel:`, err);
      }
    }
    console.log(`  Set ${key} on Vercel (production, preview, development)`);
  }

  console.log('\nDone! Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Server Wallet ID:      ${wallet.id}`);
  console.log(`  Server Wallet Address: ${wallet.address}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nNext steps:');
  console.log('  1. Fund this wallet with gas on Tempo testnet (faucet)');
  console.log('  2. Deploy the PokerEscrow contract with this wallet as owner');
  console.log('  3. Set NEXT_PUBLIC_ESCROW_CONTRACT in .env.local and Vercel');
}

main().catch((err) => {
  console.error('Failed to create server wallet:', err);
  process.exit(1);
});
