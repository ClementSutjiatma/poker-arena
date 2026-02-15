'use client';

import { useState, useEffect, useRef } from 'react';
import Card from './Card';
import HorseAvatar from './HorseAvatar';

interface SeatData {
  seatNumber: number;
  agent: { id: string; name: string; type: string } | null;
  stack: number;
  holeCards: { rank: string; suit: string }[];
  isSittingOut: boolean;
  currentBet: number;
  hasFolded: boolean;
  isAllIn: boolean;
}

interface SeatPositionProps {
  seat: SeatData;
  isDealer: boolean;
  isCurrentTurn: boolean;
  isBigBlind: boolean;
  isSmallBlind: boolean;
  position: { top: string; left: string };
  betPosition: { top: string; left: string };
  /** If set, empty seats are clickable and will call this with the seat number. */
  onSeatClick?: (seatNumber: number) => void;
  /** True if this seat belongs to the current user. */
  isLocalPlayer?: boolean;
  /** The last action this agent performed (action type + timestamp). Used for blink animation. */
  lastAction?: { action: string; timestamp: number } | null;
}

export default function SeatPosition({
  seat,
  isDealer,
  isCurrentTurn,
  isBigBlind,
  isSmallBlind,
  position,
  betPosition,
  onSeatClick,
  isLocalPlayer,
  lastAction,
}: SeatPositionProps) {
  const isEmpty = !seat.agent;

  // Track whether the horse should blink (on bet/raise/all-in)
  const [shouldBlink, setShouldBlink] = useState(false);
  const lastBlinkTimestamp = useRef<number>(0);

  useEffect(() => {
    if (
      lastAction &&
      (lastAction.action === 'bet' || lastAction.action === 'raise' || lastAction.action === 'all-in') &&
      lastAction.timestamp !== lastBlinkTimestamp.current
    ) {
      lastBlinkTimestamp.current = lastAction.timestamp;
      setShouldBlink(true);
      // Reset after animation completes
      const timeout = setTimeout(() => setShouldBlink(false), 800);
      return () => clearTimeout(timeout);
    }
  }, [lastAction]);

  return (
    <>
      {/* Current bet chip */}
      {seat.currentBet > 0 && (
        <div
          className="absolute z-20 flex items-center gap-1"
          style={{ top: betPosition.top, left: betPosition.left, transform: 'translate(-50%, -50%)' }}
        >
          <div className="w-4 h-4 rounded-full bg-yellow-500 border-2 border-yellow-300 shadow-md" />
          <span className="text-xs font-bold text-yellow-300">{seat.currentBet}</span>
        </div>
      )}

      <div
        className={`absolute z-10 flex flex-col items-center transition-all duration-200`}
        style={{ top: position.top, left: position.left, transform: 'translate(-50%, -50%)' }}
      >
        {/* Horse avatar — shown above the seat box for occupied seats */}
        {!isEmpty && seat.agent && (
          <div className={`mb-0.5 ${seat.hasFolded ? 'opacity-40 grayscale' : ''} transition-all duration-200`}>
            <HorseAvatar name={seat.agent.name} size={40} shouldBlink={shouldBlink} />
          </div>
        )}

        {/* Seat container */}
        <div
          className={`
            relative rounded-xl px-3 py-2 min-w-[100px] text-center border-2 transition-all duration-200
            ${isEmpty
              ? onSeatClick
                ? 'bg-gray-800/40 border-emerald-500/40 hover:border-emerald-400 hover:bg-gray-800/60 cursor-pointer'
                : 'bg-gray-800/40 border-gray-700/40'
              : isLocalPlayer
                ? seat.hasFolded
                  ? 'bg-gray-800/60 border-gray-600/40 opacity-50'
                  : isCurrentTurn
                    ? 'bg-blue-900/60 border-blue-400 shadow-lg shadow-blue-400/30 animate-pulse'
                    : 'bg-blue-900/40 border-blue-500/60'
                : seat.hasFolded
                  ? 'bg-gray-800/60 border-gray-600/40 opacity-50'
                  : seat.isAllIn
                    ? 'bg-red-900/60 border-red-500/80 shadow-lg shadow-red-500/20'
                    : isCurrentTurn
                      ? 'bg-gray-800/80 border-amber-400 shadow-lg shadow-amber-400/30 animate-pulse'
                      : seat.isSittingOut
                        ? 'bg-gray-800/40 border-gray-600/40 opacity-60'
                        : 'bg-gray-800/80 border-gray-600/60'
            }
          `}
          onClick={isEmpty && onSeatClick ? () => onSeatClick(seat.seatNumber) : undefined}
        >
          {/* Badges */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-1">
            {isDealer && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-white text-black rounded-full leading-none">D</span>
            )}
            {isSmallBlind && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white rounded-full leading-none">SB</span>
            )}
            {isBigBlind && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-500 text-white rounded-full leading-none">BB</span>
            )}
            {isLocalPlayer && !isEmpty && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white rounded-full leading-none">YOU</span>
            )}
          </div>

          {isEmpty ? (
            <div className={`text-xs py-1 ${onSeatClick ? 'text-emerald-400' : 'text-gray-500'}`}>
              {onSeatClick ? 'Sit Here' : 'Empty'}
            </div>
          ) : (
            <>
              {/* Agent name */}
              <div className="text-xs font-semibold text-gray-200 truncate max-w-[90px]">
                {seat.agent!.name}
              </div>

              {/* Stack */}
              <div className="text-sm font-bold text-green-400 mt-0.5">
                {seat.isAllIn ? (
                  <span className="text-red-400 font-black text-xs tracking-wider">ALL IN</span>
                ) : (
                  `$${seat.stack.toLocaleString()}`
                )}
              </div>

              {seat.isSittingOut && (
                <div className="text-[10px] text-gray-400 mt-0.5">Sitting Out</div>
              )}

              {seat.hasFolded && (
                <div className="text-[10px] text-gray-500 mt-0.5">Folded</div>
              )}
            </>
          )}
        </div>

        {/* Hole cards */}
        {seat.agent && seat.holeCards.length === 2 && !seat.hasFolded && (
          <div className="flex gap-0.5 mt-1">
            <Card rank={seat.holeCards[0].rank} suit={seat.holeCards[0].suit} size="sm" />
            <Card rank={seat.holeCards[1].rank} suit={seat.holeCards[1].suit} size="sm" />
          </div>
        )}
      </div>
    </>
  );
}
