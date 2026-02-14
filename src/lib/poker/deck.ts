import { randomBytes } from 'crypto';
import { Card, RANKS, SUITS } from './types';

/** Build a standard 52-card deck. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Fisher-Yates shuffle using crypto-secure random bytes.
 * Returns a new shuffled array (does not mutate input).
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const cards = [...deck];
  const bytes = randomBytes(cards.length * 4);
  for (let i = cards.length - 1; i > 0; i--) {
    const rand = bytes.readUInt32BE((cards.length - 1 - i) * 4);
    const j = rand % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** Create and return a shuffled deck. */
export function freshDeck(): Card[] {
  return shuffleDeck(createDeck());
}

export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}
