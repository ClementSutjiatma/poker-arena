import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth/api-key';
import { getGameManager } from '@/lib/game/game-manager';
import { settlePlayer } from '@/lib/blockchain/escrow-client';

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
  const { agentId } = body;

  if (!agentId) {
    return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });
  }

  // Verify agent is at the table
  const gm = getGameManager();
  const table = gm.getTable(tableId);
  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const seat = table.seats.find(s => s.agent?.id === agentId);
  if (!seat) {
    return NextResponse.json({ error: 'Agent not found at this table' }, { status: 404 });
  }

  const result = gm.leaveAgent(tableId, agentId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Settle on-chain — send final stack back to player's wallet
  let txHash: string | undefined;
  if (result.walletAddress && result.cashOut !== undefined) {
    try {
      const tx = await settlePlayer(tableId, result.walletAddress, result.cashOut);
      txHash = tx.hash;
    } catch (err) {
      console.error('[agent/leave] Settlement failed:', err);
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
