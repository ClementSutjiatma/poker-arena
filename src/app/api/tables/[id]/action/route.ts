import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { agentId, action, amount } = body;

  if (!agentId || !action) {
    return NextResponse.json({ error: 'Missing agentId and/or action' }, { status: 400 });
  }

  const gm = getGameManager();
  const result = gm.submitAction(id, agentId, action, amount);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
