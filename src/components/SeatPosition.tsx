'use client';

import Card from './Card';

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
}

export default function SeatPosition({
  seat,
  isDealer,
  isCurrentTurn,
  isBigBlind,
  isSmallBlind,
  position,
  betPosition,
}: SeatPositionProps) {
  const isEmpty = !seat.agent;

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
        {/* Seat container */}
        <div
          className={`
            relative rounded-xl px-3 py-2 min-w-[100px] text-center border-2 transition-all duration-200
            ${isEmpty
              ? 'bg-gray-800/40 border-gray-700/40'
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
          </div>

          {isEmpty ? (
            <div className="text-gray-500 text-xs py-1">Empty</div>
          ) : (
            <>
              {/* Agent name */}
              <div className="text-xs font-semibold text-gray-200 truncate max-w-[90px]">
                <span className="text-gray-400 mr-0.5">
                  {seat.agent!.type !== 'human' ? '🤖' : '👤'}
                </span>
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
