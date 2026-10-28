import type { CalledSet, CardId, GameConfig, GameState, SetId } from '../types/game';
import { SET_BY_ID, createDefaultConfig, sortCards } from '../engine';

export interface CraftOptions {
  /** Hands by player id, in seat order p1..pn. */
  hands: Record<string, CardId[]>;
  current: string;
  /** Number of players; defaults to the number of hands given. */
  playerCount?: number;
  called?: Partial<Record<SetId, CalledSet>>;
  resumeAfterId?: string | null;
  handoverFromId?: string | null;
}

/**
 * Build a game state directly (bypassing the shuffle) for rule tests.
 * Uses the default config: seats p1..pn, team k = {p(k), p(k + n/2)}.
 * With 4 players: t1 = {p1, p3}, t2 = {p2, p4}.
 */
export function craftState({
  hands,
  current,
  playerCount,
  called = {},
  resumeAfterId = null,
  handoverFromId = null,
}: CraftOptions): GameState {
  const n = playerCount ?? Object.keys(hands).length;
  const config = createDefaultConfig(n);
  return {
    players: config.players.map((p, seat) => ({ id: p.id, name: p.name, teamId: p.teamId, seat })),
    teams: config.teams,
    hands: Object.fromEntries(config.players.map((p) => [p.id, sortCards(hands[p.id] ?? [])])),
    currentPlayerId: current,
    startingPlayerId: current,
    called,
    resumeAfterId,
    handoverFromId,
    status: 'playing',
    pendingEvent: null,
    eventCounter: 0,
    passTheDevice: false,
    turnSeconds: 0,
  };
}

export function namedConfig(n: number, names?: string[]): GameConfig {
  const config = createDefaultConfig(n);
  if (names) config.players.forEach((p, i) => (p.name = names[i]));
  return config;
}

/** A called-set record, all cards credited to `callerId`. */
export function calledFor(setId: SetId, teamId: string, callerId = 'p1'): CalledSet {
  const cards = [...SET_BY_ID[setId].cards];
  return { setId, teamId, callerId, cards, heldBy: Object.fromEntries(cards.map((c) => [c, callerId])) };
}
