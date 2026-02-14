import { createPublicClient, http, encodeFunctionData, keccak256, toHex, type Hex } from 'viem';
import { PrivyClient } from '@privy-io/node';
import { tempoTestnet, ESCROW_ADDRESS } from './chain-config';
import { POKER_ESCROW_ABI } from './abi';

// ----------------------------------------------------------------
// Clients (lazy-initialized)
// ----------------------------------------------------------------

let _publicClient: ReturnType<typeof createPublicClient> | null = null;
let _privyClient: PrivyClient | null = null;

function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: tempoTestnet,
      transport: http(),
    });
  }
  return _publicClient;
}

function getPrivyClient() {
  if (!_privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('Missing PRIVY env vars for server wallet');
    }
    _privyClient = new PrivyClient({ appId, appSecret });
  }
  return _privyClient;
}

const SERVER_WALLET_ID = () => {
  const id = process.env.PRIVY_SERVER_WALLET_ID;
  if (!id) throw new Error('Missing PRIVY_SERVER_WALLET_ID');
  return id;
};

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/** Convert a table ID string (e.g. "micro") to keccak256 bytes32. */
export function toTableIdBytes32(tableId: string): Hex {
  return keccak256(toHex(tableId));
}

/** Convert an integer chip amount to 6-decimal token units (bigint). */
export function chipsToTokenUnits(chips: number): bigint {
  // The in-game engine uses integer chips (e.g. 200 = 200 aUSD).
  // aUSD has 6 decimals, so 200 chips = 200_000000 token units.
  return BigInt(chips) * BigInt(1_000_000);
}

// ----------------------------------------------------------------
// Read functions
// ----------------------------------------------------------------

/** Read a player's escrowed balance on-chain. */
export async function getPlayerOnChainBalance(tableId: string, playerAddress: string): Promise<bigint> {
  const client = getPublicClient();
  const result = await client.readContract({
    address: ESCROW_ADDRESS,
    abi: POKER_ESCROW_ABI,
    functionName: 'getPlayerBalance',
    args: [toTableIdBytes32(tableId), playerAddress as `0x${string}`],
  });
  return result as bigint;
}

// ----------------------------------------------------------------
// Write functions (via Privy server wallet)
// ----------------------------------------------------------------

/** Settle a single player: sends their finalStack to their wallet. */
export async function settlePlayer(
  tableId: string,
  playerWallet: string,
  finalStackChips: number,
): Promise<{ hash: string }> {
  const data = encodeFunctionData({
    abi: POKER_ESCROW_ABI,
    functionName: 'settleAndWithdraw',
    args: [
      toTableIdBytes32(tableId),
      playerWallet as `0x${string}`,
      chipsToTokenUnits(finalStackChips),
    ],
  });

  return sendServerTx(data);
}

/** Batch settle multiple players at once. */
export async function batchSettlePlayers(
  tableId: string,
  playerWallets: string[],
  finalStacksChips: number[],
): Promise<{ hash: string }> {
  const data = encodeFunctionData({
    abi: POKER_ESCROW_ABI,
    functionName: 'batchSettle',
    args: [
      toTableIdBytes32(tableId),
      playerWallets as `0x${string}`[],
      finalStacksChips.map(chipsToTokenUnits),
    ],
  });

  return sendServerTx(data);
}

/** Emergency: refund all players at a table. */
export async function emergencyRefund(tableId: string): Promise<{ hash: string }> {
  const data = encodeFunctionData({
    abi: POKER_ESCROW_ABI,
    functionName: 'emergencyRefund',
    args: [toTableIdBytes32(tableId)],
  });

  return sendServerTx(data);
}

// ----------------------------------------------------------------
// Internal: send tx via Privy server wallet
// ----------------------------------------------------------------

async function sendServerTx(data: Hex): Promise<{ hash: string }> {
  const privy = getPrivyClient();
  const walletId = SERVER_WALLET_ID();

  const result = await privy.wallets().ethereum().sendTransaction(walletId, {
    caip2: `eip155:${tempoTestnet.id}`,
    params: {
      transaction: {
        to: ESCROW_ADDRESS,
        data,
      },
    },
  });

  return { hash: result.hash };
}
