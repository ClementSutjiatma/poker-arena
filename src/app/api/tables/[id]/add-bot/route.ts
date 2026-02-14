import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';
import { BotStrategy } from '@/lib/game/auto-players';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const strategy: BotStrategy = body.strategy || 'house_fish';

  const validStrategies: BotStrategy[] = ['house_fish', 'house_tag', 'house_lag'];
  if (!validStrategies.includes(strategy)) {
    return NextResponse.json({ error: 'Invalid strategy' }, { status: 400 });
  }

  const gm = getGameManager();
  const result = gm.addBot(id, strategy);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
