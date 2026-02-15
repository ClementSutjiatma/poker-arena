'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import PokerTable from '@/components/PokerTable';
import Link from 'next/link';

interface TableData {
  config: { id: string; name: string; smallBlind: number; bigBlind: number; minBuyIn?: number; maxBuyIn?: number };
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
    turnDeadline: number | null;
    currentBet: number;
    minRaise: number;
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
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const [table, setTable] = useState<TableData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localAgentId, setLocalAgentId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(`poker_agent_${id}`) || null;
    }
    return null;
  });
  const [disconnected, setDisconnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(`poker_wallet_${id}`) || null;
    }
    return null;
  });
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundResult, setRefundResult] = useState<string | null>(null);

  // Persist agent ID and wallet to sessionStorage so it survives page refreshes
  useEffect(() => {
    if (localAgentId) {
      sessionStorage.setItem(`poker_agent_${id}`, localAgentId);
    } else {
      sessionStorage.removeItem(`poker_agent_${id}`);
    }
  }, [localAgentId, id]);

  useEffect(() => {
    if (walletAddress) {
      sessionStorage.setItem(`poker_wallet_${id}`, walletAddress);
    } else {
      sessionStorage.removeItem(`poker_wallet_${id}`);
    }
  }, [walletAddress, id]);

  const fetchTable = useCallback(async () => {
    try {
      const res = await fetch(`/api/tables/${id}`);
      if (res.ok) {
        const data: TableData = await res.json();
        setTable(data);
        setError(null);

        // If we have a localAgentId, verify the agent is still at the table
        if (localAgentId) {
          const stillSeated = data.seats.some(s => s.agent?.id === localAgentId);
          if (!stillSeated) {
            // Don't silently clear — show a disconnected state so the player knows
            setDisconnected(true);
          } else {
            setDisconnected(false);
          }
        }
      } else {
        setError('Table not found');
      }
    } catch {
      setError('Failed to load table');
    }
  }, [id, localAgentId]);

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

  const handleSit = (agent: { id: string; name: string }) => {
    setLocalAgentId(agent.id);
    // Store the wallet address so we can recover funds if disconnected
    if (embeddedWallet?.address) {
      setWalletAddress(embeddedWallet.address);
    }
  };

  const handleLeave = () => {
    setLocalAgentId(null);
    setWalletAddress(null);
    setDisconnected(false);
    setRefundResult(null);
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
      {disconnected && localAgentId && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-4 mb-4 text-center">
          <p className="text-red-400 text-sm font-medium mb-1">
            Connection to table lost
          </p>
          <p className="text-gray-400 text-xs mb-3">
            Your agent was removed from the table (likely due to a server restart).
            Your escrowed funds are safe in the smart contract.
          </p>
          {refundResult && (
            <p className="text-emerald-400 text-xs mb-3">{refundResult}</p>
          )}
          <div className="flex gap-2 justify-center">
            {walletAddress && !refundResult && (
              <button
                onClick={async () => {
                  setIsRefunding(true);
                  try {
                    const res = await fetch(`/api/tables/${id}/emergency-refund`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ walletAddress }),
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      setRefundResult(`Funds returned successfully! Tx: ${data.txHash?.slice(0, 10)}...`);
                    } else {
                      setRefundResult(data.error || 'Refund failed — contact support');
                    }
                  } catch {
                    setRefundResult('Network error — try again');
                  } finally {
                    setIsRefunding(false);
                  }
                }}
                disabled={isRefunding}
                className="px-4 py-1.5 text-xs font-medium bg-yellow-600/20 text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-600/30 transition cursor-pointer disabled:opacity-50"
              >
                {isRefunding ? 'Withdrawing...' : 'Withdraw Funds'}
              </button>
            )}
            <button
              onClick={() => {
                setLocalAgentId(null);
                setWalletAddress(null);
                setDisconnected(false);
                setRefundResult(null);
              }}
              className="px-4 py-1.5 text-xs font-medium bg-gray-600/20 text-gray-400 border border-gray-500/30 rounded-lg hover:bg-gray-600/30 transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <PokerTable
        table={table}
        onAddBot={handleAddBot}
        isAuthenticated={authenticated}
        onLogin={login}
        localAgentId={disconnected ? null : localAgentId}
        onSit={handleSit}
        onLeave={handleLeave}
      />
    </div>
  );
}
