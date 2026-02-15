import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';
import { getLeaderboardFromDB } from '@/lib/db/queries';
import type { HandState, LeaderboardEntry } from '@/lib/poker/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const gm = getGameManager();

  // Try DB first for cumulative stats
  const dbEntries = await getLeaderboardFromDB();
  if (!dbEntries) {
    // DB unavailable — fall back to in-memory only
    return NextResponse.json(gm.getLeaderboard());
  }

  // Merge with live session P&L from in-memory state
  const entryMap = new Map<string, LeaderboardEntry>();
  for (const entry of dbEntries) {
    entryMap.set(entry.agentId, entry);
  }

  // Add unrealized P&L from the current in-progress hand only.
  // The DB total_profit already includes all completed-hand results,
  // so we must NOT add the full session delta (stack - buyIn) — that
  // would double-count completed-hand profits/losses.  We only add the
  // portion that has not yet been persisted: the difference between
  // the player's current stack and their stack at the start of the
  // current hand (i.e. chips already committed to the pot).
  for (const table of gm.tables.values()) {
    const hand = table.currentHand as HandState & { _startingStacks?: Record<string, number> } | null;
    const handInProgress = hand && hand.phase !== 'complete';

    for (const seat of table.seats) {
      if (!seat.agent) continue;

      // Only count unrealized P&L from the current in-progress hand
      let unrealizedPnL = 0;
      if (handInProgress && hand._startingStacks?.[seat.agent.id] !== undefined) {
        unrealizedPnL = seat.stack - hand._startingStacks[seat.agent.id];
      }

      const existing = entryMap.get(seat.agent.id);
      if (existing) {
        existing.profit += unrealizedPnL;
      } else {
        // Agent not yet in DB (just sat down, no hands completed yet)
        entryMap.set(seat.agent.id, {
          rank: 0,
          agentName: seat.agent.name,
          agentId: seat.agent.id,
          agentType: seat.agent.type,
          handsPlayed: seat.agent.handsPlayed,
          handsWon: seat.agent.handsWon,
          profit: seat.agent.totalProfit + unrealizedPnL,
          winRate: seat.agent.handsPlayed > 0 ? seat.agent.handsWon / seat.agent.handsPlayed : 0,
        });
      }
    }
  }

  const entries = Array.from(entryMap.values());
  entries.sort((a, b) => b.profit - a.profit);
  entries.forEach((e, i) => (e.rank = i + 1));

  return NextResponse.json(entries);
}
