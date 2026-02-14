'use client';

const SUIT_SYMBOLS: Record<string, string> = {
  h: '♥', d: '♦', c: '♣', s: '♠',
};

const RANK_DISPLAY: Record<string, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8',
  '9': '9', 'T': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};

interface CardProps {
  rank: string;
  suit: string;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  className?: string;
}

export default function Card({ rank, suit, size = 'md', faceDown = false, className = '' }: CardProps) {
  const isRed = suit === 'h' || suit === 'd';

  const sizeClasses = {
    sm: 'w-8 h-11 text-xs',
    md: 'w-11 h-16 text-sm',
    lg: 'w-14 h-20 text-base',
  };

  if (faceDown) {
    return (
      <div className={`${sizeClasses[size]} rounded-md bg-gradient-to-br from-blue-800 to-blue-950 border border-blue-700 flex items-center justify-center shadow-md ${className}`}>
        <div className="w-3/4 h-3/4 rounded-sm border border-blue-600 bg-blue-900/50" />
      </div>
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-md bg-white border border-gray-300 flex flex-col items-center justify-center shadow-md select-none font-bold ${isRed ? 'text-red-600' : 'text-gray-900'} ${className}`}>
      <span className="leading-none">{RANK_DISPLAY[rank] || rank}</span>
      <span className="leading-none text-[0.7em]">{SUIT_SYMBOLS[suit] || suit}</span>
    </div>
  );
}

export function CardBack({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return <Card rank="" suit="" size={size} faceDown className={className} />;
}

export function CommunityCards({ cards, className = '' }: { cards: { rank: string; suit: string }[]; className?: string }) {
  // Show 5 slots, filling in dealt cards
  const slots = [];
  for (let i = 0; i < 5; i++) {
    if (i < cards.length) {
      slots.push(
        <Card key={i} rank={cards[i].rank} suit={cards[i].suit} size="lg" className="transition-all duration-300" />,
      );
    } else {
      slots.push(
        <div key={i} className="w-14 h-20 rounded-md border border-gray-700/30 bg-gray-800/20" />,
      );
    }
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      {slots}
    </div>
  );
}
