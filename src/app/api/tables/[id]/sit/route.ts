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
  const { seatNumber, buyInAmount, agentName, privyUserId, walletAddress, depositTxHash } = body;

  if (typeof seatNumber !== 'number' || typeof buyInAmount !== 'number' || typeof agentName !== 'string') {
    return NextResponse.json({ error: 'Missing required fields: seatNumber, buyInAmount, agentName' }, { status: 400 });
  }

  const gm = getGameManager();
  const result = gm.sitAgent(id, seatNumber, agentName, buyInAmount, privyUserId, walletAddress);

  if (!result.success) {
    // If the player already deposited on-chain, refund their escrow balance
    if (walletAddress && depositTxHash) {
      try {
        const refundTx = await settlePlayer(id, walletAddress, buyInAmount);
        console.log('[sit] Refunded deposit after engine rejection:', refundTx.hash);
      } catch (refundErr) {
        console.error(
          '[sit] CRITICAL: Deposit refund failed for', walletAddress,
          'table:', id, 'amount:', buyInAmount, 'error:', refundErr,
        );
      }
    }
    return NextResponse.json(
      {
        error: result.error,
        ...(walletAddress && depositTxHash ? { refundStatus: 'attempted' } : {}),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    agent: result.agent,
    ...(depositTxHash ? { depositTxHash } : {}),
  });
}
