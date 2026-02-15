import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth/api-key';
import { getGameManager, TURN_TIMEOUT_MS } from '@/lib/game/game-manager';
import { getCurrentTurnSeat } from '@/lib/poker/hand-manager';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authenticateApiKey(request);
  if (!user) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const { id: tableId } = await params;
  const url = new URL(request.url);
  const agentId = url.searchParams.get('agentId');

  if (!agentId) {
    return NextResponse.json({ error: 'Missing agentId query parameter' }, { status: 400 });
  }

  const gm = getGameManager();
  const table = gm.getTable(tableId);
  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  // Verify the agent belongs to this user
  const mySeat = table.seats.find(s => s.agent?.id === agentId);
  if (!mySeat) {
    return NextResponse.json({ error: 'Agent not found at this table' }, { status: 404 });
  }

  const hand = table.currentHand;
  const currentTurnSeat = hand ? getCurrentTurnSeat(hand) : null;
  const isMyTurn = currentTurnSeat === mySeat.seatNumber;

  // Compute valid actions for the agent
  let validActions: string[] = [];
  let callAmount = 0;
  let minRaiseTotal = 0;

  if (isMyTurn && hand && hand.phase !== 'complete' && hand.phase !== 'showdown') {
    const toCall = hand.currentBet - mySeat.currentBet;

    if (toCall > 0) {
      validActions.push('fold', 'call');
      callAmount = Math.min(toCall, mySeat.stack);
      if (mySeat.stack > toCall) {
        validActions.push('raise');
        minRaiseTotal = hand.currentBet + hand.minRaise;
      }
    } else {
      validActions.push('check');
      if (mySeat.stack > 0) {
        validActions.push('bet');
        minRaiseTotal = hand.minRaise;
      }
    }

    if (mySeat.stack > 0) {
      validActions.push('all-in');
    }
  }

  // Build seats — hide other players' hole cards unless showdown
  const isShowdown = hand?.phase === 'showdown';
  const seats = table.seats.map(s => ({
    seatNumber: s.seatNumber,
    agent: s.agent
      ? { id: s.agent.id, name: s.agent.name, type: s.agent.type }
      : null,
    stack: s.stack,
    holeCards:
      s.agent?.id === agentId
        ? s.holeCards
        : isShowdown && !s.hasFolded
          ? s.holeCards
          : null,
    isSittingOut: s.isSittingOut,
    currentBet: s.currentBet,
    hasFolded: s.hasFolded,
    isAllIn: s.isAllIn,
  }));

  return NextResponse.json({
    tableId,
    config: {
      name: table.config.name,
      smallBlind: table.config.smallBlind,
      bigBlind: table.config.bigBlind,
      minBuyIn: table.config.minBuyIn,
      maxBuyIn: table.config.maxBuyIn,
    },
    seats,
    myAgentId: agentId,
    mySeat: {
      seatNumber: mySeat.seatNumber,
      stack: mySeat.stack,
      holeCards: mySeat.holeCards,
      currentBet: mySeat.currentBet,
      hasFolded: mySeat.hasFolded,
      isAllIn: mySeat.isAllIn,
      isSittingOut: mySeat.isSittingOut,
    },
    currentHand: hand
      ? {
          handNumber: hand.handNumber,
          phase: hand.phase,
          communityCards: hand.communityCards,
          pot: hand.pot,
          currentBet: hand.currentBet,
          minRaise: hand.minRaise,
          dealerSeatNumber: hand.dealerSeatNumber,
          smallBlindSeatNumber: hand.smallBlindSeatNumber,
          bigBlindSeatNumber: hand.bigBlindSeatNumber,
          currentTurnSeat,
          turnDeadline: currentTurnSeat !== null ? hand.lastActionAt + TURN_TIMEOUT_MS : null,
          isMyTurn,
          validActions,
          callAmount,
          minRaiseTotal,
          actions: hand.actions.map(a => ({
            agentName: a.agentName,
            action: a.action,
            amount: a.amount,
            round: a.round,
          })),
          winners: hand.winners,
        }
      : null,
    handCount: table.handCount,
  });
}
