import type {
  ActionError,
  ActionResult,
  CalledSet,
  CardId,
  ErrorCode,
  GameConfig,
  GameEvent,
  GameState,
  Player,
  SetId,
} from '../types/game';
import { ALL_CARD_IDS, SET_BY_ID, SET_ORDER, cardName, isCardId, isSetId, setOf, sortCards } from './deck';
import { dealCards } from './deal';
import { validateConfig } from './config';
import { cryptoRng, randomInt, shuffle, type Rng } from './random';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fail(code: ErrorCode, message: string): { ok: false; error: ActionError } {
  return { ok: false, error: { code, message } };
}

export function getPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

function nameOf(state: GameState, playerId: string | null): string {
  return (playerId && getPlayer(state, playerId)?.name) || 'That player';
}

export function handSize(state: GameState, playerId: string): number {
  return state.hands[playerId]?.length ?? 0;
}

export function partnerOf(state: GameState, playerId: string): Player | undefined {
  const me = getPlayer(state, playerId);
  if (!me) return undefined;
  return state.players.find((p) => p.teamId === me.teamId && p.id !== playerId);
}

export function isSetCalled(state: GameState, setId: SetId): boolean {
  return state.called[setId] !== undefined;
}

export function allSetsCalled(state: Pick<GameState, 'called'>): boolean {
  return SET_ORDER.every((id) => state.called[id] !== undefined);
}

// ---------------------------------------------------------------------------
// Turn order — the ONE place where the next player is decided.
// ---------------------------------------------------------------------------

/**
 * The first player strictly clockwise after `fromId` who holds cards,
 * skipping `excludeId`. Falls back to `excludeId` only when nobody else
 * holds cards. Returns null when nobody holds any cards.
 */
export function nextClockwiseWithCards(state: GameState, fromId: string, excludeId: string | null = null): string | null {
  const n = state.players.length;
  const from = getPlayer(state, fromId);
  if (!from) throw new Error(`Unknown player ${fromId}`);
  for (let step = 1; step <= n; step++) {
    const candidate = state.players[(from.seat + step) % n];
    if (candidate.id !== excludeId && handSize(state, candidate.id) > 0) return candidate.id;
  }
  if (excludeId && handSize(state, excludeId) > 0) return excludeId;
  return null;
}

/**
 * What ended (or continued) the actor's go:
 * - 'continue': a card was received, or a set was called correctly and the
 *   caller keeps playing.
 * - 'miss': the asked player didn't have the card, or a call was wrong.
 * - 'handover': a set was called correctly and the caller hands the turn to
 *   their partner.
 */
export type TurnOutcome = 'continue' | 'miss' | 'handover';

export interface TurnTransition {
  nextPlayerId: string | null;
  resumeAfterId: string | null;
  handoverFromId: string | null;
}

/**
 * Centralised turn transition. Play always moves clockwise and never
 * reverses; players without cards are skipped.
 *
 * - continue: the actor keeps the turn while they hold cards; with no cards
 *   left, play moves clockwise (from the original caller during a handover).
 * - miss: play moves to the next player clockwise. During a handover turn,
 *   "next" is counted from the player who handed over, not from the partner.
 * - handover: the actor's partner plays next; afterwards play resumes
 *   clockwise from the actor.
 */
export function resolveNextTurn(state: GameState, actorId: string, outcome: TurnOutcome): TurnTransition {
  if (outcome === 'handover') {
    const partner = partnerOf(state, actorId);
    if (partner && handSize(state, partner.id) > 0) {
      return { nextPlayerId: partner.id, resumeAfterId: actorId, handoverFromId: actorId };
    }
    outcome = 'continue';
  }
  if (outcome === 'continue' && handSize(state, actorId) > 0) {
    return { nextPlayerId: actorId, resumeAfterId: state.resumeAfterId, handoverFromId: state.handoverFromId };
  }
  const from = state.resumeAfterId ?? actorId;
  const exclude = outcome === 'miss' ? actorId : null;
  return { nextPlayerId: nextClockwiseWithCards(state, from, exclude), resumeAfterId: null, handoverFromId: null };
}

// ---------------------------------------------------------------------------
// Creating a game
// ---------------------------------------------------------------------------

export interface CreateGameOptions {
  rng?: Rng;
}

export function createGame(config: GameConfig, options: CreateGameOptions = {}): GameState {
  const issues = validateConfig(config);
  if (issues.length > 0) {
    throw new Error(`Invalid game configuration: ${issues.map((i) => i.message).join(' ')}`);
  }
  const rng = options.rng ?? cryptoRng();

  const players: Player[] = config.players.map((p, seat) => ({
    id: p.id,
    name: p.name.trim(),
    teamId: p.teamId,
    seat,
  }));
  const teams = config.teams.map((t) => ({ ...t, name: t.name.trim() }));

  const deck = shuffle(ALL_CARD_IDS, rng);
  const dealt = dealCards(deck, players.length);
  const hands: Record<string, CardId[]> = {};
  players.forEach((p, i) => {
    hands[p.id] = sortCards(dealt[i]);
  });

  const startingPlayerId =
    config.startingPlayer === 'random' ? players[randomInt(rng, players.length)].id : config.startingPlayer;

  return {
    players,
    teams,
    hands,
    currentPlayerId: startingPlayerId,
    startingPlayerId,
    called: {},
    resumeAfterId: null,
    handoverFromId: null,
    status: 'playing',
    pendingEvent: null,
    eventCounter: 0,
    passTheDevice: config.passTheDevice,
  };
}

// ---------------------------------------------------------------------------
// Validation shared by every action
// ---------------------------------------------------------------------------

function validateActor(state: GameState, actorId: string): ActionError | null {
  if (state.status === 'finished') return { code: 'game-over', message: 'The game is over.' };
  if (state.pendingEvent) return { code: 'busy', message: 'Wait for the current request to finish.' };
  const actor = getPlayer(state, actorId);
  if (!actor) return { code: 'unknown-player', message: 'Unknown player.' };
  if (state.currentPlayerId !== actorId) {
    return { code: 'not-your-turn', message: `It's ${nameOf(state, state.currentPlayerId)}'s turn, not ${actor.name}'s.` };
  }
  if (handSize(state, actorId) === 0) return { code: 'no-cards', message: `${actor.name} has no cards left.` };
  return null;
}

// ---------------------------------------------------------------------------
// Asking for a card
// ---------------------------------------------------------------------------

/** Why `targetId` can't be asked right now, or null if they can. (Ignores whose turn it is.) */
export function targetProblem(state: GameState, requesterId: string, targetId: string): ActionError | null {
  const requester = getPlayer(state, requesterId);
  const target = getPlayer(state, targetId);
  if (!requester) return { code: 'unknown-player', message: 'Unknown player.' };
  if (!target) return { code: 'unknown-target', message: 'That player is not in this game.' };
  if (target.id === requester.id) return { code: 'ask-self', message: "You can't ask yourself for a card." };
  if (target.teamId === requester.teamId) {
    return { code: 'ask-teammate', message: `${target.name} is your teammate — you can only ask opponents.` };
  }
  if (handSize(state, target.id) === 0) return { code: 'target-empty', message: `${target.name} has no cards left.` };
  return null;
}

/**
 * Why this player can't request `cardId`, or null if they can.
 * You may only ask for a card from a set you already hold a card of.
 */
export function cardProblem(state: GameState, requesterId: string, cardId: string): ActionError | null {
  if (!isCardId(cardId)) return { code: 'unknown-card', message: 'That card does not exist.' };
  const hand = state.hands[requesterId] ?? [];
  if (hand.includes(cardId)) return { code: 'already-held', message: `You already hold the ${cardName(cardId)}.` };
  const setId = setOf(cardId);
  const set = SET_BY_ID[setId];
  if (isSetCalled(state, setId)) return { code: 'set-called', message: `${set.short} has already been called.` };
  if (!hand.some((c) => setOf(c) === setId)) {
    return {
      code: 'set-not-held',
      message: `You can only ask for the ${cardName(cardId)} if you hold a card from ${set.short}.`,
    };
  }
  return null;
}

export function validateRequest(
  state: GameState,
  requesterId: string,
  targetId: string,
  cardId: string,
): { ok: true } | { ok: false; error: ActionError } {
  const actorErr = validateActor(state, requesterId);
  if (actorErr) return { ok: false, error: actorErr };
  const targetErr = targetProblem(state, requesterId, targetId);
  if (targetErr) return { ok: false, error: targetErr };
  const cardErr = cardProblem(state, requesterId, cardId);
  if (cardErr) return { ok: false, error: cardErr };
  return { ok: true };
}

function withEvent(state: GameState, transition: TurnTransition, event: (id: number, gameOver: boolean) => GameEvent): GameState {
  const gameOver = transition.nextPlayerId === null;
  const id = state.eventCounter + 1;
  return {
    ...state,
    currentPlayerId: transition.nextPlayerId,
    resumeAfterId: gameOver ? null : transition.resumeAfterId,
    handoverFromId: gameOver ? null : transition.handoverFromId,
    status: gameOver ? 'finished' : 'playing',
    pendingEvent: event(id, gameOver),
    eventCounter: id,
  };
}

/**
 * Ask `targetId` for `cardId`. A hit moves the card and the requester asks
 * again; a miss passes the turn clockwise. Nothing is collected automatically:
 * complete sets stay in hand until a team member calls them.
 */
export function requestCard(state: GameState, requesterId: string, targetId: string, cardId: string): ActionResult {
  const check = validateRequest(state, requesterId, targetId, cardId);
  if (!check.ok) return check;

  const hands = { ...state.hands };
  const success = hands[targetId].includes(cardId);
  if (success) {
    hands[targetId] = hands[targetId].filter((c) => c !== cardId);
    hands[requesterId] = sortCards([...hands[requesterId], cardId]);
  }
  const interim: GameState = { ...state, hands };
  const transition = resolveNextTurn(interim, requesterId, success ? 'continue' : 'miss');
  return {
    ok: true,
    state: withEvent(interim, transition, (id, gameOver) => ({
      kind: 'request',
      id,
      requesterId,
      targetId,
      cardId,
      success,
      nextPlayerId: transition.nextPlayerId,
      turnPassed: transition.nextPlayerId !== requesterId,
      gameOver,
    })),
  };
}

// ---------------------------------------------------------------------------
// Calling a set
// ---------------------------------------------------------------------------

/** The cards of `setId` this player doesn't hold — the ones they must name as their partner's. */
export function cardsToName(state: GameState, callerId: string, setId: SetId): CardId[] {
  const hand = state.hands[callerId] ?? [];
  return SET_BY_ID[setId].cards.filter((c) => !hand.includes(c));
}

/** Why this player can't call `setId`, or null if they can. (Ignores whose turn it is.) */
export function callProblem(state: GameState, callerId: string, setId: string): ActionError | null {
  if (!isSetId(setId)) return { code: 'unknown-set', message: 'That set does not exist.' };
  if (isSetCalled(state, setId)) return { code: 'set-called', message: `${SET_BY_ID[setId].short} has already been called.` };
  if (!partnerOf(state, callerId)) return { code: 'unknown-player', message: 'You have no partner.' };
  return null;
}

export function validateCall(
  state: GameState,
  callerId: string,
  setId: string,
  partnerCards: readonly string[],
): { ok: true } | { ok: false; error: ActionError } {
  const actorErr = validateActor(state, callerId);
  if (actorErr) return { ok: false, error: actorErr };
  const err = callProblem(state, callerId, setId);
  if (err) return { ok: false, error: err };
  const partner = partnerOf(state, callerId)!;
  const expected = cardsToName(state, callerId, setId as SetId);
  const named = new Set(partnerCards);
  const valid =
    Array.isArray(partnerCards) &&
    named.size === partnerCards.length &&
    named.size === expected.length &&
    expected.every((c) => named.has(c));
  if (!valid) {
    return {
      ok: false,
      error: {
        code: 'bad-naming',
        message: `Name every card of ${SET_BY_ID[setId as SetId].short} that ${partner.name} holds — the ones you don't have.`,
      },
    };
  }
  return { ok: true };
}

/**
 * Call a set: the caller names the cards their partner holds (every card of
 * the set they don't hold themselves).
 *
 * Correct: the six cards leave both hands, the team scores a point, and the
 * caller either keeps playing or hands the turn to their partner.
 * Wrong: nothing moves and the turn passes clockwise.
 */
export function callSet(
  state: GameState,
  callerId: string,
  setId: string,
  partnerCards: readonly string[],
  handover = false,
): ActionResult {
  const check = validateCall(state, callerId, setId, partnerCards);
  if (!check.ok) return check;

  const sid = setId as SetId;
  const caller = getPlayer(state, callerId)!;
  const partner = partnerOf(state, callerId)!;
  const setCards = SET_BY_ID[sid].cards;
  const correct = partnerCards.every((c) => state.hands[partner.id].includes(c));

  let interim = state;
  let called: CalledSet | null = null;
  if (correct) {
    const heldBy: Record<CardId, string> = {};
    for (const c of setCards) heldBy[c] = partnerCards.includes(c) ? partner.id : caller.id;
    called = { setId: sid, teamId: caller.teamId, callerId, heldBy, cards: [...setCards] };
    interim = {
      ...state,
      hands: {
        ...state.hands,
        [caller.id]: state.hands[caller.id].filter((c) => !setCards.includes(c)),
        [partner.id]: state.hands[partner.id].filter((c) => !setCards.includes(c)),
      },
      called: { ...state.called, [sid]: called },
    };
  }

  const transition = resolveNextTurn(interim, callerId, correct ? (handover ? 'handover' : 'continue') : 'miss');
  const handedOver = correct && transition.handoverFromId === callerId && transition.nextPlayerId === partner.id;
  return {
    ok: true,
    state: withEvent(interim, transition, (id, gameOver) => ({
      kind: 'call',
      id,
      callerId,
      partnerId: partner.id,
      setId: sid,
      correct,
      called,
      handedOver,
      nextPlayerId: transition.nextPlayerId,
      turnPassed: transition.nextPlayerId !== callerId,
      gameOver,
    })),
  };
}

// ---------------------------------------------------------------------------
// Acknowledging the current event (unlocks the next action)
// ---------------------------------------------------------------------------

export function acknowledgeEvent(state: GameState): ActionResult {
  if (!state.pendingEvent) return fail('nothing-pending', 'There is nothing to acknowledge.');
  return { ok: true, state: { ...state, pendingEvent: null } };
}

// ---------------------------------------------------------------------------
// Options for the UI (legal moves for the player whose turn it is)
// ---------------------------------------------------------------------------

/** Sets the player may ask from: uncalled sets they hold at least one card of. */
export function eligibleSets(state: GameState, playerId: string): SetId[] {
  const hand = state.hands[playerId] ?? [];
  return SET_ORDER.filter((id) => !isSetCalled(state, id) && hand.some((c) => setOf(c) === id));
}

/** Cards from `setId` this player could request (the ones they don't hold). */
export function requestableCards(state: GameState, playerId: string, setId: SetId): CardId[] {
  if (!eligibleSets(state, playerId).includes(setId)) return [];
  const hand = state.hands[playerId] ?? [];
  return SET_BY_ID[setId].cards.filter((c) => !hand.includes(c));
}

/** Opponents who can be asked (still hold cards). */
export function askableOpponents(state: GameState, playerId: string): string[] {
  return state.players.filter((p) => targetProblem(state, playerId, p.id) === null).map((p) => p.id);
}

export function uncalledSets(state: Pick<GameState, 'called'>): SetId[] {
  return SET_ORDER.filter((id) => state.called[id] === undefined);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** One point per set called correctly. */
export function teamScores(state: Pick<GameState, 'teams' | 'called'>): Record<string, number> {
  const scores: Record<string, number> = Object.fromEntries(state.teams.map((t) => [t.id, 0]));
  for (const c of Object.values(state.called)) {
    if (c) scores[c.teamId] = (scores[c.teamId] ?? 0) + 1;
  }
  return scores;
}

export interface GameResult {
  scores: Record<string, number>;
  /** Team ids with the highest score. More than one means a draw. */
  leaders: string[];
  isDraw: boolean;
  winnerTeamId: string | null;
}

export function getResult(state: Pick<GameState, 'teams' | 'called'>): GameResult {
  const scores = teamScores(state);
  const best = Math.max(...Object.values(scores));
  const leaders = state.teams.filter((t) => scores[t.id] === best).map((t) => t.id);
  const isDraw = leaders.length !== 1;
  return { scores, leaders, isDraw, winnerTeamId: isDraw ? null : leaders[0] };
}
