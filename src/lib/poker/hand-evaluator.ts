import { Card, EvaluatedHand, HandRank, RANK_VALUES } from './types';

/**
 * Evaluate the best 5-card poker hand from any number of cards (typically 7).
 * Returns an EvaluatedHand with rank, tiebreaker values, best 5 cards, and name.
 */
export function evaluateHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    throw new Error(`Need at least 5 cards, got ${cards.length}`);
  }

  const combos = getCombinations(cards, 5);
  let best: EvaluatedHand | null = null;

  for (const combo of combos) {
    const evaluated = evaluate5(combo);
    if (!best || compareHands(evaluated, best) > 0) {
      best = evaluated;
    }
  }

  return best!;
}

/** Compare two evaluated hands. Returns >0 if a wins, <0 if b wins, 0 if tie. */
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
    const va = a.values[i] ?? 0;
    const vb = b.values[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

/** Evaluate exactly 5 cards. */
function evaluate5(cards: Card[]): EvaluatedHand {
  const sorted = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  const values = sorted.map(c => RANK_VALUES[c.rank]);

  const isFlush = sorted.every(c => c.suit === sorted[0].suit);
  const isStraight = checkStraight(values);
  const isAceLowStraight = checkAceLowStraight(values);

  // Group by rank for pairs/trips/quads
  const groups = getGroups(sorted);
  const groupCounts = groups.map(g => g.length);
  groupCounts.sort((a, b) => b - a);

  // Straight flush / Royal flush
  if (isFlush && isStraight) {
    if (values[0] === 14) {
      return { rank: HandRank.ROYAL_FLUSH, values: [14], cards: sorted, name: 'Royal Flush' };
    }
    return { rank: HandRank.STRAIGHT_FLUSH, values: [values[0]], cards: sorted, name: `Straight Flush (${sorted[0].rank} high)` };
  }
  if (isFlush && isAceLowStraight) {
    // A-2-3-4-5 straight flush; 5-high
    return { rank: HandRank.STRAIGHT_FLUSH, values: [5], cards: sorted, name: 'Straight Flush (5 high)' };
  }

  // Four of a kind
  if (groupCounts[0] === 4) {
    const quadRank = groups.find(g => g.length === 4)![0];
    const kicker = groups.find(g => g.length !== 4)![0];
    return { rank: HandRank.FOUR_OF_A_KIND, values: [RANK_VALUES[quadRank], RANK_VALUES[kicker]], cards: sorted, name: `Four of a Kind (${quadRank}s)` };
  }

  // Full house
  if (groupCounts[0] === 3 && groupCounts[1] === 2) {
    const tripRank = groups.find(g => g.length === 3)![0];
    const pairRank = groups.find(g => g.length === 2)![0];
    return { rank: HandRank.FULL_HOUSE, values: [RANK_VALUES[tripRank], RANK_VALUES[pairRank]], cards: sorted, name: `Full House (${tripRank}s full of ${pairRank}s)` };
  }

  // Flush
  if (isFlush) {
    return { rank: HandRank.FLUSH, values, cards: sorted, name: `Flush (${sorted[0].rank} high)` };
  }

  // Straight
  if (isStraight) {
    return { rank: HandRank.STRAIGHT, values: [values[0]], cards: sorted, name: `Straight (${sorted[0].rank} high)` };
  }
  if (isAceLowStraight) {
    return { rank: HandRank.STRAIGHT, values: [5], cards: sorted, name: 'Straight (5 high)' };
  }

  // Three of a kind
  if (groupCounts[0] === 3) {
    const tripRank = groups.find(g => g.length === 3)![0];
    const kickers = groups.filter(g => g.length === 1).map(g => RANK_VALUES[g[0]]).sort((a, b) => b - a);
    return { rank: HandRank.THREE_OF_A_KIND, values: [RANK_VALUES[tripRank], ...kickers], cards: sorted, name: `Three of a Kind (${tripRank}s)` };
  }

  // Two pair
  if (groupCounts[0] === 2 && groupCounts[1] === 2) {
    const pairs = groups.filter(g => g.length === 2).map(g => RANK_VALUES[g[0]]).sort((a, b) => b - a);
    const kicker = groups.find(g => g.length === 1)!;
    return { rank: HandRank.TWO_PAIR, values: [...pairs, RANK_VALUES[kicker[0]]], cards: sorted, name: `Two Pair (${pairName(pairs[0])}s and ${pairName(pairs[1])}s)` };
  }

  // One pair
  if (groupCounts[0] === 2) {
    const pairRank = groups.find(g => g.length === 2)![0];
    const kickers = groups.filter(g => g.length === 1).map(g => RANK_VALUES[g[0]]).sort((a, b) => b - a);
    return { rank: HandRank.ONE_PAIR, values: [RANK_VALUES[pairRank], ...kickers], cards: sorted, name: `Pair of ${pairRank}s` };
  }

  // High card
  return { rank: HandRank.HIGH_CARD, values, cards: sorted, name: `High Card (${sorted[0].rank})` };
}

function pairName(value: number): string {
  const entry = Object.entries(RANK_VALUES).find(([, v]) => v === value);
  return entry ? entry[0] : String(value);
}

function checkStraight(values: number[]): boolean {
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] - values[i + 1] !== 1) return false;
  }
  return true;
}

function checkAceLowStraight(values: number[]): boolean {
  // A-2-3-4-5: values would be [14, 5, 4, 3, 2]
  const aceLow = [14, 5, 4, 3, 2];
  return values.length === 5 && values.every((v, i) => v === aceLow[i]);
}

/** Group cards by rank, sorted by group size desc, then rank desc. */
function getGroups(cards: Card[]): Card['rank'][][] {
  const map = new Map<Card['rank'], Card['rank'][]>();
  for (const card of cards) {
    if (!map.has(card.rank)) map.set(card.rank, []);
    map.get(card.rank)!.push(card.rank);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return RANK_VALUES[b[0]] - RANK_VALUES[a[0]];
  });
}

/** Get all C(n,k) combinations. */
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const results: T[][] = [];
  const [first, ...rest] = arr;
  // Combinations that include first
  for (const combo of getCombinations(rest, k - 1)) {
    results.push([first, ...combo]);
  }
  // Combinations that exclude first
  for (const combo of getCombinations(rest, k)) {
    results.push(combo);
  }
  return results;
}
