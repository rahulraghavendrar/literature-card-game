import type { CardId } from '../types/game';

/**
 * Deal every card, one at a time, around the table in seat order.
 * With 54 cards and n players, the first (54 mod n) seats each receive one
 * extra card, so hand sizes never differ by more than one.
 */
export function dealCards(deck: readonly CardId[], playerCount: number): CardId[][] {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new Error(`dealCards: invalid player count ${playerCount}`);
  }
  const hands: CardId[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, i) => hands[i % playerCount].push(card));
  return hands;
}
