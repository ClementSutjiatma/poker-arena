import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';
import { getHandHistoryFromDB } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gm = getGameManager();
  const table = gm.getTable(id);

  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  // Parse pagination params
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  // Try DB first for full history
  const dbHistory = await getHandHistoryFromDB(id, limit, offset);
  if (dbHistory && dbHistory.length > 0) {
    return NextResponse.json(dbHistory);
  }

  // Fall back to in-memory (last 50 hands)
  const history = table.handHistory.map((h) => ({
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
