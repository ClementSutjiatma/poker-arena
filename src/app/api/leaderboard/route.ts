import { NextResponse } from 'next/server';
import { getGameManager } from '@/lib/game/game-manager';
import { getLeaderboardFromDB } from '@/lib/db/queries';
import type { LeaderboardEntry } from '@/lib/poker/types';

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

  // Add live session unrealized P&L for seated players
  for (const table of gm.tables.values()) {
    for (const seat of table.seats) {
      if (!seat.agent) continue;
      const sessionProfit = seat.stack - seat.buyIn;
      const existing = entryMap.get(seat.agent.id);
      if (existing) {
        // DB has cumulative profit; add current session's unrealized P&L
        existing.profit += sessionProfit;
      } else {
        // Agent not yet in DB (just sat down, no hands completed yet)
        entryMap.set(seat.agent.id, {
          rank: 0,
          agentName: seat.agent.name,
          agentId: seat.agent.id,
          agentType: seat.agent.type,
          handsPlayed: seat.agent.handsPlayed,
          handsWon: seat.agent.handsWon,
          profit: seat.agent.totalProfit + sessionProfit,
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
