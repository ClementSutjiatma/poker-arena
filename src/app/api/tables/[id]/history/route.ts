import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gm = getGameManager();
  const table = gm.getTable(id);

  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const history = table.handHistory.map(h => ({
    id: h.id,
    handNumber: h.handNumber,
    communityCards: h.communityCards,
    pot: h.pot,
    winners: h.winners,
    actions: h.actions,
    startedAt: h.startedAt,
    completedAt: h.completedAt,
  }));

  return NextResponse.json(history.reverse());
}
