'use client';

import { useState } from 'react';

interface CashOutButtonProps {
  tableId: string;
  agentId: string;
  stack: number;
  onSuccess: () => void;
}

export default function CashOutButton({ tableId, agentId, stack, onSuccess }: CashOutButtonProps) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ cashOut?: number; txHash?: string; error?: string; settlementError?: string }>({});

  const handleCashOut = async () => {
    setStatus('pending');
    try {
      const res = await fetch(`/api/tables/${tableId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setResult({ error: data.error });
        return;
      }
      // Check if settlement succeeded — the API may return success for
      // the game-engine leave but report a settlement failure separately.
      if (data.settlementError) {
        setStatus('error');
        setResult({ error: data.settlementError });
        onSuccess(); // Still leave the table (game engine already removed player)
        return;
      }
      setStatus('done');
      setResult({ cashOut: data.cashOut, txHash: data.txHash });
      onSuccess();
    } catch (err) {
      setStatus('error');
      setResult({ error: err instanceof Error ? err.message : 'Network error' });
    }
  };

  if (status === 'done') {
    return (
      <div className="text-center p-2">
        <p className="text-emerald-400 text-sm font-medium">
          Cashed out {result.cashOut} aUSD
        </p>
        {result.txHash && (
          <a
            href={`https://explore.tempo.xyz/tx/${result.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-500 hover:text-gray-300 underline"
          >
            View tx
          </a>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="text-center p-2">
        <p className="text-red-400 text-xs">{result.error}</p>
        <button
          onClick={handleCashOut}
          className="text-xs text-gray-400 hover:text-white mt-1 underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleCashOut}
      disabled={status === 'pending'}
      className="px-3 py-1.5 text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {status === 'pending' ? 'Settling...' : `Cash Out (${stack} aUSD)`}
    </button>
  );
}
