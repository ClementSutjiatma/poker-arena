import { NextResponse } from 'next/server';
import { mintTestnetTokens } from '@/lib/blockchain/faucet';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    const result = await mintTestnetTokens(walletAddress);

    if (!result.success) {
      const status = result.error === 'Invalid wallet address' ? 400 : 502;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      success: true,
      txHashes: result.txHashes,
    });
  } catch (err) {
    console.error('[faucet] Mint error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
