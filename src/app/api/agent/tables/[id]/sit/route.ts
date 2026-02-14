import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth/api-key';
import { getGameManager } from '@/lib/game/game-manager';
import { approveAndDepositForAgent } from '@/lib/blockchain/escrow-client';

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
  } catch (err) {
    console.error('[agent/sit] Escrow deposit failed:', err);
    return NextResponse.json(
      { error: 'On-chain deposit failed. Check your aUSD balance.' },
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
    // TODO: If engine rejects but deposit succeeded, we'd need to settle back.
    // For MVP, the escrow holds the funds and can be emergency-refunded.
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    agentId: result.agent!.id,
    seatNumber,
    tableId,
  });
}
