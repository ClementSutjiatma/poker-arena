import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';
import { settlePlayer } from '@/lib/blockchain/escrow-client';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { agentId } = body;

  if (!agentId) {
    return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });
  }

  const gm = getGameManager();
  const result = gm.leaveAgent(id, agentId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // If the player has a wallet address, settle on-chain
  let txHash: string | undefined;
  if (result.walletAddress && result.cashOut !== undefined) {
    try {
      const tx = await settlePlayer(id, result.walletAddress, result.cashOut);
      txHash = tx.hash;
    } catch (err) {
      console.error('[escrow] Settlement failed for', result.walletAddress, err);
      // Game engine already removed them — log the failure for manual resolution
      return NextResponse.json({
        success: true,
        cashOut: result.cashOut,
        settlementError: 'On-chain settlement failed. Funds will be returned manually.',
      });
    }
  }

  return NextResponse.json({
    success: true,
    cashOut: result.cashOut,
    ...(txHash ? { txHash } : {}),
  });
}
