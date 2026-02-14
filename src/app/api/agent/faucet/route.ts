import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth/api-key';
import { mintTestnetTokens } from '@/lib/blockchain/faucet';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await authenticateApiKey(request);
  if (!user) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  if (!user.walletAddress) {
    return NextResponse.json(
      { error: 'No wallet address found. Please complete registration first.' },
      { status: 400 },
    );
  }

  try {
    const result = await mintTestnetTokens(user.walletAddress);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      walletAddress: user.walletAddress,
      txHashes: result.txHashes,
      message: 'Testnet aUSD minted. Balance will update shortly.',
    });
  } catch (err) {
    console.error('[agent/faucet] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
