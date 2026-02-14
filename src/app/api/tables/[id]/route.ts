import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';
import { getCurrentTurnSeat } from '@/lib/poker/hand-manager';

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

  const hand = table.currentHand;

  return NextResponse.json({
    config: table.config,
    seats: table.seats.map(s => ({
      seatNumber: s.seatNumber,
      agent: s.agent ? {
        id: s.agent.id,
        name: s.agent.name,
        type: s.agent.type,
      } : null,
      stack: s.stack,
      holeCards: s.holeCards,
      isSittingOut: s.isSittingOut,
      currentBet: s.currentBet,
      hasFolded: s.hasFolded,
      isAllIn: s.isAllIn,
    })),
    currentHand: hand ? {
      id: hand.id,
      handNumber: hand.handNumber,
      phase: hand.phase,
      communityCards: hand.communityCards,
      pot: hand.pot,
      actions: hand.actions,
      currentBettingRound: hand.currentBettingRound,
      currentTurnSeat: getCurrentTurnSeat(hand),
      dealerSeatNumber: hand.dealerSeatNumber,
      smallBlindSeatNumber: hand.smallBlindSeatNumber,
      bigBlindSeatNumber: hand.bigBlindSeatNumber,
      currentBet: hand.currentBet,
      winners: hand.winners,
      startedAt: hand.startedAt,
      completedAt: hand.completedAt,
    } : null,
    handCount: table.handCount,
  });
}
