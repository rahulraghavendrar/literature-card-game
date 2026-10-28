import type { Card, CardId, CardSet, Rank, SetId, Suit } from '../types/game';

export const SUITS: readonly Suit[] = ['D', 'C', 'H', 'S'];
export const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const LOW_RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7'];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME: Record<Suit, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
export const RANK_NAME: Record<Rank, string> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
};

/** Order the nine sets appear in on screen: the four low sets, the special set, the four high sets. */
export const SET_ORDER: readonly SetId[] = ['LD', 'LC', 'LH', 'LS', '8J', 'HD', 'HC', 'HH', 'HS'];

export const JOKER_IDS = ['JK1', 'JK2'] as const;
/** What a player asks for when they want a joker: either one will do. */
export const JOKER = 'JK';

export function isJoker(cardId: string): boolean {
  return cardId === JOKER || cardId === 'JK1' || cardId === 'JK2';
}

function setIdFor(rank: Rank, suit: Suit): SetId {
  if (rank === '8') return '8J';
  return `${LOW_RANKS.includes(rank) ? 'L' : 'H'}${suit}` as SetId;
}

function buildCards(): Card[] {
  const cards: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      cards.push({ id: `${rank}${suit}`, kind: 'standard', rank, suit, setId: setIdFor(rank, suit) });
    }
  }
  cards.push({ id: 'JK1', kind: 'joker', jokerNumber: 1, setId: '8J' });
  cards.push({ id: 'JK2', kind: 'joker', jokerNumber: 2, setId: '8J' });
  return cards;
}

/** All 54 cards, in canonical order. */
export const ALL_CARDS: readonly Card[] = Object.freeze(buildCards());
export const CARD_BY_ID: Readonly<Record<CardId, Card>> = Object.freeze(
  Object.fromEntries(ALL_CARDS.map((c) => [c.id, c])),
);
export const ALL_CARD_IDS: readonly CardId[] = ALL_CARDS.map((c) => c.id);

/** Rank order inside a set: 2→7, 9→A, then 8♦ 8♣ 8♥ 8♠ Joker 1 Joker 2. */
function rankIndex(card: Card): number {
  if (card.kind === 'joker') return 100 + card.jokerNumber;
  return RANKS.indexOf(card.rank) * 4 + SUITS.indexOf(card.suit);
}

function buildSets(): CardSet[] {
  return SET_ORDER.map((id) => {
    const cards = ALL_CARDS.filter((c) => c.setId === id)
      .sort((a, b) => rankIndex(a) - rankIndex(b))
      .map((c) => c.id);
    if (id === '8J') {
      return { id, name: 'Eights & Jokers', short: '8s & Jokers', category: 'special', suit: null, cards: Object.freeze(cards) };
    }
    const suit = id[1] as Suit;
    const low = id[0] === 'L';
    return {
      id,
      name: `${low ? 'Low' : 'High'} ${SUIT_NAME[suit]}`,
      short: `${low ? '2–7' : '9–A'} ${SUIT_SYMBOL[suit]}`,
      category: low ? 'lower' : 'upper',
      suit,
      cards: Object.freeze(cards),
    } satisfies CardSet;
  });
}

/** The nine sets of six cards. */
export const SETS: readonly CardSet[] = Object.freeze(buildSets());
export const SET_BY_ID: Readonly<Record<SetId, CardSet>> = Object.freeze(
  Object.fromEntries(SETS.map((s) => [s.id, s])) as Record<SetId, CardSet>,
);

export function isCardId(id: unknown): id is CardId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CARD_BY_ID, id);
}

export function isSetId(id: unknown): id is SetId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SET_BY_ID, id);
}

export function setOf(cardId: CardId): SetId {
  if (cardId === JOKER) return '8J';
  const card = CARD_BY_ID[cardId];
  if (!card) throw new Error(`Unknown card: ${cardId}`);
  return card.setId;
}

/** "Queen of Hearts", "10 of Clubs", "Joker" (the two jokers are identical). */
export function cardName(cardId: CardId): string {
  if (isJoker(cardId)) return 'Joker';
  const card = CARD_BY_ID[cardId];
  if (!card || card.kind === 'joker') return cardId;
  return `${RANK_NAME[card.rank]} of ${SUIT_NAME[card.suit]}`;
}

/** "the Queen of Hearts", "a Joker" — for sentences like "asked Priya for …". */
export function cardPhrase(cardId: CardId): string {
  return isJoker(cardId) ? 'a Joker' : `the ${cardName(cardId)}`;
}

/** "Q♥", "10♣", "Joker". */
export function cardShortName(cardId: CardId): string {
  if (isJoker(cardId)) return 'Joker';
  const card = CARD_BY_ID[cardId];
  if (!card || card.kind === 'joker') return cardId;
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

export function isRedCard(cardId: CardId): boolean {
  if (isJoker(cardId)) return true;
  const card = CARD_BY_ID[cardId];
  return !!card && card.kind === 'standard' && (card.suit === 'H' || card.suit === 'D');
}

const SORT_KEY: Record<CardId, number> = Object.fromEntries(
  SETS.flatMap((s, si) => s.cards.map((c, ci) => [c, si * 10 + ci])),
);

/** Sort cards by set (in SET_ORDER), then by rank within the set. */
export function sortCards(cards: readonly CardId[]): CardId[] {
  return [...cards].sort((a, b) => SORT_KEY[a] - SORT_KEY[b]);
}
