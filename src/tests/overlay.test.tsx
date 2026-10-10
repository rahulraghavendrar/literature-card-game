import { act, fireEvent, render, screen } from '@testing-library/react';
import { RequestOverlay } from '../components/RequestOverlay';
import { getPlayerView } from '../engine';
import type { GameEvent } from '../types/game';
import { calledFor, craftState } from './helpers';

// Seats: Rahul (p1, Crimson) → Priya (p2, Cobalt) → Arjun (p3, Crimson) → Meera (p4, Cobalt)
const NAMES = ['Rahul', 'Priya', 'Arjun', 'Meera'];
function publicData() {
  const state = craftState({ current: 'p1', hands: { p1: ['QS'], p2: ['2H'], p3: ['3H'], p4: ['4H'] } });
  state.players.forEach((p, i) => (p.name = NAMES[i]));
  const view = getPlayerView(state, null);
  return { players: view.players, teams: view.teams };
}

const INSTANT = { reveal: 0, autoDismiss: 0 };

function requestEvent(overrides: Partial<Extract<GameEvent, { kind: 'request' }>> = {}): GameEvent {
  return {
    kind: 'request',
    id: 1,
    requesterId: 'p1',
    targetId: 'p2',
    cardId: 'QH',
    success: true,
    nextPlayerId: 'p1',
    turnPassed: false,
    gameOver: false,
    ...overrides,
  };
}

function callEvent(overrides: Partial<Extract<GameEvent, { kind: 'call' }>> = {}): GameEvent {
  const called = calledFor('LH', 't1', 'p1');
  called.heldBy = { '2H': 'p1', '3H': 'p1', '4H': 'p1', '5H': 'p3', '6H': 'p3', '7H': 'p3' };
  return {
    kind: 'call',
    id: 2,
    callerId: 'p1',
    partnerId: 'p3',
    setId: 'LH',
    correct: true,
    called,
    handedOver: false,
    nextPlayerId: 'p1',
    turnPassed: false,
    gameOver: false,
    ...overrides,
  };
}

function show(event: GameEvent, props: Partial<Parameters<typeof RequestOverlay>[0]> = {}) {
  const { players, teams } = publicData();
  return render(<RequestOverlay event={event} players={players} teams={teams} onDismiss={() => {}} timing={INSTANT} {...props} />);
}

describe('request announcement', () => {
  it('shows the requester, the target and the requested card', () => {
    show(requestEvent());
    expect(screen.getByTestId('overlay-headline')).toHaveTextContent('Rahul asked Priya for the Queen of Hearts.');
    const overlay = screen.getByTestId('request-overlay');
    expect(overlay).toHaveAttribute('data-actor', 'p1');
    expect(overlay).toHaveAttribute('data-target', 'p2');
    expect(overlay).toHaveAttribute('data-card', 'QH');
    expect(overlay.querySelector('[data-card-face="QH"]')).not.toBeNull();
  });

  it('a correct guess: the card is handed over and the player asks again', () => {
    show(requestEvent());
    expect(screen.getByTestId('request-overlay')).toHaveAttribute('data-result', 'success');
    expect(screen.getByTestId('overlay-outcome')).toHaveTextContent('Priya hands over the Queen of Hearts.');
    expect(screen.getByTestId('overlay-outcome')).toHaveTextContent('Rahul asks again.');
  });

  it('a wrong guess: says so and names who plays next', () => {
    show(requestEvent({ success: false, nextPlayerId: 'p2', turnPassed: true }));
    expect(screen.getByTestId('request-overlay')).toHaveAttribute('data-result', 'failure');
    expect(screen.getByTestId('overlay-outcome')).toHaveTextContent(/Priya doesn.t have the Queen of Hearts\./);
    expect(screen.getByTestId('overlay-outcome')).toHaveTextContent('The turn passes to Priya.');
    expect(screen.getByText('Not here')).toBeInTheDocument();
  });

  it('reveals the outcome after a beat, then closes by itself', () => {
    vi.useFakeTimers();
    try {
      const onDismiss = vi.fn();
      show(requestEvent(), { onDismiss, timing: { reveal: 1000, autoDismiss: 3000 } });
      expect(screen.getByTestId('request-overlay')).toHaveAttribute('data-result', 'pending');
      expect(screen.getByTestId('overlay-continue')).toBeDisabled();
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByTestId('request-overlay')).toHaveAttribute('data-result', 'success');
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(3000));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not close by itself while paused, or at the end of the game', () => {
    vi.useFakeTimers();
    try {
      const onDismiss = vi.fn();
      const { unmount } = show(requestEvent(), { onDismiss, paused: true, timing: { reveal: 0, autoDismiss: 500 } });
      act(() => vi.advanceTimersByTime(5000));
      unmount();
      show(requestEvent({ gameOver: true, nextPlayerId: null, turnPassed: true }), { onDismiss, timing: { reveal: 0, autoDismiss: 100 } });
      act(() => vi.advanceTimersByTime(5000));
      expect(onDismiss).not.toHaveBeenCalled();
      expect(screen.getByTestId('overlay-continue')).toHaveTextContent('See the results');
    } finally {
      vi.useRealTimers();
    }
  });

  it('can be dismissed by the players', () => {
    const onDismiss = vi.fn();
    show(requestEvent(), { onDismiss });
    fireEvent.click(screen.getByTestId('overlay-continue'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('call announcement', () => {
  it('a correct call shows all six cards with who held them and the point', () => {
    show(callEvent());
    expect(screen.getByTestId('overlay-headline')).toHaveTextContent('Rahul calls 2–7 ♥.');
    expect(screen.getByTestId('request-overlay')).toHaveAttribute('data-result', 'correct');
    expect(screen.getByTestId('overlay-outcome')).toHaveTextContent('Correct. Crimson scores a point.');
    expect(screen.getByTestId('overlay-outcome')).toHaveTextContent('Rahul keeps the turn.');
    for (const c of ['2H', '3H', '4H', '5H', '6H', '7H']) {
      expect(screen.getByTestId('request-overlay').querySelector(`[data-card-face="${c}"]`)).not.toBeNull();
    }
    expect(screen.getAllByText('Arjun').length).toBeGreaterThanOrEqual(3);
  });

  it('a correct call with a handover says who plays next', () => {
    show(callEvent({ handedOver: true, nextPlayerId: 'p3', turnPassed: true }));
    expect(screen.getByTestId('overlay-outcome')).toHaveTextContent('Rahul hands the turn to Arjun.');
  });

  it('a wrong call says the cards stay put and the turn passes', () => {
    show(callEvent({ correct: false, called: null, nextPlayerId: 'p2', turnPassed: true }));
    expect(screen.getByTestId('request-overlay')).toHaveAttribute('data-result', 'wrong');
    expect(screen.getByTestId('overlay-outcome')).toHaveTextContent('Wrong. The cards stay where they are.');
    expect(screen.getByTestId('overlay-outcome')).toHaveTextContent('The turn passes to Priya.');
  });
});
