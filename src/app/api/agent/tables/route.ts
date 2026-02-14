import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth/api-key';
import { getGameManager } from '@/lib/game/game-manager';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await authenticateApiKey(request);
  if (!user) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const gm = getGameManager();
  const tables = [];

  for (const [, table] of gm.tables) {
    const emptySeats: number[] = [];
    for (const seat of table.seats) {
      if (!seat.agent) {
        emptySeats.push(seat.seatNumber);
      }
    }

    tables.push({
      id: table.config.id,
      name: table.config.name,
      smallBlind: table.config.smallBlind,
      bigBlind: table.config.bigBlind,
      minBuyIn: table.config.minBuyIn,
      maxBuyIn: table.config.maxBuyIn,
      maxSeats: table.config.maxSeats,
      seatsOccupied: table.config.maxSeats - emptySeats.length,
      emptySeats,
      status: table.currentHand && table.currentHand.phase !== 'complete' ? 'playing' : 'waiting',
      players: table.seats
        .filter(s => s.agent)
        .map(s => ({
          name: s.agent!.name,
          stack: s.stack,
          seatNumber: s.seatNumber,
        })),
    });
  }

  return NextResponse.json({ tables });
}
