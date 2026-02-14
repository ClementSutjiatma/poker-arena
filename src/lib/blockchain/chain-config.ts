import { defineChain } from 'viem';

/**
 * Tempo Testnet (Moderato) — Stripe's L1 stablecoin chain.
 * Chain ID 42431, sub-second finality, no native gas token (fees in TIP-20).
 */
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
});

/** AlphaUSD (aUSD) — TIP-20 testnet stablecoin, 6 decimals, ERC-20 compatible. */
export const AUSD_ADDRESS = '0x20c0000000000000000000000000000000000001' as const;

/** Deployed PokerEscrow contract address (set after deployment). */
export const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_CONTRACT ?? '0x') as `0x${string}`;
