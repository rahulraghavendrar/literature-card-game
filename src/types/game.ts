/**
 * Core domain types for the Literature card game.
 *
 * The full `GameState` is private engine data: it contains every player's
 * hand. UI code (and every network message) only ever carries a `PlayerView`
 * (see engine/view.ts), which exposes the viewer's own hand and public
 * information only.
 */

export type Suit = 'D' | 'C' | 'H' | 'S';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

/**
 * e.g. "QH" (Queen of Hearts), "10C". The two jokers are "JK1" and "JK2"
 * internally (every card needs its own id) but play as identical cards: a
 * request for "JK" means "a Joker", and either joker satisfies it.
 */
export type CardId = string;

/**
 * The nine sets:
 *  - L + suit: 2–7 of that suit (four sets of six)
 *  - H + suit: 9–Ace of that suit (four sets of six)
 *  - 8J: the four 8s and both jokers (one set of six)
 */
export type SetId = 'LD' | 'LC' | 'LH' | 'LS' | '8J' | 'HD' | 'HC' | 'HH' | 'HS';
export type SetCategory = 'lower' | 'special' | 'upper';

export interface StandardCard {
  id: CardId;
  kind: 'standard';
  rank: Rank;
  suit: Suit;
  setId: SetId;
}

export interface JokerCard {
  id: 'JK1' | 'JK2';
  kind: 'joker';
  jokerNumber: 1 | 2;
  setId: '8J';
}

export type Card = StandardCard | JokerCard;

export interface CardSet {
  id: SetId;
  /** "Low Diamonds", "Eights & Jokers", "High Spades" */
  name: string;
  /** "2–7 ♦", "8s & Jokers", "9–A ♠" */
  short: string;
  category: SetCategory;
  suit: Suit | null;
  cards: readonly CardId[];
}

export interface Team {
  id: string;
  name: string;
  color: string;
}

export interface PlayerConfig {
  id: string;
  name: string;
  teamId: string;
}

export interface GameConfig {
  /** Players in clockwise seating order. Index = seat number. */
  players: PlayerConfig[];
  teams: Team[];
  /** A player id, or 'random' to pick the first player at random. */
  startingPlayer: 'random' | string;
  /** Local play only: show a hand-off screen between turns so hands stay private. */
  passTheDevice: boolean;
  /** Seconds allowed for each move; 0 turns the timer off. Defaults to 60. */
  turnSeconds?: number;
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
  /** Fixed clockwise seat index, 0..n-1. */
  seat: number;
}

/** A set that has been called correctly and scored. */
export interface CalledSet {
  setId: SetId;
  teamId: string;
  callerId: string;
  /** Who held each card when it was called (public once called). */
  heldBy: Record<CardId, string>;
  cards: CardId[];
}

/**
 * The single "current" event. The engine never keeps a list of past events:
 * each new action replaces this, and acknowledging it clears it.
 */
export type GameEvent =
  | {
      kind: 'request';
      id: number;
      requesterId: string;
      targetId: string;
      cardId: CardId;
      success: boolean;
      nextPlayerId: string | null;
      turnPassed: boolean;
      gameOver: boolean;
    }
  | {
      kind: 'call';
      id: number;
      callerId: string;
      partnerId: string;
      setId: SetId;
      correct: boolean;
      /** Present only for a correct call: the six cards and who held them. */
      called: CalledSet | null;
      /** True when the caller handed the next turn to their partner. */
      handedOver: boolean;
      nextPlayerId: string | null;
      turnPassed: boolean;
      gameOver: boolean;
    }
  | {
      /** The player on turn ran out of time; the turn passes clockwise. */
      kind: 'timeout';
      id: number;
      playerId: string;
      nextPlayerId: string | null;
      turnPassed: boolean;
      gameOver: boolean;
    };

export interface GameState {
  players: Player[];
  teams: Team[];
  /** PRIVATE: every player's hand. Never send this to a UI or over the network. */
  hands: Record<string, CardId[]>;
  currentPlayerId: string | null;
  startingPlayerId: string;
  called: Partial<Record<SetId, CalledSet>>;
  /**
   * After a caller hands the turn to their partner, play resumes clockwise
   * from the caller (not from the partner) once the partner's turn ends.
   */
  resumeAfterId: string | null;
  /** Who handed the turn to the current player, if anyone. */
  handoverFromId: string | null;
  status: 'playing' | 'finished';
  /** While non-null, the engine refuses new actions until it is acknowledged. */
  pendingEvent: GameEvent | null;
  eventCounter: number;
  passTheDevice: boolean;
  /** Seconds allowed for each move; 0 means no timer. */
  turnSeconds: number;
}

export type ErrorCode =
  | 'game-over'
  | 'busy'
  | 'unknown-player'
  | 'not-your-turn'
  | 'no-cards'
  | 'unknown-target'
  | 'ask-self'
  | 'ask-teammate'
  | 'target-empty'
  | 'unknown-card'
  | 'already-held'
  | 'set-called'
  | 'set-not-held'
  | 'unknown-set'
  | 'bad-naming'
  | 'nothing-pending';

export interface ActionError {
  code: ErrorCode;
  message: string;
}

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: ActionError };
