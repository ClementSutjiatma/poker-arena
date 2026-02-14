import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';
import { persistBotRebuy } from '@/lib/db/persist';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { agentId, amount } = body;

  if (!agentId || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'Missing agentId or invalid amount' }, { status: 400 });
  }

  const gm = getGameManager();
  const result = gm.rebuyAgent(id, agentId, amount);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Record the rebuy in DB
  persistBotRebuy(agentId, id, amount).catch(() => {});

  return NextResponse.json({
    success: true,
    newStack: result.newStack,
  });
}
