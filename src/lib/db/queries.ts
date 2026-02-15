import { getDb } from './index';
import type { LeaderboardEntry } from '../poker/types';

// ============================================================
// Hand count restoration
// ============================================================

/**
 * Get the max hand_number for each table_id so we can resume
 * hand counting from the right place after a server restart.
 */
export async function getMaxHandNumber(): Promise<Record<string, number> | null> {
  const db = getDb();
  if (!db) return null;

  try {
    // Supabase doesn't support GROUP BY directly via the query builder,
    // so we fetch the max hand_number per table_id using RPC or a simple query.
    // We query the most recent hand per table to get the max hand_number.
    const { data, error } = await db
      .from('hands')
      .select('table_id, hand_number')
      .order('hand_number', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return {};

    // Extract max hand_number per table_id
    const result: Record<string, number> = {};
    for (const row of data) {
      const tableId = row.table_id;
      const handNumber = row.hand_number;
      if (!result[tableId] || handNumber > result[tableId]) {
        result[tableId] = handNumber;
      }
    }
    return result;
  } catch (err) {
    console.error('[db] Failed to get max hand numbers:', err);
    return null;
  }
}

// ============================================================
// Leaderboard
// ============================================================

export async function getLeaderboardFromDB(): Promise<LeaderboardEntry[] | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const { data, error } = await db
      .from('agents')
      .select('id, name, type, hands_played, hands_won, total_profit')
      .order('total_profit', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!data) return null;

    return data.map((r, i) => ({
      rank: i + 1,
      agentId: r.id,
      agentName: r.name,
      agentType: r.type,
      handsPlayed: r.hands_played,
      handsWon: r.hands_won,
      profit: r.total_profit,
      winRate: r.hands_played > 0 ? r.hands_won / r.hands_played : 0,
    }));
  } catch (err) {
    console.error('[db] Failed to get leaderboard:', err);
    return null;
  }
}

// ============================================================
// Hand History
// ============================================================

export async function getHandHistoryFromDB(
  tableId: string,
  limit = 50,
  offset = 0,
) {
  const db = getDb();
  if (!db) return null;

  try {
    // Fetch hands for this table
    const { data: handsData, error: handsError } = await db
      .from('hands')
      .select('*')
      .eq('table_id', tableId)
      .order('completed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (handsError) throw handsError;
    if (!handsData || handsData.length === 0) return [];

    const handIds = handsData.map((h) => h.id);

    // Fetch players and actions for these hands in parallel
    const [playersResult, actionsResult] = await Promise.all([
      db
        .from('hand_players')
        .select('*')
        .in('hand_id', handIds),
      db
        .from('hand_actions')
        .select('*')
        .in('hand_id', handIds)
        .order('sequence_number', { ascending: true }),
    ]);

    if (playersResult.error) throw playersResult.error;
    if (actionsResult.error) throw actionsResult.error;

    // Group players and actions by hand_id
    const playersByHand = new Map<string, typeof playersResult.data>();
    for (const p of playersResult.data ?? []) {
      const list = playersByHand.get(p.hand_id) ?? [];
      list.push(p);
      playersByHand.set(p.hand_id, list);
    }

    const actionsByHand = new Map<string, typeof actionsResult.data>();
    for (const a of actionsResult.data ?? []) {
      const list = actionsByHand.get(a.hand_id) ?? [];
      list.push(a);
      actionsByHand.set(a.hand_id, list);
    }

    // Assemble results matching the shape Drizzle used to return
    return handsData.map((h) => ({
      ...h,
      // Map snake_case DB columns to camelCase for compatibility
      tableId: h.table_id,
      handNumber: h.hand_number,
      communityCards: h.community_cards,
      potTotal: h.pot_total,
      sidePots: h.side_pots,
      dealerSeatNumber: h.dealer_seat_number,
      sbSeatNumber: h.sb_seat_number,
      bbSeatNumber: h.bb_seat_number,
      startedAt: h.started_at,
      completedAt: h.completed_at,
      players: (playersByHand.get(h.id) ?? []).map((p) => ({
        ...p,
        handId: p.hand_id,
        agentId: p.agent_id,
        seatNumber: p.seat_number,
        holeCards: p.hole_cards,
        startingStack: p.starting_stack,
        endingStack: p.ending_stack,
        netProfit: p.net_profit,
        isWinner: p.is_winner,
        finalHandName: p.final_hand_name,
      })),
      actions: (actionsByHand.get(h.id) ?? []).map((a) => ({
        ...a,
        handId: a.hand_id,
        agentId: a.agent_id,
        seatNumber: a.seat_number,
        sequenceNumber: a.sequence_number,
        actionTimestamp: a.action_timestamp,
      })),
    }));
  } catch (err) {
    console.error('[db] Failed to get hand history:', err);
    return null;
  }
}
