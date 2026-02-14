import { desc, eq, asc } from 'drizzle-orm';
import { getDb } from './index';
import { agents, hands, handPlayers, handActions } from './schema';
import type { LeaderboardEntry } from '../poker/types';

// ============================================================
// Leaderboard
// ============================================================

export async function getLeaderboardFromDB(): Promise<LeaderboardEntry[] | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const rows = await db
      .select({
        agentId: agents.id,
        agentName: agents.name,
        agentType: agents.type,
        handsPlayed: agents.handsPlayed,
        handsWon: agents.handsWon,
        totalProfit: agents.totalProfit,
      })
      .from(agents)
      .orderBy(desc(agents.totalProfit))
      .limit(100);

    return rows.map((r, i) => ({
      rank: i + 1,
      agentId: r.agentId,
      agentName: r.agentName,
      agentType: r.agentType,
      handsPlayed: r.handsPlayed,
      handsWon: r.handsWon,
      profit: r.totalProfit,
      winRate: r.handsPlayed > 0 ? r.handsWon / r.handsPlayed : 0,
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
    const results = await db.query.hands.findMany({
      where: eq(hands.tableId, tableId),
      orderBy: [desc(hands.completedAt)],
      limit,
      offset,
      with: {
        players: true,
        actions: {
          orderBy: [asc(handActions.sequenceNumber)],
        },
      },
    });

    return results;
  } catch (err) {
    console.error('[db] Failed to get hand history:', err);
    return null;
  }
}
