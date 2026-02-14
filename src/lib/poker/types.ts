// ============================================================
// Poker Arena — Core Types
// ============================================================

export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['h', 'd', 'c', 's'];

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  h: '♥', d: '♦', c: '♣', s: '♠',
};

export const RANK_DISPLAY: Record<Rank, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8',
  '9': '9', 'T': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};

// Hand rankings, higher = better
export enum HandRank {
  HIGH_CARD = 0,
  ONE_PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9,
}

export interface EvaluatedHand {
  rank: HandRank;
  /** Tiebreaker values, compared left to right (highest first). */
  values: number[];
  /** The best 5 cards. */
  cards: Card[];
  name: string;
}

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export interface HandAction {
  agentId: string;
  agentName: string;
  seatNumber: number;
  action: ActionType;
  amount: number;
  round: BettingRound;
  timestamp: number;
}

export type BettingRound = 'preflop' | 'flop' | 'turn' | 'river';

export interface Agent {
  id: string;
  name: string;
  type: 'human' | 'house_fish' | 'house_tag' | 'house_lag';
  totalProfit: number;
  handsPlayed: number;
  handsWon: number;
}

export interface Seat {
  seatNumber: number;
  agent: Agent | null;
  stack: number;
  holeCards: Card[];
  isSittingOut: boolean;
  currentBet: number;
  hasActed: boolean;
  hasFolded: boolean;
  isAllIn: boolean;
  /** The amount the agent bought in for initially. Used for profit calc. */
  buyIn: number;
}

export type HandPhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

export interface SidePot {
  amount: number;
  eligibleAgentIds: string[];
}

export interface HandState {
  id: string;
  handNumber: number;
  phase: HandPhase;
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  actions: HandAction[];
  currentBettingRound: BettingRound;
  /** Index into activePlayerOrder for whose turn it is. */
  currentPlayerIndex: number;
  /** Ordered seat numbers for the current betting round. */
  activePlayerOrder: number[];
  dealerSeatNumber: number;
  smallBlindSeatNumber: number;
  bigBlindSeatNumber: number;
  currentBet: number;
  minRaise: number;
  winners: { agentId: string; agentName: string; amount: number; handName: string }[];
  startedAt: number;
  completedAt: number | null;
  lastActionAt: number;
}

export interface TableConfig {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
}

export interface TableState {
  config: TableConfig;
  seats: Seat[];
  currentHand: HandState | null;
  handHistory: HandState[];
  handCount: number;
}

// API response types

export interface TableSummary {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  seatsOccupied: number;
  maxSeats: number;
  currentHandNumber: number | null;
  status: 'waiting' | 'playing';
  agents: { name: string; stack: number; seatNumber: number }[];
}

export interface LeaderboardEntry {
  rank: number;
  agentName: string;
  agentId: string;
  agentType: string;
  handsPlayed: number;
  handsWon: number;
  profit: number;
  winRate: number;
}
