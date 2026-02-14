import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  const gm = getGameManager();
  return NextResponse.json(gm.getTableSummaries());
}
