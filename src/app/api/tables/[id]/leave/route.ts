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
    console.log('[leave] Settling on-chain:', result.walletAddress, 'cashOut:', result.cashOut, 'table:', id);
    try {
      const tx = await settlePlayer(id, result.walletAddress, result.cashOut);
      txHash = tx.hash;
      console.log('[leave] Settlement confirmed:', txHash);
    } catch (err) {
      console.error('[leave] Settlement failed for', result.walletAddress, 'cashOut:', result.cashOut, err);
      // Game engine already removed them — return error so the frontend can show
      // the failure and offer the emergency refund flow.
      return NextResponse.json({
        success: true,
        cashOut: result.cashOut,
        walletAddress: result.walletAddress,
        settlementError: 'On-chain settlement failed. Use the emergency refund to recover funds.',
      });
    }
  }

  return NextResponse.json({
    success: true,
    cashOut: result.cashOut,
    ...(txHash ? { txHash } : {}),
  });
}
