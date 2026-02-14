import { getDb } from './index';
import type { Agent, HandState } from '../poker/types';

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

    // 1. Upsert agents — use the DB function for atomic increment
    for (const snap of seatSnapshots) {
      const netProfit = snap.endingStack - snap.startingStack;
      const won = winnerIds.has(snap.agentId) ? 1 : 0;

      const { error } = await db.rpc('upsert_agent_stats', {
        p_id: snap.agentId,
        p_name: snap.agent.name,
        p_type: snap.agent.type,
        p_profit_delta: netProfit,
        p_hands_delta: 1,
        p_won_delta: won,
      });
      if (error) console.error('[db] Failed to upsert agent:', snap.agentId, error);
    }

    // 2. Insert hand
    const { error: handError } = await db.from('hands').insert({
      id: hand.id,
      table_id: tableId,
      hand_number: hand.handNumber,
      community_cards: hand.communityCards,
      pot_total: potTotal,
      side_pots: hand.sidePots.length > 0 ? hand.sidePots : null,
      dealer_seat_number: hand.dealerSeatNumber,
      sb_seat_number: hand.smallBlindSeatNumber,
      bb_seat_number: hand.bigBlindSeatNumber,
      winners: hand.winners,
      started_at: new Date(hand.startedAt).toISOString(),
      completed_at: new Date(hand.completedAt!).toISOString(),
    });
    if (handError) throw handError;

    // 3. Insert hand_players (batch)
    const playerRows = seatSnapshots.map((snap) => {
      const position = computePosition(
        snap.seatNumber,
        hand.dealerSeatNumber,
        hand.smallBlindSeatNumber,
        hand.bigBlindSeatNumber,
        activeSeatNumbers,
      );
      const isWinner = winnerIds.has(snap.agentId);
      return {
        hand_id: hand.id,
        agent_id: snap.agentId,
        seat_number: snap.seatNumber,
        position,
        hole_cards: snap.hasFolded ? null : snap.holeCards,
        starting_stack: snap.startingStack,
        ending_stack: snap.endingStack,
        net_profit: snap.endingStack - snap.startingStack,
        is_winner: isWinner,
        final_hand_name: isWinner ? (winnerHandNames.get(snap.agentId) ?? null) : null,
      };
    });

    const { error: playersError } = await db.from('hand_players').insert(playerRows);
    if (playersError) throw playersError;

    // 4. Insert hand_actions (batch)
    const actionRows = hand.actions.map((a, i) => ({
      hand_id: hand.id,
      agent_id: a.agentId,
      seat_number: a.seatNumber,
      action: a.action,
      amount: a.amount,
      round: a.round,
      sequence_number: i,
      action_timestamp: new Date(a.timestamp).toISOString(),
    }));

    if (actionRows.length > 0) {
      const { error: actionsError } = await db.from('hand_actions').insert(actionRows);
      if (actionsError) throw actionsError;
    }

    // 5. Insert chip_transactions for winners (batch)
    const txRows = hand.winners.map((w) => ({
      agent_id: w.agentId,
      table_id: tableId,
      hand_id: hand.id,
      type: 'pot_win',
      amount: w.amount,
    }));

    if (txRows.length > 0) {
      const { error: txError } = await db.from('chip_transactions').insert(txRows);
      if (txError) throw txError;
    }
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
    // Upsert agent (insert if new, ignore if exists)
    await db
      .from('agents')
      .upsert(
        {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          total_profit: 0,
          hands_played: 0,
          hands_won: 0,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );

    // Record buy-in transaction
    const { error } = await db.from('chip_transactions').insert({
      agent_id: agent.id,
      table_id: tableId,
      type: 'buy_in',
      amount: buyInAmount,
    });
    if (error) throw error;
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
    const { error } = await db.from('chip_transactions').insert({
      agent_id: agentId,
      table_id: tableId,
      type: 'cash_out',
      amount: cashOut,
    });
    if (error) throw error;
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
    const { error } = await db.from('chip_transactions').insert({
      agent_id: agentId,
      table_id: tableId,
      type: 'buy_in',
      amount: rebuyAmount,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[db] Failed to persist bot rebuy:', agentId, err);
  }
}
