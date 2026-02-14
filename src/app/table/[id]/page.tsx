'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import PokerTable from '@/components/PokerTable';
import Link from 'next/link';

interface TableData {
  config: { id: string; name: string; smallBlind: number; bigBlind: number };
  seats: {
    seatNumber: number;
    agent: { id: string; name: string; type: string } | null;
    stack: number;
    holeCards: { rank: string; suit: string }[];
    isSittingOut: boolean;
    currentBet: number;
    hasFolded: boolean;
    isAllIn: boolean;
  }[];
  currentHand: {
    handNumber: number;
    phase: string;
    communityCards: { rank: string; suit: string }[];
    pot: number;
    actions: {
      agentName: string;
      action: string;
      amount: number;
      round: string;
      timestamp: number;
    }[];
    currentTurnSeat: number | null;
    dealerSeatNumber: number;
    smallBlindSeatNumber: number;
    bigBlindSeatNumber: number;
    winners: { agentName: string; amount: number; handName: string }[];
  } | null;
  handCount: number;
}

export default function TablePage() {
  const params = useParams();
  const id = params.id as string;
  const { authenticated, login } = usePrivy();
  const [table, setTable] = useState<TableData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTable = useCallback(async () => {
    try {
      const res = await fetch(`/api/tables/${id}`);
      if (res.ok) {
        setTable(await res.json());
        setError(null);
      } else {
        setError('Table not found');
      }
    } catch {
      setError('Failed to load table');
    }
  }, [id]);

  useEffect(() => {
    fetchTable();
    const interval = setInterval(fetchTable, 1000);
    return () => clearInterval(interval);
  }, [fetchTable]);

  const handleAddBot = async (strategy: string) => {
    try {
      await fetch(`/api/tables/${id}/add-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy }),
      });
      fetchTable();
    } catch {
      // ignore
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-red-400 mb-4">{error}</p>
        <Link href="/" className="text-sm text-emerald-400 hover:underline">
          Back to Lobby
        </Link>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/" className="text-xs text-gray-500 hover:text-gray-300 transition">
          &larr; Back to Lobby
        </Link>
      </div>
      <PokerTable
        table={table}
        onAddBot={handleAddBot}
        isAuthenticated={authenticated}
        onLogin={login}
      />
    </div>
  );
}
