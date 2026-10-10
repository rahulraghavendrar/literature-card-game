import { ALL_CARDS, ALL_CARD_IDS, CARD_BY_ID, SETS, SET_BY_ID, cardName, setOf, sortCards } from './deck';

describe('deck', () => {
  it('has exactly 54 cards, each exactly once', () => {
    expect(ALL_CARDS).toHaveLength(54);
    expect(new Set(ALL_CARD_IDS).size).toBe(54);
  });

  it('has 52 standard cards (13 ranks × 4 suits) and 2 distinct jokers', () => {
    expect(ALL_CARDS.filter((c) => c.kind === 'standard')).toHaveLength(52);
    expect(ALL_CARDS.filter((c) => c.kind === 'joker').map((j) => j.id)).toEqual(['JK1', 'JK2']);
    for (const rank of ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']) {
      for (const suit of ['D', 'C', 'H', 'S']) expect(CARD_BY_ID[`${rank}${suit}`]).toBeDefined();
    }
  });

  it('names cards readably', () => {
    expect(cardName('QH')).toBe('Queen of Hearts');
    expect(cardName('5C')).toBe('5 of Clubs');
    expect(cardName('JK2')).toBe('Joker 2');
  });
});

describe('the nine sets', () => {
  it('are nine sets of six that cover all 54 cards with no overlap', () => {
    expect(SETS).toHaveLength(9);
    for (const s of SETS) expect(s.cards).toHaveLength(6);
    const all = SETS.flatMap((s) => s.cards);
    expect(new Set(all).size).toBe(54);
    for (const card of ALL_CARDS) {
      const containing = SETS.filter((s) => s.cards.includes(card.id));
      expect(containing).toHaveLength(1);
      expect(containing[0].id).toBe(card.setId);
    }
  });

  it('has a 2–7 set for each suit', () => {
    for (const suit of ['D', 'C', 'H', 'S']) {
      const set = SET_BY_ID[`L${suit}` as 'LD'];
      expect(set.category).toBe('lower');
      expect([...set.cards]).toEqual(['2', '3', '4', '5', '6', '7'].map((r) => `${r}${suit}`));
    }
    expect(SET_BY_ID.LD.short).toBe('2–7 ♦');
    expect(SET_BY_ID.LD.name).toBe('Low Diamonds');
  });

  it('has a 9–Ace set for each suit', () => {
    for (const suit of ['D', 'C', 'H', 'S']) {
      const set = SET_BY_ID[`H${suit}` as 'HD'];
      expect(set.category).toBe('upper');
      expect([...set.cards]).toEqual(['9', '10', 'J', 'Q', 'K', 'A'].map((r) => `${r}${suit}`));
    }
    expect(SET_BY_ID.HD.short).toBe('9–A ♦');
  });

  it('has one special set: all four 8s and both jokers', () => {
    expect([...SET_BY_ID['8J'].cards]).toEqual(['8D', '8C', '8H', '8S', 'JK1', 'JK2']);
    expect(setOf('JK1')).toBe('8J');
    expect(setOf('8S')).toBe('8J');
    expect(SETS.filter((s) => s.category === 'special')).toHaveLength(1);
  });

  it('puts a card of one suit only in that suit’s sets', () => {
    expect(setOf('2H')).toBe('LH');
    expect(setOf('7H')).toBe('LH');
    expect(setOf('9H')).toBe('HH');
    expect(setOf('AH')).toBe('HH');
    expect(setOf('2S')).toBe('LS');
  });

  it('sorts hands by set then rank', () => {
    expect(sortCards(['AS', 'JK2', '2H', '8D', 'JK1', '2D', '9D', '7D'])).toEqual(['2D', '7D', '2H', '8D', 'JK1', 'JK2', '9D', 'AS']);
  });
});
