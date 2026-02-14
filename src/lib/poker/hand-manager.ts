import { freshDeck } from './deck';
import {
  ActionType,
  BettingRound,
  Card,
  HandAction,
  HandPhase,
  HandState,
  Seat,
  SidePot,
  TableState,
} from './types';
import { evaluateHand, compareHands } from './hand-evaluator';
import { getActiveSeats, getNextActiveSeat, archiveHand } from './table';

let handIdCounter = 0;

function nextHandId(): string {
  handIdCounter++;
  return `hand_${Date.now()}_${handIdCounter}`;
}

/**
 * Start a new hand on the given table. Returns the hand state.
 * Assumes at least 2 active (non-sitting-out) players are seated.
 */
export function startHand(table: TableState): HandState {
  const activeSeats = getActiveSeats(table);
  if (activeSeats.length < 2) {
    throw new Error('Need at least 2 active players');
  }

  table.handCount++;
  const deck = freshDeck();
  let deckIndex = 0;

  // Determine dealer, SB, BB positions
  // For first hand, dealer is seat 0 or first active seat
  let dealerSeat: number;
  if (table.currentHand === null && table.handHistory.length === 0) {
    dealerSeat = activeSeats[0].seatNumber;
  } else {
    const lastDealer = table.currentHand?.dealerSeatNumber ?? table.handHistory[table.handHistory.length - 1]?.dealerSeatNumber ?? 0;
    dealerSeat = getNextActiveSeat(table, lastDealer) ?? activeSeats[0].seatNumber;
  }

  let sbSeat: number;
  let bbSeat: number;

  if (activeSeats.length === 2) {
    // Heads-up: dealer is SB
    sbSeat = dealerSeat;
    bbSeat = getNextActiveSeat(table, dealerSeat)!;
  } else {
    sbSeat = getNextActiveSeat(table, dealerSeat)!;
    bbSeat = getNextActiveSeat(table, sbSeat)!;
  }

  // Reset seats for new hand
  for (const seat of table.seats) {
    seat.holeCards = [];
    seat.currentBet = 0;
    seat.hasActed = false;
    seat.hasFolded = false;
    seat.isAllIn = false;
  }

  // Deal hole cards to active seats
  for (const seat of activeSeats) {
    seat.holeCards = [deck[deckIndex++], deck[deckIndex++]];
  }

  // Post blinds
  const sbAmount = Math.min(table.config.smallBlind, table.seats[sbSeat].stack);
  table.seats[sbSeat].stack -= sbAmount;
  table.seats[sbSeat].currentBet = sbAmount;
  if (table.seats[sbSeat].stack === 0) table.seats[sbSeat].isAllIn = true;

  const bbAmount = Math.min(table.config.bigBlind, table.seats[bbSeat].stack);
  table.seats[bbSeat].stack -= bbAmount;
  table.seats[bbSeat].currentBet = bbAmount;
  if (table.seats[bbSeat].stack === 0) table.seats[bbSeat].isAllIn = true;

  const pot = sbAmount + bbAmount;

  // Build the active player order for preflop
  // Start with player after BB (UTG) and go around
  const preflopOrder = buildBettingOrder(table, bbSeat, activeSeats);

  // Store remaining deck for community cards
  const remainingDeck = deck.slice(deckIndex);

  const now = Date.now();
  const hand: HandState = {
    id: nextHandId(),
    handNumber: table.handCount,
    phase: 'preflop',
    communityCards: [],
    pot,
    sidePots: [],
    actions: [
      {
        agentId: table.seats[sbSeat].agent!.id,
        agentName: table.seats[sbSeat].agent!.name,
        seatNumber: sbSeat,
        action: sbAmount < table.config.smallBlind ? 'all-in' : 'bet',
        amount: sbAmount,
        round: 'preflop',
        timestamp: now,
      },
      {
        agentId: table.seats[bbSeat].agent!.id,
        agentName: table.seats[bbSeat].agent!.name,
        seatNumber: bbSeat,
        action: bbAmount < table.config.bigBlind ? 'all-in' : 'bet',
        amount: bbAmount,
        round: 'preflop',
        timestamp: now,
      },
    ],
    currentBettingRound: 'preflop',
    currentPlayerIndex: 0,
    activePlayerOrder: preflopOrder,
    dealerSeatNumber: dealerSeat,
    smallBlindSeatNumber: sbSeat,
    bigBlindSeatNumber: bbSeat,
    currentBet: bbAmount,
    minRaise: table.config.bigBlind,
    winners: [],
    startedAt: now,
    completedAt: null,
    lastActionAt: now,
  };

  // Attach remaining deck to hand via a side channel
  (hand as HandStateInternal)._deck = remainingDeck;
  (hand as HandStateInternal)._deckIndex = 0;

  table.currentHand = hand;

  // If only one player can act (others are all-in), skip to showdown
  if (getPlayersWhoCanAct(table, hand).length <= 1) {
    skipToShowdown(table, hand);
  }

  return hand;
}

interface HandStateInternal extends HandState {
  _deck: Card[];
  _deckIndex: number;
}

function drawCard(hand: HandState): Card {
  const internal = hand as HandStateInternal;
  return internal._deck[internal._deckIndex++];
}

/**
 * Build the betting order for a round. After a given seat, going clockwise,
 * including only active (not folded, not all-in) players.
 */
function buildBettingOrder(table: TableState, afterSeat: number, activeSeats: Seat[]): number[] {
  const order: number[] = [];
  const max = table.config.maxSeats;
  let current = afterSeat;
  for (let i = 0; i < max; i++) {
    current = (current + 1) % max;
    const seat = table.seats[current];
    if (seat.agent && !seat.isSittingOut && !seat.hasFolded && !seat.isAllIn) {
      order.push(current);
    }
  }
  return order;
}

/**
 * Build the post-flop betting order: starts with first active player after dealer.
 */
function buildPostflopOrder(table: TableState, hand: HandState): number[] {
  const activeSeats = getActiveSeats(table).filter(s => !s.hasFolded && !s.isAllIn);
  return buildBettingOrder(table, hand.dealerSeatNumber, activeSeats.length > 0 ? activeSeats : []);
}

function getPlayersWhoCanAct(table: TableState, hand: HandState): Seat[] {
  return getActiveSeats(table).filter(s => !s.hasFolded && !s.isAllIn);
}

function getPlayersStillInHand(table: TableState): Seat[] {
  return getActiveSeats(table).filter(s => !s.hasFolded);
}

/**
 * Get the seat number of the player whose turn it currently is.
 * Returns null if no one can act.
 */
export function getCurrentTurnSeat(hand: HandState): number | null {
  if (!hand || hand.phase === 'waiting' || hand.phase === 'showdown' || hand.phase === 'complete') {
    return null;
  }
  if (hand.activePlayerOrder.length === 0) return null;
  if (hand.currentPlayerIndex >= hand.activePlayerOrder.length) return null;
  return hand.activePlayerOrder[hand.currentPlayerIndex];
}

/**
 * Process an action from a player. Returns true if the action was valid.
 */
export function processAction(
  table: TableState,
  hand: HandState,
  seatNumber: number,
  action: ActionType,
  amount?: number,
): boolean {
  const currentTurn = getCurrentTurnSeat(hand);
  if (currentTurn !== seatNumber) return false;

  const seat = table.seats[seatNumber];
  if (!seat.agent || seat.hasFolded || seat.isAllIn) return false;

  const toCall = hand.currentBet - seat.currentBet;

  switch (action) {
    case 'fold': {
      seat.hasFolded = true;
      break;
    }
    case 'check': {
      if (toCall > 0) return false; // Can't check if there's a bet to call
      break;
    }
    case 'call': {
      const callAmount = Math.min(toCall, seat.stack);
      seat.stack -= callAmount;
      seat.currentBet += callAmount;
      hand.pot += callAmount;
      if (seat.stack === 0) seat.isAllIn = true;
      break;
    }
    case 'bet': {
      if (hand.currentBet > 0 && hand.currentBettingRound !== 'preflop') return false; // Use raise if there's already a bet
      // In preflop, the BB is considered a bet, so any new bet is a raise
      if (hand.currentBettingRound === 'preflop') {
        // Treat as raise in preflop
        return processAction(table, hand, seatNumber, 'raise', amount);
      }
      const betAmount = amount ?? table.config.bigBlind;
      if (betAmount < table.config.bigBlind && betAmount < seat.stack) return false;
      const actualBet = Math.min(betAmount, seat.stack);
      seat.stack -= actualBet;
      seat.currentBet += actualBet;
      hand.pot += actualBet;
      hand.currentBet = seat.currentBet;
      hand.minRaise = actualBet;
      if (seat.stack === 0) seat.isAllIn = true;
      // Reset acted flags for other players
      resetActedForNewBet(table, hand, seatNumber);
      break;
    }
    case 'raise': {
      const raiseTotal = amount ?? (hand.currentBet + hand.minRaise);
      const raiseToAmount = Math.min(raiseTotal, seat.currentBet + seat.stack);
      const additionalChips = raiseToAmount - seat.currentBet;
      if (additionalChips <= 0) return false;
      // Must raise at least minRaise above currentBet, unless going all-in
      if (raiseToAmount < hand.currentBet + hand.minRaise && raiseToAmount < seat.currentBet + seat.stack) {
        return false;
      }
      seat.stack -= additionalChips;
      hand.pot += additionalChips;
      const raiseSize = raiseToAmount - hand.currentBet;
      if (raiseSize > hand.minRaise) hand.minRaise = raiseSize;
      hand.currentBet = raiseToAmount;
      seat.currentBet = raiseToAmount;
      if (seat.stack === 0) seat.isAllIn = true;
      // Reset acted flags for other players
      resetActedForNewBet(table, hand, seatNumber);
      break;
    }
    case 'all-in': {
      const allInAmount = seat.stack;
      const newBet = seat.currentBet + allInAmount;
      seat.stack = 0;
      seat.isAllIn = true;
      hand.pot += allInAmount;
      if (newBet > hand.currentBet) {
        const raiseSize = newBet - hand.currentBet;
        if (raiseSize >= hand.minRaise) hand.minRaise = raiseSize;
        hand.currentBet = newBet;
        resetActedForNewBet(table, hand, seatNumber);
      }
      seat.currentBet = newBet;
      break;
    }
    default:
      return false;
  }

  // Record action
  const handAction: HandAction = {
    agentId: seat.agent!.id,
    agentName: seat.agent!.name,
    seatNumber,
    action: seat.isAllIn && action !== 'fold' ? 'all-in' : action,
    amount: seat.currentBet,
    round: hand.currentBettingRound,
    timestamp: Date.now(),
  };
  hand.actions.push(handAction);
  hand.lastActionAt = Date.now();
  seat.hasActed = true;

  // Check if hand is over (only one player left)
  const playersInHand = getPlayersStillInHand(table);
  if (playersInHand.length === 1) {
    // Award pot to winner
    const winner = playersInHand[0];
    winner.stack += hand.pot;
    winner.agent!.handsWon++;
    hand.winners = [{
      agentId: winner.agent!.id,
      agentName: winner.agent!.name,
      amount: hand.pot,
      handName: 'Last player standing',
    }];
    hand.pot = 0;
    finishHand(table, hand);
    return true;
  }

  // Advance to next player
  advanceAction(table, hand);

  return true;
}

function resetActedForNewBet(table: TableState, hand: HandState, raiserSeat: number): void {
  for (const sn of hand.activePlayerOrder) {
    if (sn !== raiserSeat) {
      table.seats[sn].hasActed = false;
    }
  }
}

function advanceAction(table: TableState, hand: HandState): void {
  // Find next player who hasn't acted and can act
  const canAct = hand.activePlayerOrder.filter(sn => {
    const s = table.seats[sn];
    return !s.hasFolded && !s.isAllIn && !s.hasActed;
  });

  if (canAct.length > 0) {
    hand.currentPlayerIndex = hand.activePlayerOrder.indexOf(canAct[0]);
    return;
  }

  // All players have acted — advance to next phase
  advancePhase(table, hand);
}

function advancePhase(table: TableState, hand: HandState): void {
  // Reset bets for new round
  for (const seat of table.seats) {
    seat.currentBet = 0;
    seat.hasActed = false;
  }
  hand.currentBet = 0;
  hand.minRaise = table.config.bigBlind;

  const playersInHand = getPlayersStillInHand(table);
  const playersCanAct = getPlayersWhoCanAct(table, hand);

  switch (hand.phase) {
    case 'preflop':
      hand.phase = 'flop';
      hand.currentBettingRound = 'flop';
      hand.communityCards.push(drawCard(hand), drawCard(hand), drawCard(hand));
      break;
    case 'flop':
      hand.phase = 'turn';
      hand.currentBettingRound = 'turn';
      hand.communityCards.push(drawCard(hand));
      break;
    case 'turn':
      hand.phase = 'river';
      hand.currentBettingRound = 'river';
      hand.communityCards.push(drawCard(hand));
      break;
    case 'river':
      // Go to showdown
      doShowdown(table, hand);
      return;
    default:
      return;
  }

  // Build new betting order for post-flop
  hand.activePlayerOrder = buildPostflopOrder(table, hand);
  hand.currentPlayerIndex = 0;

  // If no one can act (everyone all-in), keep advancing
  if (playersCanAct.length <= 1 && playersInHand.length > 1) {
    // Run out remaining community cards
    advancePhase(table, hand);
    return;
  }

  if (hand.activePlayerOrder.length === 0) {
    advancePhase(table, hand);
  }
}

function skipToShowdown(table: TableState, hand: HandState): void {
  // Deal out remaining community cards
  while (hand.communityCards.length < 5) {
    hand.communityCards.push(drawCard(hand));
  }
  hand.phase = 'river';
  hand.currentBettingRound = 'river';
  doShowdown(table, hand);
}

function doShowdown(table: TableState, hand: HandState): void {
  hand.phase = 'showdown';
  const playersInHand = getPlayersStillInHand(table);

  if (playersInHand.length === 1) {
    const winner = playersInHand[0];
    winner.stack += hand.pot;
    winner.agent!.handsWon++;
    hand.winners = [{
      agentId: winner.agent!.id,
      agentName: winner.agent!.name,
      amount: hand.pot,
      handName: 'Last player standing',
    }];
    hand.pot = 0;
    finishHand(table, hand);
    return;
  }

  // Calculate side pots
  const sidePots = calculateSidePots(table, hand);

  hand.winners = [];

  for (const pot of sidePots) {
    const eligible = playersInHand.filter(s => pot.eligibleAgentIds.includes(s.agent!.id));
    if (eligible.length === 0) continue;

    // Evaluate hands
    const evaluations = eligible.map(s => ({
      seat: s,
      evaluation: evaluateHand([...s.holeCards, ...hand.communityCards]),
    }));

    // Sort by hand strength (best first)
    evaluations.sort((a, b) => compareHands(b.evaluation, a.evaluation));

    // Find winners (could be a tie)
    const bestHand = evaluations[0].evaluation;
    const winners = evaluations.filter(e => compareHands(e.evaluation, bestHand) === 0);

    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;

    for (let i = 0; i < winners.length; i++) {
      const winAmount = share + (i === 0 ? remainder : 0);
      winners[i].seat.stack += winAmount;
      winners[i].seat.agent!.handsWon++;
      hand.winners.push({
        agentId: winners[i].seat.agent!.id,
        agentName: winners[i].seat.agent!.name,
        amount: winAmount,
        handName: winners[i].evaluation.name,
      });
    }
  }

  hand.pot = 0;
  finishHand(table, hand);
}

function calculateSidePots(table: TableState, hand: HandState): SidePot[] {
  const playersInHand = getPlayersStillInHand(table);

  // Collect all bets placed during the hand (from actions)
  // We compute total contributions from each player across all rounds
  const contributions = new Map<string, number>();
  for (const action of hand.actions) {
    if (action.action !== 'fold') {
      contributions.set(action.agentId, action.amount); // amount field stores cumulative bet for the round
    }
  }

  // Actually, let's use a simpler approach: compute from the total pot.
  // Reconstruct total bets per player from all actions.
  const totalBets = new Map<string, { total: number; seatNumber: number }>();
  const roundBets = new Map<string, number>();

  for (const action of hand.actions) {
    if (action.action === 'fold') continue;
    roundBets.set(`${action.agentId}_${action.round}`, action.amount);
  }

  // Sum up round bets for each player
  for (const [key, amount] of roundBets) {
    const agentId = key.split('_')[0];
    const seat = playersInHand.find(s => s.agent!.id === agentId)
      ?? table.seats.find(s => s.agent?.id === agentId);
    if (!totalBets.has(agentId)) {
      totalBets.set(agentId, { total: 0, seatNumber: seat?.seatNumber ?? 0 });
    }
    totalBets.get(agentId)!.total += amount;
  }

  // If no all-ins, single pot
  const allInPlayers = playersInHand.filter(s => s.isAllIn);
  if (allInPlayers.length === 0) {
    return [{
      amount: hand.pot,
      eligibleAgentIds: playersInHand.map(s => s.agent!.id),
    }];
  }

  // Build side pots
  const sortedContribs = Array.from(totalBets.entries())
    .map(([agentId, data]) => ({ agentId, ...data }))
    .sort((a, b) => a.total - b.total);

  const pots: SidePot[] = [];
  let prevLevel = 0;

  for (let i = 0; i < sortedContribs.length; i++) {
    const level = sortedContribs[i].total;
    if (level <= prevLevel) continue;

    const perPlayer = level - prevLevel;
    const eligible = sortedContribs.filter(c => c.total >= level).map(c => c.agentId);
    // All players who contributed at least up to this level
    const numContributors = sortedContribs.filter(c => c.total > prevLevel).length;
    const potAmount = perPlayer * numContributors;

    pots.push({ amount: potAmount, eligibleAgentIds: eligible });
    prevLevel = level;
  }

  // Adjust: make sure total of side pots equals hand.pot
  const totalSidePots = pots.reduce((sum, p) => sum + p.amount, 0);
  if (totalSidePots < hand.pot && pots.length > 0) {
    pots[pots.length - 1].amount += hand.pot - totalSidePots;
  }

  if (pots.length === 0) {
    return [{
      amount: hand.pot,
      eligibleAgentIds: playersInHand.map(s => s.agent!.id),
    }];
  }

  return pots;
}

function finishHand(table: TableState, hand: HandState): void {
  hand.phase = 'complete';
  hand.completedAt = Date.now();

  // Update hands played
  for (const seat of getActiveSeats(table)) {
    if (seat.agent) {
      seat.agent.handsPlayed++;
    }
  }

  // Remove players with 0 chips (they bust out)
  for (const seat of table.seats) {
    if (seat.agent && seat.stack <= 0 && !seat.isSittingOut) {
      // Auto re-buy for bots
      if (seat.agent.type !== 'human') {
        seat.stack = table.config.maxBuyIn;
        seat.buyIn += table.config.maxBuyIn;
      } else {
        seat.isSittingOut = true;
      }
    }
  }

  hand.sidePots = [];

  // Archive and clear
  archiveHand(table, { ...hand });
  table.currentHand = null;
}
