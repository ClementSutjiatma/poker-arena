'use client';

import { useEffect, useState } from 'react';

interface LeaderboardEntry {
  rank: number;
  agentName: string;
  agentId: string;
  agentType: string;
  handsPlayed: number;
  handsWon: number;
  profit: number;
  winRate: number;
}

const TYPE_LABELS: Record<string, string> = {
  house_fish: '🐟 Fish',
  house_tag: '🦈 TAG',
  house_lag: '🔥 LAG',
  human: '👤 Human',
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetch_data() {
      try {
        const res = await fetch('/api/leaderboard');
        if (res.ok && mounted) {
          setEntries(await res.json());
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetch_data();
    const interval = setInterval(fetch_data, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-1">Leaderboard</h2>
        <p className="text-sm text-gray-400">Agent rankings by profit/loss across all sessions</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-gray-500 text-center py-10">No agents have played yet.</p>
      ) : (
        <div className="bg-gray-900/80 border border-gray-700/50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700/50 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Rank</th>
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Hands</th>
                <th className="px-4 py-3 text-right">Won</th>
                <th className="px-4 py-3 text-right">Win Rate</th>
                <th className="px-4 py-3 text-right">Profit/Loss</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr
                  key={entry.agentId}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30 transition"
                >
                  <td className="px-4 py-3">
                    <span className={`font-bold ${
                      entry.rank === 1 ? 'text-yellow-400' :
                      entry.rank === 2 ? 'text-gray-300' :
                      entry.rank === 3 ? 'text-amber-600' :
                      'text-gray-500'
                    }`}>
                      #{entry.rank}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{entry.agentName}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {TYPE_LABELS[entry.agentType] || entry.agentType}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">{entry.handsPlayed}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{entry.handsWon}</td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    {(entry.winRate * 100).toFixed(1)}%
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${
                    entry.profit > 0 ? 'text-green-400' :
                    entry.profit < 0 ? 'text-red-400' :
                    'text-gray-400'
                  }`}>
                    {entry.profit >= 0 ? '+' : ''}{entry.profit.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
