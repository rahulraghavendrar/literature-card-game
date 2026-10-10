import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { __testing, useGameStore } from '../store/gameStore';
import { SET_BY_ID, SET_ORDER, eligibleSets, nextClockwiseWithCards, setOf } from '../engine';
import type { GameState } from '../types/game';
import { calledFor, craftState, namedConfig } from './helpers';

const T = __testing!;
const NAMES = ['Rahul', 'Priya', 'Arjun', 'Meera'];

function store() {
  return useGameStore.getState();
}

function engine(): GameState {
  return T.getEngine()!;
}

/** Open the one-device screen from the home page. */
function openLocal() {
  act(() => store().backToSetup());
  render(<App />);
  fireEvent.click(screen.getByTestId('play-local'));
}

function startGame({ passTheDevice = true, seed = 5 } = {}) {
  openLocal();
  const config = namedConfig(4, NAMES);
  config.passTheDevice = passTheDevice;
  act(() => {
    store().startGame(config, { seed });
  });
  if (store().overlay) act(() => store().dismissOverlay());
  if (store().handoffTo) act(() => store().confirmHandoff());
}

/** A request the current player can make that will succeed (or fail). */
function findRequest(success: boolean) {
  const e = engine();
  const me = e.currentPlayerId!;
  const myTeam = e.players.find((p) => p.id === me)!.teamId;
  for (const setId of eligibleSets(e, me)) {
    for (const card of SET_BY_ID[setId].cards) {
      if (e.hands[me].includes(card)) continue;
      for (const p of e.players) {
        if (p.teamId === myTeam || e.hands[p.id].length === 0) continue;
        if (e.hands[p.id].includes(card) === success) return { me, target: p.id, card };
      }
    }
  }
  throw new Error('no such request');
}

function renderedCards(): string[] {
  return [...document.querySelectorAll('[data-card-face]')].map((el) => el.getAttribute('data-card-face')!).sort();
}

/** Make a request through the ask panel, like a player would. */
function askViaUi(target: string, card: string) {
  fireEvent.click(screen.getByTestId(`target-${target}`));
  fireEvent.click(screen.getByTestId(`set-${setOf(card)}`));
  fireEvent.click(screen.getByTestId(`card-${card}`));
  fireEvent.click(screen.getByTestId('confirm-ask'));
}

/** Dismiss the announcement and wait for its exit animation to finish. */
async function dismiss() {
  act(() => store().dismissOverlay());
  await waitFor(() => expect(screen.queryByTestId('request-overlay')).toBeNull());
}

function snapshot() {
  const e = engine();
  return JSON.stringify({ hands: e.hands, called: e.called, current: e.currentPlayerId, status: e.status });
}

describe('game screen', () => {
  it("renders only the viewer's own cards — never a teammate's or an opponent's", () => {
    startGame();
    const viewer = T.getViewerId()!;
    expect(renderedCards()).toEqual([...engine().hands[viewer]].sort());
    const partner = engine().players.find((p) => p.teamId === engine().players.find((q) => q.id === viewer)!.teamId && p.id !== viewer)!;
    for (const c of engine().hands[partner.id]) expect(document.querySelector(`[data-card-face="${c}"]`)).toBeNull();
  });

  it('asks through the panel and shows the request animation with the right details', () => {
    startGame();
    const { me, target, card } = findRequest(true);
    askViaUi(target, card);
    const overlay = screen.getByTestId('request-overlay');
    expect(overlay).toHaveAttribute('data-actor', me);
    expect(overlay).toHaveAttribute('data-target', target);
    expect(overlay).toHaveAttribute('data-card', card);
    expect(engine().hands[me]).toContain(card);
    expect(engine().hands[target]).not.toContain(card);
    // While the announcement is up, no new request can be made.
    expect(store().ask(target, card)).toBe(false);
  });

  it('keeps no visible history of past requests', async () => {
    startGame({ passTheDevice: false });
    for (let i = 0; i < 3; i++) {
      const { target, card } = findRequest(i % 2 === 0);
      askViaUi(target, card);
      expect(screen.getAllByTestId('request-overlay')).toHaveLength(1);
      await dismiss();
      expect(screen.queryByText(/ asked /)).toBeNull();
      expect(screen.queryByText(/doesn.t have/)).toBeNull();
      expect(screen.queryByText(/hands over/)).toBeNull();
    }
    expect(document.querySelector('[data-testid*="history" i], [data-testid*="log" i], [data-testid*="chat" i]')).toBeNull();
    expect(document.querySelector('[aria-label*="history" i], [aria-label*="log" i], [aria-label*="chat" i]')).toBeNull();
  });

  it('hides every hand on the pass-the-device screen and keeps the game state intact', async () => {
    startGame({ passTheDevice: true });
    const { me, target, card } = findRequest(false);
    askViaUi(target, card);
    const before = snapshot();
    await dismiss();
    const next = nextClockwiseWithCards(engine(), me)!;
    const nextName = engine().players.find((p) => p.id === next)!.name;
    expect(screen.getByTestId('handoff-screen')).toHaveTextContent(`Pass the device to ${nextName}`);
    expect(renderedCards()).toEqual([]);
    expect(snapshot()).toBe(before);
    fireEvent.click(screen.getByTestId('handoff-ready'));
    expect(screen.queryByTestId('handoff-screen')).toBeNull();
    expect(renderedCards()).toEqual([...engine().hands[next]].sort());
    expect(snapshot()).toBe(before);
  });

  it('without pass-the-device, shows the next hand directly', async () => {
    startGame({ passTheDevice: false });
    const { me, target, card } = findRequest(false);
    askViaUi(target, card);
    await dismiss();
    const next = nextClockwiseWithCards(engine(), me)!;
    expect(screen.queryByTestId('handoff-screen')).toBeNull();
    expect(engine().currentPlayerId).toBe(next);
    expect(renderedCards()).toEqual([...engine().hands[next]].sort());
  });

  it('a successful request keeps the turn and puts the card in the hand', async () => {
    startGame({ passTheDevice: true });
    const { me, target, card } = findRequest(true);
    askViaUi(target, card);
    await dismiss();
    expect(screen.queryByTestId('handoff-screen')).toBeNull();
    expect(renderedCards()).toContain(card);
    expect(engine().currentPlayerId).toBe(me);
  });

  it('calls a set by naming the partner’s cards, then hands the turn to the partner', async () => {
    startGame({ passTheDevice: true });
    // p1 (Rahul) holds 2–4♥, partner p3 (Arjun) 5–7♥.
    const state = craftState({
      current: 'p1',
      hands: { p1: ['2H', '3H', '4H', 'KD', '9C'], p2: ['QS', '9S'], p3: ['5H', '6H', '7H', 'AC'], p4: ['KH', '2S'] },
    });
    state.players.forEach((p, i) => (p.name = NAMES[i]));
    state.passTheDevice = true;
    act(() => T.setEngine(state, 'p1'));
    fireEvent.click(screen.getByTestId('tab-call'));
    fireEvent.click(screen.getByTestId('call-set-LH'));
    expect(screen.getByTestId('confirm-call')).toBeDisabled();
    expect(screen.getByTestId('named-card-2H')).toBeDisabled(); // Rahul's own card
    for (const c of ['5H', '6H', '7H']) fireEvent.click(screen.getByTestId(`named-card-${c}`));
    expect(screen.getByTestId('named-count')).toHaveTextContent('Named 3 of 3');
    fireEvent.click(screen.getByTestId('handover-yes'));
    fireEvent.click(screen.getByTestId('confirm-call'));
    expect(screen.getByTestId('request-overlay')).toHaveAttribute('data-kind', 'call');
    expect(engine().called.LH).toMatchObject({ teamId: 't1', callerId: 'p1' });
    expect(engine().currentPlayerId).toBe('p3');
    await dismiss();
    expect(screen.getByTestId('handoff-screen')).toHaveTextContent('Pass the device to Arjun');
    expect(screen.getByTestId('handoff-note')).toHaveTextContent('Rahul handed the turn to you.');
    expect(screen.getByTestId('score-value-t1')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('handoff-ready'));
    expect(screen.getByTestId('shelf-LH')).toHaveAttribute('data-status', 'called');
    expect(screen.getByTestId('handover-note')).toHaveTextContent('handed over by Rahul');
    expect(renderedCards()).toEqual(['AC']);
  });

  it('explains an illegal request without changing anything', () => {
    startGame();
    const me = engine().currentPlayerId!;
    const partner = engine().players.find((p) => p.teamId === engine().players.find((q) => q.id === me)!.teamId && p.id !== me)!;
    const before = snapshot();
    const card = SET_BY_ID[eligibleSets(engine(), me)[0]].cards.find((c) => !engine().hands[me].includes(c))!;
    act(() => {
      store().ask(partner.id, card);
    });
    expect(screen.getByTestId('action-error')).toHaveTextContent(/teammate/);
    expect(snapshot()).toBe(before);
    expect(screen.queryByTestId('request-overlay')).toBeNull();
    // The panel only offers legal targets: the partner's button is disabled.
    expect(screen.getByTestId(`target-${partner.id}`)).toBeDisabled();
  });

  it('hides the hand while paused', () => {
    startGame();
    expect(renderedCards().length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('open-menu'));
    expect(renderedCards()).toEqual([]);
    fireEvent.click(screen.getByTestId('resume'));
    expect(renderedCards().length).toBeGreaterThan(0);
  });
});

describe('end of game, rematch and restart', () => {
  function playFinalCall() {
    startGame({ passTheDevice: true });
    // 8 sets called (4 each); 9–A ♠ is left and Rahul (p1) holds all six.
    const called: GameState['called'] = {};
    SET_ORDER.filter((id) => id !== 'HS').forEach((id, i) => (called[id] = calledFor(id, i % 2 === 0 ? 't1' : 't2')));
    const state = craftState({ current: 'p1', hands: { p1: ['9S', '10S', 'JS', 'QS', 'KS', 'AS'], p2: [], p3: [], p4: [] }, called });
    state.players.forEach((p, i) => (p.name = NAMES[i]));
    state.passTheDevice = true;
    act(() => T.setEngine(state, 'p1'));
    fireEvent.click(screen.getByTestId('tab-call'));
    fireEvent.click(screen.getByTestId('call-set-HS'));
    fireEvent.click(screen.getByTestId('confirm-call'));
    expect(screen.getByTestId('overlay-continue')).toHaveTextContent('See the results');
    act(() => store().dismissOverlay());
  }

  it('shows the winner and the final score', () => {
    playFinalCall();
    expect(screen.getByTestId('results')).toBeInTheDocument();
    expect(screen.getByTestId('winner')).toHaveTextContent('Crimson wins');
    expect(screen.getByTestId('results')).toHaveTextContent('5–4 in points');
  });

  it('rematch deals a fresh game with the same players and teams', () => {
    playFinalCall();
    const before = store().gameNumber;
    fireEvent.click(screen.getByTestId('rematch'));
    expect(store().phase).toBe('game');
    expect(store().gameNumber).toBe(before + 1);
    const e = engine();
    expect(e.status).toBe('playing');
    expect(e.players.map((p) => p.name)).toEqual(NAMES);
    expect(e.called).toEqual({});
    expect(Object.values(e.hands).flat()).toHaveLength(54);
    expect(store().result).toBeNull();
  });

  it('can go back to setup with the configuration kept', () => {
    playFinalCall();
    fireEvent.click(screen.getByTestId('new-game'));
    expect(store().phase).toBe('setup');
    expect(T.getEngine()).toBeNull();
    expect((screen.getByTestId('name-0') as HTMLInputElement).value).toBe('Rahul');
  });

  it('restarting from the pause menu starts over', () => {
    startGame();
    const n = store().gameNumber;
    fireEvent.click(screen.getByTestId('open-menu'));
    fireEvent.click(screen.getByTestId('restart'));
    fireEvent.click(screen.getByTestId('confirm-leave'));
    expect(store().gameNumber).toBe(n + 1);
    expect(store().paused).toBe(false);
  });
});

describe('setup screen', () => {
  it('blocks starting with an invalid configuration and explains why', () => {
    openLocal();
    fireEvent.change(screen.getByTestId('name-0'), { target: { value: 'Rahul' } });
    fireEvent.change(screen.getByTestId('name-1'), { target: { value: 'rahul' } });
    fireEvent.click(screen.getByTestId('assign-1-t1')); // Crimson now has 3 players
    fireEvent.click(screen.getByTestId('start-game'));
    expect(store().phase).toBe('setup');
    const errors = screen.getByTestId('setup-errors');
    expect(errors).toHaveTextContent(/Two players are called/);
    expect(errors).toHaveTextContent(/Crimson has 3 players/);
  });

  it('disables odd player counts and supports 4 to 10 players', () => {
    openLocal();
    for (const n of [5, 7, 9]) expect(screen.getByTestId(`count-${n}`)).toBeDisabled();
    for (const n of [4, 6, 8, 10]) {
      fireEvent.click(screen.getByTestId(`count-${n}`));
      expect(screen.getAllByTestId(/^name-\d+$/)).toHaveLength(n);
    }
    fireEvent.click(screen.getByTestId('start-game'));
    expect(store().phase).toBe('game');
    expect(engine().players).toHaveLength(10);
  });
});
