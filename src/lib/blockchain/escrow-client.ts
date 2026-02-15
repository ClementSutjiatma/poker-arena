import { createPublicClient, http, encodeFunctionData, keccak256, toHex, type Hex } from 'viem';
import { PrivyClient } from '@privy-io/node';
import { tempoTestnet, ESCROW_ADDRESS, AUSD_ADDRESS, TEMPO_MIN_BASE_FEE } from './chain-config';
import { POKER_ESCROW_ABI, ERC20_ABI } from './abi';

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
// Agent functions: sign from user's embedded wallet (delegated signing)
// ----------------------------------------------------------------

/**
 * Approve the escrow contract to spend aUSD, then deposit into escrow.
 * Both transactions are signed from the user's embedded wallet server-side.
 */
export async function approveAndDepositForAgent(
  privyWalletId: string,
  tableId: string,
  walletAddress: string,
  buyInChips: number,
): Promise<{ approveHash: string; depositHash: string }> {
  const tokenAmount = chipsToTokenUnits(buyInChips);
  console.log('[approveAndDeposit] walletId:', privyWalletId, 'table:', tableId, 'wallet:', walletAddress, 'chips:', buyInChips, 'tokenAmount:', tokenAmount.toString());

  // 1. Approve escrow to spend aUSD
  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [ESCROW_ADDRESS, tokenAmount],
  });
  const approveTx = await sendUserWalletTx(privyWalletId, AUSD_ADDRESS, approveData);

  // 2. Deposit into escrow
  const depositData = encodeFunctionData({
    abi: POKER_ESCROW_ABI,
    functionName: 'deposit',
    args: [toTableIdBytes32(tableId), tokenAmount],
  });
  const depositTx = await sendUserWalletTx(privyWalletId, ESCROW_ADDRESS, depositData);

  return { approveHash: approveTx.hash, depositHash: depositTx.hash };
}

/**
 * Rebuy at a table from the user's embedded wallet.
 */
export async function rebuyForAgent(
  privyWalletId: string,
  tableId: string,
  rebuyChips: number,
): Promise<{ approveHash: string; rebuyHash: string }> {
  const tokenAmount = chipsToTokenUnits(rebuyChips);

  // 1. Approve
  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [ESCROW_ADDRESS, tokenAmount],
  });
  const approveTx = await sendUserWalletTx(privyWalletId, AUSD_ADDRESS, approveData);

  // 2. Rebuy
  const rebuyData = encodeFunctionData({
    abi: POKER_ESCROW_ABI,
    functionName: 'rebuy',
    args: [toTableIdBytes32(tableId), tokenAmount],
  });
  const rebuyTx = await sendUserWalletTx(privyWalletId, ESCROW_ADDRESS, rebuyData);

  return { approveHash: approveTx.hash, rebuyHash: rebuyTx.hash };
}

/** Read on-chain aUSD balance for a wallet address. */
export async function getAusdBalance(walletAddress: string): Promise<bigint> {
  const client = getPublicClient();
  const result = await client.readContract({
    address: AUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress as `0x${string}`],
  });
  return result as bigint;
}

// ----------------------------------------------------------------
// Internal: send tx via Privy server wallet
// ----------------------------------------------------------------

async function sendServerTx(data: Hex): Promise<{ hash: string }> {
  const privy = getPrivyClient();
  const walletId = SERVER_WALLET_ID();

  // Tempo Testnet requires a minimum base fee of 20 gwei.
  // Privy's SDK doesn't use viem's chain fee estimation, so we must set gas explicitly.
  const maxPriorityFeePerGas = TEMPO_MIN_BASE_FEE.toString();
  const maxFeePerGas = (TEMPO_MIN_BASE_FEE * BigInt(3)).toString(); // 60 gwei — generous headroom

  const result = await privy.wallets().ethereum().sendTransaction(walletId, {
    caip2: `eip155:${tempoTestnet.id}`,
    params: {
      transaction: {
        to: ESCROW_ADDRESS,
        data,
        type: 2, // EIP-1559
        max_fee_per_gas: maxFeePerGas,
        max_priority_fee_per_gas: maxPriorityFeePerGas,
      },
    },
  });

  return { hash: result.hash };
}

/** Send a tx signed from a user's embedded wallet (delegated signing). */
async function sendUserWalletTx(
  privyWalletId: string,
  to: string,
  data: Hex,
): Promise<{ hash: string }> {
  const privy = getPrivyClient();

  // The authorization private key allows the server to sign on behalf of user wallets.
  // Format: base64-encoded PKCS8 key (no PEM headers). The env var may have a "wallet-auth:" prefix.
  const rawKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ?? '';
  const authPrivateKey = rawKey.replace(/^wallet-auth:/, '');

  // Tempo Testnet requires a minimum base fee of 20 gwei.
  const maxPriorityFeePerGas = TEMPO_MIN_BASE_FEE.toString();
  const maxFeePerGas = (TEMPO_MIN_BASE_FEE * BigInt(3)).toString(); // 60 gwei

  console.log('[sendUserWalletTx] walletId:', privyWalletId);
  console.log('[sendUserWalletTx] to:', to);
  console.log('[sendUserWalletTx] caip2:', `eip155:${tempoTestnet.id}`);
  console.log('[sendUserWalletTx] authKeyPresent:', !!authPrivateKey, 'length:', authPrivateKey.length);

  try {
    const result = await privy.wallets().ethereum().sendTransaction(privyWalletId, {
      caip2: `eip155:${tempoTestnet.id}`,
      params: {
        transaction: {
          to,
          data,
          type: 2, // EIP-1559
          max_fee_per_gas: maxFeePerGas,
          max_priority_fee_per_gas: maxPriorityFeePerGas,
        },
      },
      authorization_context: {
        authorization_private_keys: [authPrivateKey],
      },
    });

    console.log('[sendUserWalletTx] success, hash:', result.hash);
    return { hash: result.hash };
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    console.error('[sendUserWalletTx] FAILED');
    console.error('[sendUserWalletTx] error message:', e?.message);
    console.error('[sendUserWalletTx] error status:', e?.status ?? e?.statusCode);
    console.error('[sendUserWalletTx] error body:', JSON.stringify(e?.body ?? e?.cause, null, 2));
    try {
      console.error('[sendUserWalletTx] full error:', JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2));
    } catch { /* circular ref */ }
    throw err;
  }
}
