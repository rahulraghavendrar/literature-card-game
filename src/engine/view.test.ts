import { getPlayerView } from './view';
import { craftState } from '../tests/helpers';
import { createGame } from './game';
import { seededRng } from './random';
import { namedConfig } from '../tests/helpers';

// t1 = {p1, p3}, t2 = {p2, p4}
const hands = {
  p1: ['3H', 'KD', '8C'],
  p2: ['4H', '3S', 'JK1'],
  p3: ['3D', 'JK2', '9C'],
  p4: ['3C', 'KH', '8D'],
};

describe('player view privacy', () => {
  it("contains the viewer's hand and only card counts for everyone else", () => {
    const view = getPlayerView(craftState({ current: 'p1', hands }), 'p1');
    expect(view.myHand).toEqual(['3H', '8C', 'KD']);
    expect(view.sets).toHaveLength(9);
    for (const p of view.players) {
      expect(Object.keys(p).sort()).toEqual(['cardCount', 'id', 'isCurrent', 'name', 'seat', 'teamId']);
    }
    expect(view.players.find((p) => p.id === 'p3')!.cardCount).toBe(3);
  });

  it("never exposes the teammate's cards", () => {
    const view = getPlayerView(craftState({ current: 'p1', hands }), 'p1');
    expect(view.partnerId).toBe('p3');
    const json = JSON.stringify({ ...view, options: null });
    for (const card of hands.p3) expect(json).not.toContain(`"${card}"`);
  });

  it('is identical no matter which other player holds a hidden card', () => {
    // Swap cards between the partner (p3) and an opponent (p2): same counts, different holders.
    const a = craftState({ current: 'p1', hands });
    const b = craftState({
      current: 'p1',
      hands: { ...hands, p2: ['4H', '3D', 'JK1'], p3: ['3S', 'JK2', '9C'] },
    });
    expect(getPlayerView(b, 'p1')).toEqual(getPlayerView(a, 'p1'));
    // Same for a viewer who is not on turn.
    expect(getPlayerView(b, 'p4')).toEqual(getPlayerView(a, 'p4'));
  });

  it('shows no hand when nobody is viewing (hand-off screen)', () => {
    const view = getPlayerView(craftState({ current: 'p1', hands }), null);
    expect(view.myHand).toBeNull();
    expect(view.options).toBeNull();
  });

  it('offers only legal options, with reasons for unavailable ones', () => {
    const view = getPlayerView(craftState({ current: 'p1', hands }), 'p1');
    const opts = view.options!;
    expect(opts.sets.map((s) => s.id)).toEqual(['LH', '8J', 'HD']);
    const p3 = opts.targets.find((t) => t.id === 'p3')!;
    expect(p3.available).toBe(false);
    expect(p3.reason).toMatch(/teammate/);
    expect(opts.targets.filter((t) => t.available).map((t) => t.id)).toEqual(['p2', 'p4']);
    const lowHearts = opts.cardsBySet.LH!;
    expect(lowHearts.find((c) => c.id === '3H')!.available).toBe(false);
    expect(lowHearts.filter((c) => c.available).map((c) => c.id)).toEqual(['2H', '4H', '5H', '6H', '7H']);
    expect(opts.cardsBySet['8J']!.filter((c) => c.available)).toHaveLength(5);
    // Every uncalled set can be called; the cards to name are the ones p1 lacks.
    expect(opts.callableSets).toHaveLength(9);
    const call = opts.callableSets.find((c) => c.id === 'HD')!;
    expect(call.held).toBe(1);
    expect(call.toName).toEqual(['9D', '10D', 'JD', 'QD', 'AD']);
  });

  it('gives no move options to players who are not on turn', () => {
    expect(getPlayerView(craftState({ current: 'p1', hands }), 'p2').options).toBeNull();
  });

  it('works for real dealt games of every size', () => {
    for (const n of [4, 6, 8, 10]) {
      const state = createGame(namedConfig(n), { rng: seededRng(n) });
      for (const p of state.players) {
        const view = getPlayerView(state, p.id);
        expect(view.myHand).toEqual(state.hands[p.id]);
        expect(view.players.reduce((s, q) => s + q.cardCount, 0)).toBe(
          Object.values(state.hands).flat().length,
        );
      }
    }
  });
});
