import { ActionType, HandState, RANK_VALUES, Seat, TableState } from '../poker/types';

export type BotStrategy = 'house_fish' | 'house_tag' | 'house_lag';

interface BotDecision {
  action: ActionType;
  amount?: number;
}

/**
 * Make a decision for a bot based on its strategy.
 */
export function makeBotDecision(
  strategy: BotStrategy,
  seat: Seat,
  hand: HandState,
  table: TableState,
): BotDecision {
  switch (strategy) {
    case 'house_fish':
      return fishDecision(seat, hand, table);
    case 'house_tag':
      return tagDecision(seat, hand, table);
    case 'house_lag':
      return lagDecision(seat, hand, table);
    default:
      return { action: 'fold' };
  }
}

/**
 * house_fish: Calls most hands, rarely raises, never bluffs.
 * - Calls ~80% of the time
 * - Folds only with truly terrible hands
 * - Occasionally min-raises with strong hands
 */
function fishDecision(seat: Seat, hand: HandState, table: TableState): BotDecision {
  const toCall = hand.currentBet - seat.currentBet;
  const handStrength = getHandStrength(seat, hand);

  // If no bet to call, check most of the time, bet with strong hands
  if (toCall === 0) {
    if (handStrength > 0.8 && Math.random() < 0.3) {
      return { action: 'bet', amount: table.config.bigBlind };
    }
    return { action: 'check' };
  }

  // Fold only terrible hands (bottom 15%)
  if (handStrength < 0.15 && toCall > table.config.bigBlind * 2) {
    return { action: 'fold' };
  }

  // Raise very rarely, only with monster hands
  if (handStrength > 0.9 && Math.random() < 0.2) {
    const raiseAmount = hand.currentBet + hand.minRaise;
    return { action: 'raise', amount: raiseAmount };
  }

  // Call everything else
  return { action: 'call' };
}

/**
 * house_tag (tight-aggressive): Only plays strong hands, raises with premiums.
 * - Folds ~70% of hands preflop
 * - Raises aggressively with strong hands
 * - C-bets on flop when aggressive preflop
 */
function tagDecision(seat: Seat, hand: HandState, table: TableState): BotDecision {
  const toCall = hand.currentBet - seat.currentBet;
  const handStrength = getHandStrength(seat, hand);
  const isPreflop = hand.currentBettingRound === 'preflop';

  if (toCall === 0) {
    // No bet to call
    if (handStrength > 0.7) {
      const betSize = Math.max(table.config.bigBlind, Math.floor(hand.pot * 0.66));
      return { action: 'bet', amount: betSize };
    }
    if (handStrength > 0.4 && Math.random() < 0.3) {
      return { action: 'bet', amount: table.config.bigBlind };
    }
    return { action: 'check' };
  }

  // Fold weak hands
  if (isPreflop) {
    if (handStrength < 0.45) return { action: 'fold' };
  } else {
    if (handStrength < 0.35) return { action: 'fold' };
  }

  // Raise with strong hands
  if (handStrength > 0.75) {
    const raiseAmount = hand.currentBet + Math.max(hand.minRaise, Math.floor(hand.pot * 0.75));
    return { action: 'raise', amount: raiseAmount };
  }

  // Call with medium hands
  if (handStrength > 0.45 || (toCall <= table.config.bigBlind * 2 && handStrength > 0.3)) {
    return { action: 'call' };
  }

  return { action: 'fold' };
}

/**
 * house_lag (loose-aggressive): Raises often, bluffs frequently.
 * - Plays many hands
 * - Raises and re-raises frequently
 * - Bluffs about 30% of the time
 */
function lagDecision(seat: Seat, hand: HandState, table: TableState): BotDecision {
  const toCall = hand.currentBet - seat.currentBet;
  const handStrength = getHandStrength(seat, hand);
  const bluffRoll = Math.random();

  if (toCall === 0) {
    // Bet aggressively most of the time
    if (handStrength > 0.4 || bluffRoll < 0.35) {
      const betSize = Math.max(table.config.bigBlind, Math.floor(hand.pot * (0.5 + Math.random() * 0.5)));
      return { action: 'bet', amount: betSize };
    }
    return { action: 'check' };
  }

  // Fold only truly terrible hands against big bets
  if (handStrength < 0.15 && toCall > table.config.bigBlind * 4) {
    return { action: 'fold' };
  }

  // Re-raise frequently
  if (handStrength > 0.6 || bluffRoll < 0.25) {
    const raiseAmount = hand.currentBet + Math.max(hand.minRaise, Math.floor(hand.pot * 0.8));
    // Don't raise if already raised too many times this round (prevent infinite loops)
    const myRaisesThisRound = hand.actions.filter(
      a => a.agentId === seat.agent?.id && a.round === hand.currentBettingRound && (a.action === 'raise' || a.action === 'bet'),
    ).length;
    if (myRaisesThisRound < 2) {
      return { action: 'raise', amount: raiseAmount };
    }
  }

  // Call most other situations
  if (handStrength > 0.2 || bluffRoll < 0.4) {
    return { action: 'call' };
  }

  return { action: 'fold' };
}

/**
 * Estimate hand strength as a number 0–1.
 * Preflop: based on hole card ranks and suitedness.
 * Post-flop: simplified evaluation based on made hand.
 */
function getHandStrength(seat: Seat, hand: HandState): number {
  const [c1, c2] = seat.holeCards;
  if (!c1 || !c2) return 0.3;

  const r1 = RANK_VALUES[c1.rank];
  const r2 = RANK_VALUES[c2.rank];
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const suited = c1.suit === c2.suit;
  const pair = r1 === r2;

  if (hand.communityCards.length === 0) {
    // Preflop evaluation
    let strength = 0;

    if (pair) {
      strength = 0.5 + (high / 14) * 0.5; // Pairs: 0.57 (22) to 1.0 (AA)
    } else {
      strength = (high + low) / 28; // 0.14 (23) to 0.96 (AK)
      if (suited) strength += 0.05;
      if (high - low === 1) strength += 0.03; // Connectors
      if (high - low > 4) strength -= 0.05; // Gapped
    }

    return Math.max(0, Math.min(1, strength));
  }

  // Post-flop: quick evaluation
  const allCards = [...seat.holeCards, ...hand.communityCards];
  return postFlopStrength(allCards, seat.holeCards);
}

function postFlopStrength(allCards: typeof import('../poker/types').RANKS extends never ? never : { rank: string; suit: string }[], holeCards: typeof allCards): number {
  // Count matches
  const ranks = allCards.map(c => c.rank);
  const suits = allCards.map(c => c.suit);
  const holeRanks = holeCards.map(c => c.rank);

  // Check for pairs/trips/quads involving hole cards
  let maxGroup = 1;
  for (const hr of holeRanks) {
    const count = ranks.filter(r => r === hr).length;
    maxGroup = Math.max(maxGroup, count);
  }

  // Check for flush draw
  const suitCounts = new Map<string, number>();
  for (const s of suits) {
    suitCounts.set(s, (suitCounts.get(s) || 0) + 1);
  }
  const maxSuitCount = Math.max(...suitCounts.values());
  const hasFlushDraw = maxSuitCount >= 4;
  const hasFlush = maxSuitCount >= 5;

  let strength = 0.3;

  switch (maxGroup) {
    case 4: strength = 0.95; break;
    case 3: strength = 0.8; break;
    case 2: strength = 0.55; break;
    default: strength = 0.3; break;
  }

  // Count unique pairs
  const pairCount = new Map<string, number>();
  for (const r of ranks) {
    pairCount.set(r, (pairCount.get(r) || 0) + 1);
  }
  const pairs = Array.from(pairCount.values()).filter(c => c >= 2).length;
  if (pairs >= 2 && maxGroup < 3) strength = Math.max(strength, 0.65);

  if (hasFlush) strength = Math.max(strength, 0.85);
  else if (hasFlushDraw) strength = Math.max(strength, 0.5);

  // High card kicker
  const highCard = Math.max(RANK_VALUES[holeCards[0].rank as keyof typeof RANK_VALUES], RANK_VALUES[holeCards[1].rank as keyof typeof RANK_VALUES]);
  strength += (highCard / 14) * 0.1;

  return Math.max(0, Math.min(1, strength));
}

export const BOT_NAMES: Record<BotStrategy, string[]> = {
  house_fish: ['Nemo', 'Goldie', 'Bubbles', 'Flounder', 'Dory', 'Splash'],
  house_tag: ['Ivey', 'Hellmuth', 'Negreanu', 'Brunson', 'Ungar', 'Seidel'],
  house_lag: ['Gus', 'Durrr', 'Isildur', 'Blom', 'Laak', 'Esfandiari'],
};

let botCounter = 0;

export function createBotAgent(strategy: BotStrategy): { id: string; name: string; type: BotStrategy } {
  const names = BOT_NAMES[strategy];
  const name = names[botCounter % names.length];
  botCounter++;
  return {
    id: `bot_${strategy}_${Date.now()}_${botCounter}`,
    name,
    type: strategy,
  };
}
