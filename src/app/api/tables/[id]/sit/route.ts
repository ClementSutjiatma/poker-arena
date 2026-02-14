import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { seatNumber, buyInAmount, agentName } = body;

  if (typeof seatNumber !== 'number' || typeof buyInAmount !== 'number' || typeof agentName !== 'string') {
    return NextResponse.json({ error: 'Missing required fields: seatNumber, buyInAmount, agentName' }, { status: 400 });
  }

  const gm = getGameManager();
  const result = gm.sitAgent(id, seatNumber, agentName, buyInAmount);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, agent: result.agent });
}
