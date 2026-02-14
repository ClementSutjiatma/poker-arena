import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth/api-key';
import { createPublicClient, http } from 'viem';
import { tempoTestnet, AUSD_ADDRESS } from '@/lib/blockchain/chain-config';
import { ERC20_ABI } from '@/lib/blockchain/abi';

export const dynamic = 'force-dynamic';

const publicClient = createPublicClient({
  chain: tempoTestnet,
  transport: http(),
});

export async function GET(request: Request) {
  const user = await authenticateApiKey(request);
  if (!user) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  let balanceRaw: bigint | null = null;
  if (user.walletAddress) {
    try {
      balanceRaw = (await publicClient.readContract({
        address: AUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [user.walletAddress as `0x${string}`],
      })) as bigint;
    } catch {
      // Chain read failed — return null balance
    }
  }

  // aUSD has 6 decimals
  const balanceAusd = balanceRaw !== null
    ? Number(balanceRaw) / 1_000_000
    : null;

  return NextResponse.json({
    userId: user.userId,
    displayName: user.displayName,
    email: user.email,
    walletAddress: user.walletAddress,
    balance: balanceAusd,
    balanceRaw: balanceRaw?.toString() ?? null,
  });
}
