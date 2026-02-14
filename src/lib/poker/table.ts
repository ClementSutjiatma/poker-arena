import { Agent, Seat, TableConfig, TableState, HandState } from './types';

export function createTable(config: TableConfig): TableState {
  const seats: Seat[] = [];
  for (let i = 0; i < config.maxSeats; i++) {
    seats.push(createEmptySeat(i));
  }
  return {
    config,
    seats,
    currentHand: null,
    handHistory: [],
    handCount: 0,
  };
}

export function createEmptySeat(seatNumber: number): Seat {
  return {
    seatNumber,
    agent: null,
    stack: 0,
    holeCards: [],
    isSittingOut: false,
    currentBet: 0,
    hasActed: false,
    hasFolded: false,
    isAllIn: false,
    buyIn: 0,
  };
}

export function seatAgent(table: TableState, seatNumber: number, agent: Agent, buyInAmount: number): boolean {
  if (seatNumber < 0 || seatNumber >= table.config.maxSeats) return false;
  const seat = table.seats[seatNumber];
  if (seat.agent !== null) return false;
  if (buyInAmount < table.config.minBuyIn || buyInAmount > table.config.maxBuyIn) return false;

  seat.agent = agent;
  seat.stack = buyInAmount;
  seat.buyIn = buyInAmount;
  seat.isSittingOut = false;
  seat.holeCards = [];
  seat.currentBet = 0;
  seat.hasActed = false;
  seat.hasFolded = false;
  seat.isAllIn = false;
  return true;
}

export function removeAgent(table: TableState, seatNumber: number): Agent | null {
  const seat = table.seats[seatNumber];
  if (!seat || !seat.agent) return null;

  const agent = seat.agent;
  // Update profit tracking
  agent.totalProfit += seat.stack - seat.buyIn;

  // Reset seat
  table.seats[seatNumber] = createEmptySeat(seatNumber);
  return agent;
}

export function getOccupiedSeats(table: TableState): Seat[] {
  return table.seats.filter(s => s.agent !== null);
}

export function getActiveSeats(table: TableState): Seat[] {
  return table.seats.filter(s => s.agent !== null && !s.isSittingOut);
}

/**
 * Find the next occupied, non-sitting-out seat after the given seat number,
 * going clockwise (ascending seat numbers, wrapping).
 */
export function getNextActiveSeat(table: TableState, afterSeat: number): number | null {
  const max = table.config.maxSeats;
  for (let i = 1; i <= max; i++) {
    const idx = (afterSeat + i) % max;
    const seat = table.seats[idx];
    if (seat.agent && !seat.isSittingOut) return idx;
  }
  return null;
}

/**
 * Advance dealer button to the next active seat.
 */
export function advanceDealerButton(table: TableState, currentDealer: number): number {
  return getNextActiveSeat(table, currentDealer) ?? 0;
}

export function archiveHand(table: TableState, hand: HandState): void {
  // Keep last 50 hands in history
  table.handHistory.push(hand);
  if (table.handHistory.length > 50) {
    table.handHistory.shift();
  }
}
