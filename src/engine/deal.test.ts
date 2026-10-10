import { ALL_CARD_IDS } from './deck';
import { dealCards } from './deal';
import { createGame } from './game';
import { randomInt, seededRng, shuffle } from './random';
import { namedConfig } from '../tests/helpers';

describe('shuffling', () => {
  it('returns a permutation of the deck', () => {
    const shuffled = shuffle(ALL_CARD_IDS, seededRng(1));
    expect(shuffled).toHaveLength(54);
    expect([...shuffled].sort()).toEqual([...ALL_CARD_IDS].sort());
  });

  it('is fair: each card lands in each position about equally often', () => {
    const trials = 27000;
    const positions = 54;
    const counts = new Array<number>(positions).fill(0);
    const rng = seededRng(2024);
    for (let t = 0; t < trials; t++) {
      const deck = shuffle(ALL_CARD_IDS, rng);
      counts[deck.indexOf('JK1')]++;
    }
    const expected = trials / positions; // 500
    // Chi-squared with 53 degrees of freedom; 99.9th percentile ≈ 90.
    const chi2 = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(90);
  });

  it('randomInt is unbiased and in range', () => {
    const rng = seededRng(7);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[randomInt(rng, 3)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(400);
  });
});

describe('dealing', () => {
  for (let n = 4; n <= 10; n++) {
    it(`deals all 54 cards as evenly as possible to ${n} players`, () => {
      const hands = dealCards(shuffle(ALL_CARD_IDS, seededRng(n)), n);
      const sizes = hands.map((h) => h.length);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(54);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      // The remainder goes one card each to different players.
      expect(sizes.filter((s) => s === Math.ceil(54 / n)).length).toBe(54 % n === 0 ? n : 54 % n);
      const all = hands.flat();
      expect(new Set(all).size).toBe(54);
      expect([...all].sort()).toEqual([...ALL_CARD_IDS].sort());
    });
  }
});

describe('createGame', () => {
  for (const n of [4, 6, 8, 10]) {
    it(`starts a valid ${n}-player game with every card accounted for`, () => {
      for (let seed = 0; seed < 25; seed++) {
        const state = createGame(namedConfig(n), { rng: seededRng(seed) });
        const all = Object.values(state.hands).flat();
        expect(all).toHaveLength(54);
        expect(new Set(all).size).toBe(54);
        expect(state.players).toHaveLength(n);
        expect(state.status).toBe('playing');
        expect(state.called).toEqual({});
        expect(state.pendingEvent).toBeNull();
        expect(state.hands[state.currentPlayerId!].length).toBeGreaterThan(0);
      }
    });
  }

  it('starts with the configured starting player', () => {
    const config = namedConfig(6);
    config.startingPlayer = 'p4';
    const state = createGame(config, { rng: seededRng(3) });
    expect(state.startingPlayerId).toBe('p4');
    expect(state.currentPlayerId).toBe('p4');
  });

  it('picks a random starting player reproducibly when seeded', () => {
    const config = namedConfig(8);
    config.startingPlayer = 'random';
    const a = createGame(config, { rng: seededRng(99) });
    const b = createGame(config, { rng: seededRng(99) });
    expect(a.startingPlayerId).toBe(b.startingPlayerId);
    const starts = new Set<string>();
    for (let s = 0; s < 200; s++) starts.add(createGame(config, { rng: seededRng(s) }).startingPlayerId);
    expect(starts.size).toBe(8);
  });

  it('refuses an invalid configuration', () => {
    const config = namedConfig(4);
    config.players[0].teamId = config.players[1].teamId; // team of 3
    expect(() => createGame(config)).toThrow(/Invalid game configuration/);
  });
});
