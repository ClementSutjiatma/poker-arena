import { defineChain } from 'viem';

/**
 * Tempo Testnet (Moderato) — Stripe's L1 stablecoin chain.
 * Chain ID 42431, sub-second finality, no native gas token (fees in TIP-20).
 *
 * The chain requires a minimum base fee of 20 gwei (20_000_000_000).
 * We provide explicit fee defaults so viem doesn't try eth_maxPriorityFeePerGas
 * (which the RPC may not support), avoiding max_fee_per_gas: 0 errors.
 */

/** Minimum base fee required by the Tempo network (20 gwei). */
export const TEMPO_MIN_BASE_FEE = BigInt('20000000000'); // 20 gwei

export const tempoTestnet = defineChain({
  id: 42431,
  name: 'Tempo Testnet',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 6 },
  rpcUrls: {
    default: { http: ['https://rpc.moderato.tempo.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Tempo Explorer', url: 'https://explore.tempo.xyz' },
  },
  fees: {
    defaultPriorityFee: TEMPO_MIN_BASE_FEE, // 20 gwei
    // Ensure maxFeePerGas is always at least the minimum base fee even if
    // the RPC returns a lower estimate or zero.
    async estimateFeesPerGas({ client, multiply, type }) {
      // For legacy (type '0x0') transactions, provide gasPrice.
      if (type === 'legacy') {
        return {
          gasPrice: multiply(TEMPO_MIN_BASE_FEE),
        };
      }
      // EIP-1559: set maxFeePerGas and maxPriorityFeePerGas.
      // Try to read the latest baseFee from the chain; fall back to TEMPO_MIN_BASE_FEE.
      let baseFee = TEMPO_MIN_BASE_FEE;
      try {
        const block = await client.request({
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
        });
        if (block?.baseFeePerGas) {
          const parsed = BigInt(block.baseFeePerGas);
          if (parsed > baseFee) baseFee = parsed;
        }
      } catch {
        // RPC doesn't support it — use the constant.
      }
      const maxPriorityFeePerGas = TEMPO_MIN_BASE_FEE;
      // maxFeePerGas = 2 * baseFee + priority tip (standard formula with headroom)
      const maxFeePerGas = multiply(baseFee * BigInt(2) + maxPriorityFeePerGas);
      return {
        maxFeePerGas,
        maxPriorityFeePerGas,
      };
    },
  },
});

/** AlphaUSD (aUSD) — TIP-20 testnet stablecoin, 6 decimals, ERC-20 compatible. */
export const AUSD_ADDRESS = '0x20c0000000000000000000000000000000000001' as const;

/** Deployed PokerEscrow contract address (set after deployment). */
export const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_CONTRACT ?? '0x') as `0x${string}`;
