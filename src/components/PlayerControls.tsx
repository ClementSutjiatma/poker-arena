'use client';

import { useState } from 'react';
import CashOutButton from './CashOutButton';

interface PlayerControlsProps {
  tableId: string;
  agentId: string;
  stack: number;
  /** Current amount player needs to call (0 if can check). */
  toCall: number;
  /** Current bet to match. */
  currentBet: number;
  /** Big blind size. */
  bigBlind: number;
  /** Minimum raise amount. */
  minRaise: number;
  /** Whether it's this player's turn. */
  isMyTurn: boolean;
  /** Whether the player is in an active hand. */
  isInHand: boolean;
  /** Whether the hand phase is complete/waiting. */
  isBetweenHands: boolean;
  /** Current table max buy-in. */
  maxBuyIn: number;
  onAction: (action: string, amount?: number) => void;
  onLeave: () => void;
  onRebuy: () => void;
}

export default function PlayerControls({
  tableId,
  agentId,
  stack,
  toCall,
  currentBet,
  bigBlind,
  minRaise,
  isMyTurn,
  isInHand,
  isBetweenHands,
  maxBuyIn,
  onAction,
  onLeave,
  onRebuy,
}: PlayerControlsProps) {
  const [raiseAmount, setRaiseAmount] = useState(minRaise);
  const [showCashOut, setShowCashOut] = useState(false);

  const canCheck = toCall === 0;
  const isBet = currentBet === 0;
  const canRebuy = isBetweenHands && stack < maxBuyIn;

  if (showCashOut) {
    return (
      <div className="bg-gray-900/80 rounded-lg border border-gray-700/50 p-3">
        <CashOutButton
          tableId={tableId}
          agentId={agentId}
          stack={stack}
          onSuccess={onLeave}
        />
        <button
          onClick={() => setShowCashOut(false)}
          className="mt-2 w-full text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/80 rounded-lg border border-gray-700/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-300">Your Controls</h3>
        <span className="text-xs text-green-400 font-medium">Stack: ${stack.toLocaleString()}</span>
      </div>

      {/* Action buttons — only when it's our turn */}
      {isMyTurn && isInHand && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => onAction('fold')}
              className="flex-1 py-2 text-sm font-medium bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition cursor-pointer"
            >
              Fold
            </button>
            {canCheck ? (
              <button
                onClick={() => onAction('check')}
                className="flex-1 py-2 text-sm font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition cursor-pointer"
              >
                Check
              </button>
            ) : (
              <button
                onClick={() => onAction('call')}
                className="flex-1 py-2 text-sm font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition cursor-pointer"
              >
                Call ${toCall}
              </button>
            )}
          </div>

          {/* Raise controls */}
          <div className="flex gap-2 items-center">
            <input
              type="range"
              min={minRaise}
              max={stack}
              value={raiseAmount}
              onChange={(e) => setRaiseAmount(Number(e.target.value))}
              className="flex-1 accent-emerald-500"
            />
            <button
              onClick={() => onAction(isBet ? 'bet' : 'raise', raiseAmount)}
              disabled={raiseAmount > stack}
              className="px-4 py-2 text-sm font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/30 transition cursor-pointer disabled:opacity-50"
            >
              {isBet ? 'Bet' : 'Raise'} ${raiseAmount}
            </button>
          </div>

          {/* Quick raise presets */}
          <div className="flex gap-1">
            {[2, 3, 4].map((x) => (
              <button
                key={x}
                onClick={() => setRaiseAmount(Math.min(bigBlind * x, stack))}
                className="flex-1 py-1 text-[10px] bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 transition cursor-pointer"
              >
                {x}x BB
              </button>
            ))}
            <button
              onClick={() => onAction('all-in')}
              className="flex-1 py-1 text-[10px] bg-red-900/40 text-red-400 border border-red-700/50 rounded hover:bg-red-900/60 transition cursor-pointer font-bold"
            >
              All-In
            </button>
          </div>
        </div>
      )}

      {/* Waiting message when in hand but not our turn */}
      {!isMyTurn && isInHand && (
        <p className="text-xs text-gray-500 text-center py-2">Waiting for your turn...</p>
      )}

      {/* Between hands controls */}
      <div className="flex gap-2 mt-3">
        {canRebuy && (
          <button
            onClick={onRebuy}
            className="flex-1 py-1.5 text-xs font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/30 transition cursor-pointer"
          >
            Re-buy
          </button>
        )}
        <button
          onClick={() => setShowCashOut(true)}
          className="flex-1 py-1.5 text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition cursor-pointer"
        >
          Leave Table
        </button>
      </div>
    </div>
  );
}
