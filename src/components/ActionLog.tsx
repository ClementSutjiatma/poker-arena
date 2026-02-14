'use client';

interface Action {
  agentName: string;
  action: string;
  amount: number;
  round: string;
  timestamp: number;
}

interface ActionLogProps {
  actions: Action[];
  maxItems?: number;
}

const ACTION_COLORS: Record<string, string> = {
  fold: 'text-gray-400',
  check: 'text-blue-400',
  call: 'text-green-400',
  bet: 'text-yellow-400',
  raise: 'text-orange-400',
  'all-in': 'text-red-400',
};

const ROUND_LABELS: Record<string, string> = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

export default function ActionLog({ actions, maxItems = 20 }: ActionLogProps) {
  const displayActions = actions.slice(-maxItems);
  let currentRound = '';

  return (
    <div className="bg-gray-900/80 rounded-lg border border-gray-700/50 p-3 max-h-[400px] overflow-y-auto">
      <h3 className="text-sm font-semibold text-gray-300 mb-2">Action History</h3>
      {displayActions.length === 0 ? (
        <p className="text-xs text-gray-500">No actions yet</p>
      ) : (
        <div className="space-y-0.5">
          {displayActions.map((action, i) => {
            const showRoundHeader = action.round !== currentRound;
            currentRound = action.round;
            return (
              <div key={i}>
                {showRoundHeader && (
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-2 mb-1 border-t border-gray-700/50 pt-1">
                    {ROUND_LABELS[action.round] || action.round}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 truncate max-w-[80px]">{action.agentName}</span>
                  <span className={`font-semibold ${ACTION_COLORS[action.action] || 'text-white'}`}>
                    {action.action.toUpperCase()}
                  </span>
                  {action.amount > 0 && action.action !== 'fold' && action.action !== 'check' && (
                    <span className="text-gray-300">${action.amount}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
