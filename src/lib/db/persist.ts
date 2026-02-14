import { sql } from 'drizzle-orm';
import { getDb } from './index';
import { agents, hands, handPlayers, handActions, chipTransactions } from './schema';
import type { Agent, HandState, TableState, Seat } from '../poker/types';

// ============================================================
// Position computation for a 6-max table
// ============================================================

function computePosition(
  seatNumber: number,
  dealerSeat: number,
  sbSeat: number,
  bbSeat: number,
  activeSeatNumbers: number[],
): string {
  if (seatNumber === dealerSeat) return 'D';
  if (seatNumber === sbSeat) return 'SB';
  if (seatNumber === bbSeat) return 'BB';

  // Remaining seats: order clockwise from BB to find UTG, MP, CO
  const remaining = activeSeatNumbers.filter(
    (s) => s !== dealerSeat && s !== sbSeat && s !== bbSeat,
  );
  // Sort clockwise from BB
  const maxSeats = 6;
  remaining.sort((a, b) => {
    const aOff = (a - bbSeat + maxSeats) % maxSeats;
    const bOff = (b - bbSeat + maxSeats) % maxSeats;
    return aOff - bOff;
  });

  const idx = remaining.indexOf(seatNumber);
  const labels = ['UTG', 'MP', 'CO'];
  return labels[idx] ?? 'UTG';
}

// ============================================================
// Persist a completed hand (fire-and-forget from finishHand)
// ============================================================

export async function persistCompletedHand(
  tableId: string,
  hand: HandState,
  seatSnapshots: { agentId: string; agent: Agent; seatNumber: number; startingStack: number; endingStack: number; holeCards: unknown[]; hasFolded: boolean }[],
): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    const potTotal = hand.winners.reduce((sum, w) => sum + w.amount, 0);
    const winnerIds = new Set(hand.winners.map((w) => w.agentId));
    const winnerHandNames = new Map(hand.winners.map((w) => [w.agentId, w.handName]));

    const activeSeatNumbers = seatSnapshots.map((s) => s.seatNumber);

    await db.transaction(async (tx) => {
      // 1. Upsert agents
      for (const snap of seatSnapshots) {
        const netProfit = snap.endingStack - snap.startingStack;
        const won = winnerIds.has(snap.agentId) ? 1 : 0;
        await tx
          .insert(agents)
          .values({
            id: snap.agentId,
            name: snap.agent.name,
            type: snap.agent.type,
            totalProfit: netProfit,
            handsPlayed: 1,
            handsWon: won,
          })
          .onConflictDoUpdate({
            target: agents.id,
            set: {
              totalProfit: sql`${agents.totalProfit} + ${netProfit}`,
              handsPlayed: sql`${agents.handsPlayed} + 1`,
              handsWon: sql`${agents.handsWon} + ${won}`,
              updatedAt: sql`now()`,
            },
          });
      }

      // 2. Insert hand
      await tx.insert(hands).values({
        id: hand.id,
        tableId,
        handNumber: hand.handNumber,
        communityCards: hand.communityCards,
        potTotal,
        sidePots: hand.sidePots.length > 0 ? hand.sidePots : null,
        dealerSeatNumber: hand.dealerSeatNumber,
        sbSeatNumber: hand.smallBlindSeatNumber,
        bbSeatNumber: hand.bigBlindSeatNumber,
        winners: hand.winners,
        startedAt: new Date(hand.startedAt),
        completedAt: new Date(hand.completedAt!),
      });

      // 3. Insert hand_players
      for (const snap of seatSnapshots) {
        const position = computePosition(
          snap.seatNumber,
          hand.dealerSeatNumber,
          hand.smallBlindSeatNumber,
          hand.bigBlindSeatNumber,
          activeSeatNumbers,
        );
        const isWinner = winnerIds.has(snap.agentId);
        await tx.insert(handPlayers).values({
          handId: hand.id,
          agentId: snap.agentId,
          seatNumber: snap.seatNumber,
          position,
          holeCards: snap.hasFolded ? null : (snap.holeCards as typeof handPlayers.$inferInsert['holeCards']),
          startingStack: snap.startingStack,
          endingStack: snap.endingStack,
          netProfit: snap.endingStack - snap.startingStack,
          isWinner,
          finalHandName: isWinner ? (winnerHandNames.get(snap.agentId) ?? null) : null,
        });
      }

      // 4. Insert hand_actions
      for (let i = 0; i < hand.actions.length; i++) {
        const a = hand.actions[i];
        await tx.insert(handActions).values({
          handId: hand.id,
          agentId: a.agentId,
          seatNumber: a.seatNumber,
          action: a.action,
          amount: a.amount,
          round: a.round,
          sequenceNumber: i,
          actionTimestamp: new Date(a.timestamp),
        });
      }

      // 5. Insert chip_transactions for winners
      for (const w of hand.winners) {
        await tx.insert(chipTransactions).values({
          agentId: w.agentId,
          tableId,
          handId: hand.id,
          type: 'pot_win',
          amount: w.amount,
        });
      }
    });
  } catch (err) {
    console.error('[db] Failed to persist hand:', hand.id, err);
  }
}

// ============================================================
// Persist sit-down (buy-in)
// ============================================================

export async function persistSitDown(
  agent: Agent,
  tableId: string,
  buyInAmount: number,
): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    // Upsert agent
    await db
      .insert(agents)
      .values({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        totalProfit: 0,
        handsPlayed: 0,
        handsWon: 0,
      })
      .onConflictDoNothing();

    // Record buy-in transaction
    await db.insert(chipTransactions).values({
      agentId: agent.id,
      tableId,
      type: 'buy_in',
      amount: buyInAmount,
    });
  } catch (err) {
    console.error('[db] Failed to persist sit-down:', agent.id, err);
  }
}

// ============================================================
// Persist leave (cash-out)
// ============================================================

export async function persistLeave(
  agentId: string,
  tableId: string,
  cashOut: number,
  totalProfit: number,
): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    // Record cash-out transaction
    await db.insert(chipTransactions).values({
      agentId,
      tableId,
      type: 'cash_out',
      amount: cashOut,
    });
  } catch (err) {
    console.error('[db] Failed to persist leave:', agentId, err);
  }
}

// ============================================================
// Persist bot re-buy
// ============================================================

export async function persistBotRebuy(
  agentId: string,
  tableId: string,
  rebuyAmount: number,
): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(chipTransactions).values({
      agentId,
      tableId,
      type: 'buy_in',
      amount: rebuyAmount,
    });
  } catch (err) {
    console.error('[db] Failed to persist bot rebuy:', agentId, err);
  }
}
