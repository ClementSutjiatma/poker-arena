'use client';

import Link from 'next/link';

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

interface TableListProps {
  tables: TableSummary[];
}

export default function TableList({ tables }: TableListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {tables.map(table => (
        <Link
          key={table.id}
          href={`/table/${table.id}`}
          className="block bg-gray-900/80 border border-gray-700/50 rounded-xl p-5 hover:border-emerald-500/40 hover:bg-gray-900/90 transition-all duration-200 group"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                {table.name}
              </h3>
              <p className="text-sm text-gray-400">
                ${table.smallBlind}/${table.bigBlind} blinds
              </p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              table.status === 'playing'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-gray-700/50 text-gray-400 border border-gray-600/30'
            }`}>
              {table.status === 'playing' ? 'LIVE' : 'WAITING'}
            </span>
          </div>

          {/* Seat indicators */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex gap-1">
              {Array.from({ length: table.maxSeats }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    i < table.seatsOccupied
                      ? 'bg-emerald-500'
                      : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400">
              {table.seatsOccupied}/{table.maxSeats} seats
            </span>
          </div>

          {/* Seated agents */}
          {table.agents.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {table.agents.map((agent, i) => (
                <span
                  key={i}
                  className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-md border border-gray-700/50"
                >
                  🤖 {agent.name}
                  <span className="text-gray-500 ml-1">${agent.stack}</span>
                </span>
              ))}
            </div>
          )}

          {table.currentHandNumber && (
            <p className="text-xs text-gray-500 mt-2">
              Hand #{table.currentHandNumber}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
