import type { GameState } from '../types/game';
import { SET_ORDER, setOf } from './deck';
import {
  acknowledgeEvent,
  askableOpponents,
  callSet,
  cardsToName,
  createGame,
  eligibleSets,
  getResult,
  partnerOf,
  requestCard,
  requestableCards,
  uncalledSets,
} from './game';
import { randomInt, seededRng, type Rng } from './random';
import { namedConfig } from '../tests/helpers';

function checkInvariants(state: GameState) {
  const inHands = Object.values(state.hands).flat();
  const out = Object.values(state.called).flatMap((c) => c!.cards);
  const all = [...inHands, ...out];
  expect(all.length).toBe(54);
  expect(new Set(all).size).toBe(54);
  for (const c of inHands) expect(state.called[setOf(c)]).toBeUndefined();
  if (state.status === 'playing') {
    expect(state.hands[state.currentPlayerId!].length).toBeGreaterThan(0);
  } else {
    expect(Object.keys(state.called)).toHaveLength(9);
    expect(inHands).toHaveLength(0);
  }
}

function unwrap(r: ReturnType<typeof requestCard>): GameState {
  if (!r.ok) throw new Error(r.error.message);
  return r.state;
}

/** Play random legal moves (asks, right and wrong calls, handovers) until the game ends. */
function playRandomGame(n: number, seed: number, rng: Rng): GameState {
  let state = createGame(namedConfig(n), { rng: seededRng(seed) });
  checkInvariants(state);
  for (let step = 0; step < 20000 && state.status === 'playing'; step++) {
    const me = state.currentPlayerId!;
    const targets = askableOpponents(state, me);
    const sets = eligibleSets(state, me).filter((id) => requestableCards(state, me, id).length > 0);
    const roll = randomInt(rng, 10);
    let next: GameState;
    if (targets.length > 0 && sets.length > 0 && roll < 8) {
      const setId = sets[randomInt(rng, sets.length)];
      const cards = requestableCards(state, me, setId);
      next = unwrap(requestCard(state, me, targets[randomInt(rng, targets.length)], cards[randomInt(rng, cards.length)]));
    } else {
      // Prefer a set the team really holds; otherwise call anything (and probably miss).
      const partner = partnerOf(state, me)!.id;
      const open = uncalledSets(state);
      const good = open.filter((id) => cardsToName(state, me, id).every((c) => state.hands[partner].includes(c)));
      const pool = good.length > 0 && roll !== 9 ? good : open;
      const setId = pool[randomInt(rng, pool.length)];
      next = unwrap(callSet(state, me, setId, cardsToName(state, me, setId), randomInt(rng, 2) === 0));
    }
    state = unwrap(acknowledgeEvent(next));
    checkInvariants(state);
  }
  return state;
}

describe('full random games', () => {
  for (const n of [4, 6, 8, 10]) {
    it(`plays ${n}-player games to completion without breaking any invariant`, { timeout: 60_000 }, () => {
      const rng = seededRng(1000 + n);
      for (let seed = 0; seed < 20; seed++) {
        const end = playRandomGame(n, seed, rng);
        expect(end.status).toBe('finished');
        const result = getResult(end);
        expect(Object.values(result.scores).reduce((a, b) => a + b, 0)).toBe(SET_ORDER.length);
      }
    });
  }
});
