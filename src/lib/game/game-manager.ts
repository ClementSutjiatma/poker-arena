import { Agent, TableConfig, TableState, TableSummary, LeaderboardEntry } from '../poker/types';
import { createTable, getActiveSeats, getOccupiedSeats, seatAgent, removeAgent } from '../poker/table';
import { startHand, processAction, getCurrentTurnSeat, completeShowdown } from '../poker/hand-manager';
import { makeBotDecision, createBotAgent, BotStrategy } from './auto-players';
import { persistSitDown, persistLeave } from '../db/persist';
import { getMaxHandNumber } from '../db/queries';

const DEFAULT_TABLES: TableConfig[] = [
  { id: 'micro', name: 'Micro Stakes', smallBlind: 1, bigBlind: 2, minBuyIn: 40, maxBuyIn: 200, maxSeats: 6 },
  { id: 'low', name: 'Low Stakes', smallBlind: 5, bigBlind: 10, minBuyIn: 200, maxBuyIn: 1000, maxSeats: 6 },
  { id: 'mid', name: 'Mid Stakes', smallBlind: 25, bigBlind: 50, minBuyIn: 1000, maxBuyIn: 5000, maxSeats: 6 },
  { id: 'high', name: 'High Rollers', smallBlind: 100, bigBlind: 200, minBuyIn: 4000, maxBuyIn: 20000, maxSeats: 6 },
];

const TURN_TIMEOUT_MS = 30_000;
const BOT_DELAY_MS = 800;
const BOT_ONLY_DELAY_MS = 0;
const SHOWDOWN_DISPLAY_MS = 3_000;
const BOT_ONLY_SHOWDOWN_MS = 300;

/**
 * Check if a table has only bots (no human players seated).
 */
function isTableBotOnly(table: TableState): boolean {
  const occupied = getOccupiedSeats(table);
  return occupied.length > 0 && occupied.every(s => s.agent!.type !== 'human');
}

class GameManager {
  tables: Map<string, TableState> = new Map();
  agents: Map<string, Agent> = new Map();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Create default tables
    for (const config of DEFAULT_TABLES) {
      this.tables.set(config.id, createTable(config));
    }

    // Seed bots on each table
    this.seedBots();

    // Restore hand counts from DB (fire-and-forget — game runs fine without it)
    this.restoreHandCounts();

    // Start game loop
    this.startGameLoop();
  }

  private seedBots(): void {
    const strategies: BotStrategy[] = ['house_fish', 'house_tag', 'house_lag'];

    for (const [, table] of this.tables) {
      // Add 2-3 random bots per table
      const numBots = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < numBots; i++) {
        const strategy = strategies[i % strategies.length];
        const bot = createBotAgent(strategy);
        const agent: Agent = {
          id: bot.id,
          name: bot.name,
          type: bot.type,
          totalProfit: 0,
          handsPlayed: 0,
          handsWon: 0,
        };
        this.agents.set(agent.id, agent);
        seatAgent(table, i, agent, table.config.maxBuyIn);
      }
    }
  }

  private async restoreHandCounts(): Promise<void> {
    try {
      const counts = await getMaxHandNumber();
      if (!counts) return;

      for (const [tableId, maxHandNumber] of Object.entries(counts)) {
        const table = this.tables.get(tableId);
        if (table && maxHandNumber > table.handCount) {
          table.handCount = maxHandNumber;
          console.log(`[game] Restored hand count for table ${tableId}: ${maxHandNumber}`);
        }
      }
    } catch (err) {
      console.error('[game] Failed to restore hand counts:', err);
    }
  }

  private startGameLoop(): void {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => this.tick(), 500);
  }

  private tick(): void {
    for (const [tableId, table] of this.tables) {
      try {
        this.processTable(table);
      } catch (err) {
        console.error(`[game] Error processing table ${tableId}:`, err);
        // If a hand got stuck, clear it so the next hand can start
        if (table.currentHand && table.currentHand.phase !== 'showdown') {
          console.error(`[game] Clearing stuck hand ${table.currentHand.id} on table ${tableId}`);
          table.currentHand = null;
        }
      }
    }
  }

  /**
   * Process a single table tick. In bot-only mode, recursively processes
   * all bot actions within a single tick for speed (up to MAX_BOT_ACTIONS_PER_TICK).
   */
  private processTable(table: TableState, depth = 0): void {
    const activeSeats = getActiveSeats(table);
    const botOnly = isTableBotOnly(table);
    const MAX_BOT_ACTIONS_PER_TICK = 50;

    // If no hand is active, start one if we have enough players
    if (!table.currentHand) {
      if (activeSeats.length >= 2) {
        try {
          startHand(table);
          // In bot-only mode, immediately start processing the new hand
          if (botOnly && depth < MAX_BOT_ACTIONS_PER_TICK) {
            this.processTable(table, depth + 1);
          }
        } catch {
          // Not enough players or other issue
        }
      }
      return;
    }

    const hand = table.currentHand;
    if (!hand || hand.phase === 'complete') {
      return;
    }

    // Showdown phase: wait for display delay, then complete the hand
    if (hand.phase === 'showdown') {
      const showdownDelay = botOnly ? BOT_ONLY_SHOWDOWN_MS : SHOWDOWN_DISPLAY_MS;
      const elapsed = Date.now() - hand.lastActionAt;
      if (elapsed >= showdownDelay) {
        completeShowdown(table, hand);
        // In bot-only mode, immediately start the next hand
        if (botOnly && depth < MAX_BOT_ACTIONS_PER_TICK) {
          this.processTable(table, depth + 1);
        }
      }
      return;
    }

    const currentSeat = getCurrentTurnSeat(hand);
    if (currentSeat === null) return;

    const seat = table.seats[currentSeat];
    if (!seat.agent) return;

    const now = Date.now();
    const timeSinceLastAction = now - hand.lastActionAt;

    // Bot auto-play
    if (seat.agent.type !== 'human') {
      const delay = botOnly ? BOT_ONLY_DELAY_MS : BOT_DELAY_MS;
      if (timeSinceLastAction >= delay) {
        const decision = makeBotDecision(
          seat.agent.type as BotStrategy,
          seat,
          hand,
          table,
        );
        let success = processAction(table, hand, currentSeat, decision.action, decision.amount);

        // If the bot's chosen action was rejected, fall back to check or fold
        if (!success) {
          const toCall = hand.currentBet - seat.currentBet;
          if (toCall > 0) {
            success = processAction(table, hand, currentSeat, 'fold');
          } else {
            success = processAction(table, hand, currentSeat, 'check');
          }
        }

        // Safety: if even the fallback fails, force-fold to prevent permanent hang
        if (!success) {
          console.error(
            `[game] Bot ${seat.agent.name} stuck at table ${table.config.id}, hand ${hand.id} — force-folding`
          );
          seat.hasFolded = true;
          seat.hasActed = true;
          hand.lastActionAt = Date.now();
        }

        // In bot-only mode, process multiple actions per tick for speed
        if (botOnly && depth < MAX_BOT_ACTIONS_PER_TICK) {
          this.processTable(table, depth + 1);
        }
      }
      return;
    }

    // Human timeout: auto-fold/check after 30 seconds
    if (timeSinceLastAction >= TURN_TIMEOUT_MS) {
      const toCall = hand.currentBet - seat.currentBet;
      if (toCall > 0) {
        processAction(table, hand, currentSeat, 'fold');
      } else {
        processAction(table, hand, currentSeat, 'check');
      }
    }
  }

  // Public API methods

  getTableSummaries(): TableSummary[] {
    const summaries: TableSummary[] = [];
    for (const [, table] of this.tables) {
      const occupied = table.seats.filter(s => s.agent !== null);
      summaries.push({
        id: table.config.id,
        name: table.config.name,
        smallBlind: table.config.smallBlind,
        bigBlind: table.config.bigBlind,
        seatsOccupied: occupied.length,
        maxSeats: table.config.maxSeats,
        currentHandNumber: table.currentHand?.handNumber ?? null,
        status: table.currentHand && table.currentHand.phase !== 'complete' ? 'playing' : 'waiting',
        agents: occupied.map(s => ({
          name: s.agent!.name,
          stack: s.stack,
          seatNumber: s.seatNumber,
        })),
      });
    }
    return summaries;
  }

  getTable(id: string): TableState | undefined {
    return this.tables.get(id);
  }

  sitAgent(tableId: string, seatNumber: number, agentName: string, buyInAmount: number, privyUserId?: string, walletAddress?: string): { success: boolean; error?: string; agent?: Agent } {
    const table = this.tables.get(tableId);
    if (!table) return { success: false, error: 'Table not found' };

    // Use Privy user ID for deterministic, non-guessable agent IDs when available
    const agentId = privyUserId
      ? `agent_${privyUserId}_${Date.now()}`
      : `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const agent: Agent = {
      id: agentId,
      name: agentName,
      type: 'human',
      totalProfit: 0,
      handsPlayed: 0,
      handsWon: 0,
      walletAddress,
    };

    if (!seatAgent(table, seatNumber, agent, buyInAmount)) {
      return { success: false, error: 'Invalid seat, already occupied, or invalid buy-in' };
    }

    this.agents.set(agent.id, agent);
    persistSitDown(agent, tableId, buyInAmount).catch(() => {});
    return { success: true, agent };
  }

  addBot(tableId: string, strategy: BotStrategy): { success: boolean; error?: string } {
    const table = this.tables.get(tableId);
    if (!table) return { success: false, error: 'Table not found' };

    // Find empty seat
    const emptySeat = table.seats.find(s => s.agent === null);
    if (!emptySeat) return { success: false, error: 'Table is full' };

    const bot = createBotAgent(strategy);
    const agent: Agent = {
      id: bot.id,
      name: bot.name,
      type: bot.type,
      totalProfit: 0,
      handsPlayed: 0,
      handsWon: 0,
    };
    this.agents.set(agent.id, agent);
    seatAgent(table, emptySeat.seatNumber, agent, table.config.maxBuyIn);
    persistSitDown(agent, tableId, table.config.maxBuyIn).catch(() => {});
    return { success: true };
  }

  standAgent(tableId: string, agentId: string): { success: boolean; error?: string } {
    const table = this.tables.get(tableId);
    if (!table) return { success: false, error: 'Table not found' };
    const seat = table.seats.find(s => s.agent?.id === agentId);
    if (!seat) return { success: false, error: 'Agent not at this table' };
    seat.isSittingOut = true;
    return { success: true };
  }

  resumeAgent(tableId: string, agentId: string): { success: boolean; error?: string } {
    const table = this.tables.get(tableId);
    if (!table) return { success: false, error: 'Table not found' };
    const seat = table.seats.find(s => s.agent?.id === agentId);
    if (!seat) return { success: false, error: 'Agent not at this table' };
    seat.isSittingOut = false;
    return { success: true };
  }

  leaveAgent(tableId: string, agentId: string): { success: boolean; error?: string; cashOut?: number; walletAddress?: string } {
    const table = this.tables.get(tableId);
    if (!table) return { success: false, error: 'Table not found' };
    const seat = table.seats.find(s => s.agent?.id === agentId);
    if (!seat) return { success: false, error: 'Agent not at this table' };

    // Can't leave mid-hand if not folded
    if (table.currentHand && table.currentHand.phase !== 'complete' && !seat.hasFolded && !seat.isSittingOut) {
      seat.hasFolded = true;
    }

    const cashOut = seat.stack;
    const walletAddress = seat.agent?.walletAddress;
    const agent = removeAgent(table, seat.seatNumber);
    if (agent) {
      persistLeave(agent.id, tableId, cashOut, agent.totalProfit).catch(() => {});
    }
    return { success: true, cashOut, walletAddress };
  }

  rebuyAgent(tableId: string, agentId: string, amount: number): { success: boolean; error?: string; newStack?: number } {
    const table = this.tables.get(tableId);
    if (!table) return { success: false, error: 'Table not found' };
    const seat = table.seats.find(s => s.agent?.id === agentId);
    if (!seat || !seat.agent) return { success: false, error: 'Agent not at this table' };

    // Can't rebuy mid-hand
    if (table.currentHand && table.currentHand.phase !== 'complete' && !seat.hasFolded && !seat.isSittingOut) {
      return { success: false, error: 'Cannot rebuy during an active hand' };
    }

    // Enforce max buy-in cap
    if (seat.stack + amount > table.config.maxBuyIn) {
      return { success: false, error: `Rebuy would exceed max buy-in of ${table.config.maxBuyIn}` };
    }

    seat.stack += amount;
    seat.buyIn += amount;
    return { success: true, newStack: seat.stack };
  }

  submitAction(tableId: string, agentId: string, action: string, amount?: number): { success: boolean; error?: string } {
    const table = this.tables.get(tableId);
    if (!table) return { success: false, error: 'Table not found' };
    if (!table.currentHand) return { success: false, error: 'No active hand' };

    const seat = table.seats.find(s => s.agent?.id === agentId);
    if (!seat) return { success: false, error: 'Agent not at this table' };

    const validActions = ['fold', 'check', 'call', 'bet', 'raise', 'all-in'];
    if (!validActions.includes(action)) return { success: false, error: 'Invalid action' };

    const success = processAction(table, table.currentHand, seat.seatNumber, action as any, amount);
    if (!success) return { success: false, error: 'Action not allowed' };

    return { success: true };
  }

  getLeaderboard(): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];
    for (const [, agent] of this.agents) {
      entries.push({
        rank: 0,
        agentName: agent.name,
        agentId: agent.id,
        agentType: agent.type,
        handsPlayed: agent.handsPlayed,
        handsWon: agent.handsWon,
        profit: agent.totalProfit,
        winRate: agent.handsPlayed > 0 ? agent.handsWon / agent.handsPlayed : 0,
      });
    }

    // Also add seated agents' current session profit
    for (const [, table] of this.tables) {
      for (const seat of table.seats) {
        if (seat.agent) {
          const entry = entries.find(e => e.agentId === seat.agent!.id);
          if (entry) {
            entry.profit = seat.agent.totalProfit + (seat.stack - seat.buyIn);
          }
        }
      }
    }

    entries.sort((a, b) => b.profit - a.profit);
    entries.forEach((e, i) => (e.rank = i + 1));
    return entries;
  }
}

// Singleton — survives across Next.js serverless invocations in dev
declare global {
  // eslint-disable-next-line no-var
  var __gameManager: GameManager | undefined;
}

export function getGameManager(): GameManager {
  if (!global.__gameManager) {
    global.__gameManager = new GameManager();
    global.__gameManager.init();
  }
  return global.__gameManager;
}
