import type { CalledSet, CardId, GameEvent, GameState, SetCategory, SetId, Team } from '../types/game';
import { SET_BY_ID, SET_ORDER, setOf } from './deck';
import { askableItems, cardProblem, eligibleSets, handSize, partnerOf, targetProblem, teamScores, uncalledSets } from './game';

/**
 * What one player is allowed to see. This is the ONLY game data handed to UI
 * components or sent over the network: the viewer's own hand plus public
 * information (names, teams, seats, card counts, scores, called sets) —
 * never another player's cards, including a teammate's.
 */
export interface PlayerView {
  viewerId: string | null;
  /** The viewer's own hand, or null when nobody is looking (hand-off screen). */
  myHand: CardId[] | null;
  partnerId: string | null;
  currentPlayerId: string | null;
  /** Who handed the turn to the current player, if anyone. */
  handoverFromId: string | null;
  /** During a handover, the player play resumes after once the turn ends. */
  resumeAfterId: string | null;
  status: GameState['status'];
  /** Seconds allowed for each move; 0 means no timer. */
  turnSeconds: number;
  players: PublicPlayer[];
  teams: PublicTeam[];
  sets: PublicSet[];
  /** Legal-move hints; present only when the viewer is the current player. */
  options: TurnOptions | null;
}

export interface PublicPlayer {
  id: string;
  name: string;
  teamId: string;
  seat: number;
  cardCount: number;
  isCurrent: boolean;
}

export interface PublicTeam extends Team {
  score: number;
  memberIds: string[];
}

export interface PublicSet {
  id: SetId;
  name: string;
  short: string;
  category: SetCategory;
  size: number;
  status: 'in-play' | 'called';
  /** Only present once the set has been called. */
  called: CalledSet | null;
}

export interface Option<T> {
  id: T;
  available: boolean;
  /** Why it's unavailable (shown to the player). */
  reason: string | null;
}

export interface CallOption {
  id: SetId;
  /** How many of the set's cards the viewer holds. */
  held: number;
  /** The cards the viewer must name as their partner's (the ones they don't hold). */
  toName: CardId[];
}

export interface TurnOptions {
  targets: Option<string>[];
  /** Sets the viewer holds a card of (the only sets they may ask from). */
  sets: Option<SetId>[];
  /** For each held set: what can be asked for (the two jokers count as one "JK"); held cards are unavailable. */
  cardsBySet: Partial<Record<SetId, Option<CardId>[]>>;
  /** Every set still in play can be called. */
  callableSets: CallOption[];
  canAsk: boolean;
}

function buildOptions(state: GameState, viewerId: string): TurnOptions {
  const targets = state.players
    .filter((p) => p.id !== viewerId)
    .map((p) => {
      const problem = targetProblem(state, viewerId, p.id);
      return { id: p.id, available: problem === null, reason: problem?.message ?? null };
    });
  const held = eligibleSets(state, viewerId);
  const sets = held.map((id) => ({ id, available: true, reason: null }));
  const cardsBySet: Partial<Record<SetId, Option<CardId>[]>> = {};
  for (const setId of held) {
    cardsBySet[setId] = askableItems(setId).map((cardId) => {
      const problem = cardProblem(state, viewerId, cardId);
      return { id: cardId, available: problem === null, reason: problem?.message ?? null };
    });
  }
  const hand = state.hands[viewerId];
  const callableSets = uncalledSets(state).map((id) => ({
    id,
    held: hand.filter((c) => setOf(c) === id).length,
    toName: SET_BY_ID[id].cards.filter((c) => !hand.includes(c)),
  }));
  return {
    targets,
    sets,
    cardsBySet,
    callableSets,
    canAsk: targets.some((t) => t.available) && held.length > 0,
  };
}

export function getPlayerView(state: GameState, viewerId: string | null): PlayerView {
  const viewer = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  const scores = teamScores(state);
  const isViewersTurn =
    !!viewer && state.status === 'playing' && state.currentPlayerId === viewer.id && !state.pendingEvent;

  return {
    viewerId: viewer?.id ?? null,
    myHand: viewer ? [...state.hands[viewer.id]] : null,
    partnerId: viewer ? (partnerOf(state, viewer.id)?.id ?? null) : null,
    currentPlayerId: state.currentPlayerId,
    handoverFromId: state.handoverFromId,
    resumeAfterId: state.resumeAfterId,
    status: state.status,
    turnSeconds: state.turnSeconds,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      teamId: p.teamId,
      seat: p.seat,
      cardCount: handSize(state, p.id),
      isCurrent: p.id === state.currentPlayerId,
    })),
    teams: state.teams.map((t) => ({
      ...t,
      score: scores[t.id] ?? 0,
      memberIds: state.players.filter((p) => p.teamId === t.id).map((p) => p.id),
    })),
    sets: SET_ORDER.map((id) => {
      const c = state.called[id] ?? null;
      const set = SET_BY_ID[id];
      return {
        id,
        name: set.name,
        short: set.short,
        category: set.category,
        size: set.cards.length,
        status: c ? 'called' : 'in-play',
        called: c ? { ...c, cards: [...c.cards], heldBy: { ...c.heldBy } } : null,
      };
    }),
    options: isViewersTurn ? buildOptions(state, viewer.id) : null,
  };
}

/** Events only ever contain public information; this copies one for the UI. */
export function publicEvent(event: GameEvent | null): GameEvent | null {
  return event ? (JSON.parse(JSON.stringify(event)) as GameEvent) : null;
}
