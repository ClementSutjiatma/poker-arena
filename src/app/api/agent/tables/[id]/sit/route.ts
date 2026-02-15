import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth/api-key';
import { getGameManager } from '@/lib/game/game-manager';
import { approveAndDepositForAgent, settlePlayer } from '@/lib/blockchain/escrow-client';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authenticateApiKey(request);
  if (!user) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const { id: tableId } = await params;
  const body = await request.json();
  const { seatNumber, buyInAmount } = body;

  if (typeof seatNumber !== 'number' || typeof buyInAmount !== 'number') {
    return NextResponse.json(
      { error: 'Missing required fields: seatNumber (number), buyInAmount (number)' },
      { status: 400 },
    );
  }

  if (!user.walletAddress || !user.privyWalletId) {
    return NextResponse.json(
      { error: 'No wallet found. Complete registration and fund your wallet first.' },
      { status: 400 },
    );
  }

  // Execute on-chain approve + deposit from user's embedded wallet
  try {
    await approveAndDepositForAgent(
      user.privyWalletId,
      tableId,
      user.walletAddress,
      buyInAmount,
    );
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    const errorMsg = (e?.message as string) || String(err);
    const errorBody = e?.body ?? e?.cause;
    console.error('[agent/sit] Escrow deposit failed:', errorMsg);
    try {
      console.error('[agent/sit] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2));
    } catch { /* circular ref */ }
    return NextResponse.json(
      {
        error: 'On-chain deposit failed',
        detail: errorMsg,
        privyError: errorBody ?? null,
      },
      { status: 400 },
    );
  }

  // Register in game engine
  const gm = getGameManager();
  const agentName = user.displayName || `Agent_${user.userId.slice(0, 8)}`;
  const result = gm.sitAgent(
    tableId,
    seatNumber,
    agentName,
    buyInAmount,
    user.privyUserId,
    user.walletAddress,
  );

  if (!result.success) {
    // Deposit succeeded but game engine rejected — refund the player's deposit
    try {
      const refundTx = await settlePlayer(tableId, user.walletAddress, buyInAmount);
      console.log('[agent/sit] Refunded deposit after engine rejection:', refundTx.hash);
    } catch (refundErr) {
      // If the automatic refund fails, log the error so it can be recovered
      // via the emergency-refund endpoint
      console.error(
        '[agent/sit] CRITICAL: Deposit refund failed for', user.walletAddress,
        'table:', tableId, 'amount:', buyInAmount, 'error:', refundErr,
      );
    }
    return NextResponse.json(
      {
        error: result.error,
        refundStatus: 'attempted',
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    agentId: result.agent!.id,
    seatNumber,
    tableId,
  });
}
