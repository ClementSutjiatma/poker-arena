'use client';

import { CommunityCards } from './Card';
import SeatPosition from './SeatPosition';
import ActionLog from './ActionLog';

// 6-seat positions arranged around an oval table
// Positions are percentages relative to the table container
const SEAT_POSITIONS = [
  { top: '85%', left: '50%' },   // 0: bottom center
  { top: '65%', left: '8%' },    // 1: bottom left
  { top: '20%', left: '8%' },    // 2: top left
  { top: '5%', left: '50%' },    // 3: top center
  { top: '20%', left: '92%' },   // 4: top right
  { top: '65%', left: '92%' },   // 5: bottom right
];

// Bet chip positions — closer to center
const BET_POSITIONS = [
  { top: '68%', left: '50%' },
  { top: '58%', left: '25%' },
  { top: '35%', left: '25%' },
  { top: '28%', left: '50%' },
  { top: '35%', left: '75%' },
  { top: '58%', left: '75%' },
];

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

interface PokerTableProps {
  table: TableData;
  onAddBot?: (strategy: string) => void;
  isAuthenticated?: boolean;
  onLogin?: () => void;
}

const PHASE_DISPLAY: Record<string, string> = {
  waiting: 'Waiting for players',
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
  complete: 'Hand Complete',
};

export default function PokerTable({ table, onAddBot, isAuthenticated, onLogin }: PokerTableProps) {
  const hand = table.currentHand;
  const hasEmptySeat = table.seats.some(s => !s.agent);

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Table visualization */}
      <div className="flex-1">
        {/* Table info */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">{table.config.name}</h2>
            <p className="text-sm text-gray-400">
              Blinds: ${table.config.smallBlind}/${table.config.bigBlind} &middot; Hand #{table.handCount}
            </p>
          </div>
          <div className="text-right">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
              hand ? 'bg-green-500/20 text-green-400' : 'bg-gray-700/50 text-gray-400'
            }`}>
              {hand ? PHASE_DISPLAY[hand.phase] || hand.phase : 'Waiting'}
            </span>
          </div>
        </div>

        {/* Poker table oval */}
        <div className="relative w-full aspect-[16/10] max-w-3xl mx-auto">
          {/* Table surface */}
          <div className="absolute inset-[8%] rounded-[50%] bg-gradient-to-b from-emerald-800 to-emerald-900 border-[6px] border-amber-900/80 shadow-[inset_0_0_60px_rgba(0,0,0,0.3)]" />
          {/* Table felt edge */}
          <div className="absolute inset-[9%] rounded-[50%] border border-emerald-700/30" />

          {/* Community cards in center */}
          <div className="absolute top-[38%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-30">
            {hand && hand.communityCards.length > 0 && (
              <CommunityCards cards={hand.communityCards} />
            )}
            {hand && hand.phase !== 'showdown' && hand.pot > 0 && (
              <div className="bg-black/40 rounded-full px-3 py-1">
                <span className="text-sm font-bold text-yellow-400">Pot: ${hand.pot.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Winners overlay — shown during showdown */}
          {hand && hand.winners.length > 0 && hand.phase === 'showdown' && (
            <div className="absolute top-[55%] left-1/2 -translate-x-1/2 z-30 bg-black/80 rounded-lg px-5 py-3 text-center border border-yellow-500/30 shadow-lg shadow-yellow-500/10">
              <div className="text-[10px] uppercase tracking-widest text-yellow-500/70 mb-1">Pot Awarded</div>
              {hand.winners.map((w, i) => (
                <div key={i} className="text-sm">
                  <span className="text-yellow-400 font-bold">{w.agentName}</span>
                  <span className="text-gray-300"> wins </span>
                  <span className="text-green-400 font-bold">${w.amount.toLocaleString()}</span>
                  <span className="text-gray-400 text-xs ml-1">({w.handName})</span>
                </div>
              ))}
            </div>
          )}

          {/* Seats */}
          {table.seats.map((seat, i) => (
            <SeatPosition
              key={i}
              seat={seat}
              isDealer={hand?.dealerSeatNumber === i}
              isCurrentTurn={hand?.currentTurnSeat === i}
              isBigBlind={hand?.bigBlindSeatNumber === i}
              isSmallBlind={hand?.smallBlindSeatNumber === i}
              position={SEAT_POSITIONS[i]}
              betPosition={BET_POSITIONS[i]}
            />
          ))}
        </div>

        {/* Add bot buttons — gated behind authentication */}
        {hasEmptySeat && (
          <div className="flex items-center gap-2 mt-4 justify-center">
            {isAuthenticated && onAddBot ? (
              <>
                <span className="text-sm text-gray-400">Add Bot:</span>
                <button
                  onClick={() => onAddBot('house_fish')}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition cursor-pointer"
                >
                  🐟 Fish
                </button>
                <button
                  onClick={() => onAddBot('house_tag')}
                  className="px-3 py-1.5 text-xs font-medium bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 transition cursor-pointer"
                >
                  🦈 TAG
                </button>
                <button
                  onClick={() => onAddBot('house_lag')}
                  className="px-3 py-1.5 text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition cursor-pointer"
                >
                  🔥 LAG
                </button>
              </>
            ) : (
              <button
                onClick={onLogin}
                className="px-4 py-2 text-sm font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/30 transition cursor-pointer"
              >
                Sign in to play
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action log sidebar */}
      <div className="w-full lg:w-72 shrink-0">
        {hand ? (
          <ActionLog actions={hand.actions} />
        ) : (
          <div className="bg-gray-900/80 rounded-lg border border-gray-700/50 p-3">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Action History</h3>
            <p className="text-xs text-gray-500">Waiting for next hand...</p>
          </div>
        )}
      </div>
    </div>
  );
}
