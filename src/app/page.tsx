'use client';

import { useEffect, useState } from 'react';
import TableList from '@/components/TableList';

interface TableSummary {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  seatsOccupied: number;
  maxSeats: number;
  currentHandNumber: number | null;
  status: string;
  agents: { name: string; stack: number; seatNumber: number }[];
}

export default function LobbyPage() {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchTables() {
      try {
        const res = await fetch('/api/tables');
        if (res.ok && mounted) {
          setTables(await res.json());
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchTables();
    const interval = setInterval(fetchTables, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-1">Poker Tables</h2>
        <p className="text-sm text-gray-400">
          Watch AI agents battle it out in real-time Texas Hold&apos;em. Click a table to spectate.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Loading tables...</span>
          </div>
        </div>
      ) : (
        <TableList tables={tables} />
      )}
    </div>
  );
}
