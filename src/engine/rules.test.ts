import {
  acknowledgeEvent,
  callSet,
  cardsToName,
  getResult,
  nextClockwiseWithCards,
  requestCard,
  requestableCards,
  resolveNextTurn,
  teamScores,
  timeOut,
  validateRequest,
} from './game';
import { SET_ORDER } from './deck';
import type { GameState, SetId } from '../types/game';
import { calledFor, craftState } from '../tests/helpers';

// 4 players, seats p1 → p2 → p3 → p4 clockwise. Teams: t1 = {p1, p3}, t2 = {p2, p4}.
function base(): GameState {
  return craftState({
    current: 'p1',
    hands: {
      p1: ['3H', 'KD', '8C', '5S'],
      p2: ['4H', '3S', 'JK1', 'QD'],
      p3: ['2H', 'JK2', '9C'],
      p4: ['6H', 'AD', '8D', 'AS'],
    },
  });
}

function ok(r: ReturnType<typeof requestCard>): GameState {
  if (!r.ok) throw new Error(r.error.message);
  return r.state;
}
const ask = (s: GameState, from: string, to: string, card: string) => ok(requestCard(s, from, to, card));
const call = (s: GameState, who: string, setId: string, named: string[], handover = false) =>
  ok(callSet(s, who, setId, named, handover));
function ack(s: GameState) {
  return ok(acknowledgeEvent(s));
}
function rejected(r: ReturnType<typeof requestCard>) {
  expect(r.ok).toBe(false);
  return r.ok ? null : r.error;
}

describe('asking — only from a set you hold', () => {
  it('allows any card of a 2–7 set when you hold one of that suit’s 2–7', () => {
    // p1 holds 3♥ (2–7 ♥): may ask for 4♥ and 6♥…
    expect(validateRequest(base(), 'p1', 'p2', '4H').ok).toBe(true);
    expect(validateRequest(base(), 'p1', 'p4', '6H').ok).toBe(true);
  });

  it('does not allow a different suit’s 2–7 or the same suit’s 9–A', () => {
    // p1 also holds 5♠, so 3♠ (2–7 ♠) is fine…
    expect(validateRequest(base(), 'p1', 'p2', '3S').ok).toBe(true);
    // …and not 9♥ (9–A ♥), which p1 holds nothing of.
    expect(rejected(requestCard(base(), 'p1', 'p2', '9H'))!.code).toBe('set-not-held');
    // p1 holds K♦ (9–A ♦), so the Ace of Diamonds is fine but 2♦ (2–7 ♦) is not.
    expect(validateRequest(base(), 'p1', 'p4', 'AD').ok).toBe(true);
    expect(rejected(requestCard(base(), 'p1', 'p4', '2D'))!.code).toBe('set-not-held');
  });

  it('treats the four 8s and both jokers as one set', () => {
    for (const card of ['8D', '8H', '8S', 'JK']) {
      expect(validateRequest(base(), 'p1', 'p2', card).ok).toBe(true);
    }
    const noEight = craftState({ current: 'p1', hands: { p1: ['4H'], p2: ['JK1'], p3: ['5S'], p4: ['8H'] } });
    expect(rejected(requestCard(noEight, 'p1', 'p2', 'JK'))!.code).toBe('set-not-held');
  });
});

describe('the two jokers are the same card', () => {
  it('asking for a Joker gets whichever joker the player holds', () => {
    // p2 holds the joker known internally as JK1; p1 asks for "a Joker".
    const s = ask(base(), 'p1', 'p2', 'JK');
    expect(s.hands.p1).toContain('JK1');
    expect(s.hands.p2).not.toContain('JK1');
    expect(s.pendingEvent).toMatchObject({ kind: 'request', cardId: 'JK', success: true });
    // Asking with either old name means the same thing.
    const s2 = ask(base(), 'p1', 'p2', 'JK2');
    expect(s2.hands.p1).toContain('JK1');
    expect(s2.pendingEvent).toMatchObject({ cardId: 'JK', success: true });
  });

  it('you can ask for a Joker while holding one, but not while holding both', () => {
    const one = craftState({ current: 'p1', hands: { p1: ['JK2', '8C'], p2: ['JK1'], p3: ['5S'], p4: ['8H'] } });
    const s = ask(one, 'p1', 'p2', 'JK');
    expect(s.hands.p1).toEqual(['8C', 'JK1', 'JK2']);
    const both = craftState({ current: 'p1', hands: { p1: ['JK1', 'JK2'], p2: ['8D'], p3: ['5S'], p4: ['8H'] } });
    const err = rejected(requestCard(both, 'p1', 'p2', 'JK'))!;
    expect(err.code).toBe('already-held');
    expect(err.message).toMatch(/both Jokers/);
  });

  it('a player without a joker says no', () => {
    const s = ask(base(), 'p1', 'p4', 'JK');
    expect(s.pendingEvent).toMatchObject({ success: false, cardId: 'JK' });
  });

  it('offers one Joker choice, not two', () => {
    expect(requestableCards(base(), 'p1', '8J')).toEqual(['8D', '8H', '8S', 'JK']);
    const both = craftState({ current: 'p1', hands: { p1: ['JK1', 'JK2'], p2: ['8D'], p3: ['5S'], p4: ['8H'] } });
    expect(requestableCards(both, 'p1', '8J')).toEqual(['8D', '8C', '8H', '8S']);
  });
});

describe('asking — valid targets', () => {
  it('rejects asking yourself, a teammate, an empty player, or for a card you hold', () => {
    expect(rejected(requestCard(base(), 'p1', 'p1', '4H'))!.code).toBe('ask-self');
    expect(rejected(requestCard(base(), 'p1', 'p3', '2H'))!.code).toBe('ask-teammate');
    expect(rejected(requestCard(base(), 'p1', 'p2', '3H'))!.code).toBe('already-held');
    const s = craftState({ current: 'p1', hands: { p1: ['3H'], p2: [], p3: ['5S'], p4: ['3C'] } });
    expect(rejected(requestCard(s, 'p1', 'p2', '4H'))!.code).toBe('target-empty');
  });

  it('rejects unknown players and cards, and acting out of turn', () => {
    expect(rejected(requestCard(base(), 'p1', 'p9', '4H'))!.code).toBe('unknown-target');
    expect(rejected(requestCard(base(), 'p9', 'p2', '4H'))!.code).toBe('unknown-player');
    expect(rejected(requestCard(base(), 'p1', 'p2', 'ZZ'))!.code).toBe('unknown-card');
    expect(rejected(requestCard(base(), 'p2', 'p1', '3H'))!.code).toBe('not-your-turn');
  });

  it('rejects a new action while the previous one is still being shown', () => {
    const s = ask(base(), 'p1', 'p2', '4H');
    expect(rejected(requestCard(s, 'p1', 'p2', 'QD'))!.code).toBe('busy');
    expect(callSet(s, 'p1', 'LH', []).ok).toBe(false);
    expect(validateRequest(ack(s), 'p1', 'p2', 'QD').ok).toBe(true);
  });

  it('rejects asking for a card from a set already called', () => {
    const s = craftState({ current: 'p1', hands: { p1: ['3H'], p2: ['QH'], p3: ['5S'], p4: ['QS'] }, called: { HH: calledFor('HH', 't2') } });
    expect(rejected(requestCard(s, 'p1', 'p2', 'QH'))!.code).toBe('set-called');
  });

  it('never modifies the game state when an action is rejected', () => {
    const s = base();
    const snapshot = JSON.stringify(s);
    requestCard(s, 'p1', 'p1', '4H');
    requestCard(s, 'p1', 'p3', '2H');
    requestCard(s, 'p1', 'p2', '9H');
    requestCard(s, 'p2', 'p1', '3H');
    callSet(s, 'p1', 'LH', ['2H']); // incomplete naming
    callSet(s, 'p2', 'LH', ['2H']); // not their turn
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('a correct guess', () => {
  it('moves exactly that card and lets the player ask again', () => {
    const s = ask(base(), 'p1', 'p2', 'QD');
    expect(s.hands.p1).toContain('QD');
    expect(s.hands.p2).not.toContain('QD');
    expect(s.currentPlayerId).toBe('p1');
    expect(s.pendingEvent).toMatchObject({ kind: 'request', success: true, turnPassed: false, nextPlayerId: 'p1' });
  });

  it('does not collect a completed set automatically — the team keeps it until called', () => {
    const s0 = craftState({
      current: 'p1',
      hands: { p1: ['2H', '3H', '4H', '5H', '6H'], p2: ['7H', 'QS'], p3: ['5S'], p4: ['KH'] },
    });
    const s = ask(s0, 'p1', 'p2', '7H');
    expect(s.hands.p1).toEqual(['2H', '3H', '4H', '5H', '6H', '7H']);
    expect(s.called).toEqual({});
    expect(teamScores(s)).toEqual({ t1: 0, t2: 0 });
    expect(s.currentPlayerId).toBe('p1');
  });
});

describe('a wrong guess', () => {
  it('changes no hands and gives the turn to the player who was asked', () => {
    const s0 = base();
    const s = ask(s0, 'p1', 'p4', '4H'); // p4 doesn't have 4♥
    expect(s.hands).toEqual(s0.hands);
    expect(s.currentPlayerId).toBe('p4');
    expect(s.pendingEvent).toMatchObject({ success: false, turnPassed: true, nextPlayerId: 'p4' });
  });

  it('the turn follows whoever was asked, not the seating order', () => {
    // p1 asks p4 (the seat before p1): p4 plays next, skipping p2 and p3.
    const s = ack(ask(base(), 'p1', 'p4', '4H'));
    expect(s.currentPlayerId).toBe('p4');
    // p4 holds A♦ (9–A ♦) and asks p1 for the Q♦, which p1 doesn't have: back to p1.
    const t = ask(s, 'p4', 'p1', 'QD');
    expect(t.currentPlayerId).toBe('p1');
  });

  it('reveals nothing else about the asked player', () => {
    const s = ask(base(), 'p1', 'p4', '4H');
    expect(JSON.stringify(s.pendingEvent)).not.toMatch(/6H|AD|8D|AS/);
  });
});

describe('running out of time', () => {
  it('passes the turn to the next player clockwise and changes no hands', () => {
    const s0 = base();
    const r = timeOut(s0, 'p1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.hands).toEqual(s0.hands);
    expect(r.state.currentPlayerId).toBe('p2');
    expect(r.state.pendingEvent).toMatchObject({ kind: 'timeout', playerId: 'p1', nextPlayerId: 'p2', turnPassed: true });
  });

  it('only applies to the player on turn, and not during an announcement', () => {
    expect(timeOut(base(), 'p2').ok).toBe(false);
    const busy = ask(base(), 'p1', 'p2', 'QD');
    expect(timeOut(busy, 'p1').ok).toBe(false);
  });

  it('skips players with no cards', () => {
    const s0 = craftState({ current: 'p1', hands: { p1: ['2H'], p2: [], p3: ['6H'], p4: ['9H'] } });
    const r = timeOut(s0, 'p1');
    expect(r.ok && r.state.currentPlayerId).toBe('p3');
  });
});

describe('calling a set', () => {
  // t1 = {p1, p3}. 2–7 ♥ split: p1 has 2 3 4, p3 has 5 6 7.
  function split(): GameState {
    return craftState({
      current: 'p1',
      hands: { p1: ['2H', '3H', '4H', 'KD'], p2: ['QS', '9S'], p3: ['5H', '6H', '7H', 'AC'], p4: ['KH', '2S'] },
    });
  }

  it('lists the cards you must name: the ones you don’t hold', () => {
    expect(cardsToName(split(), 'p1', 'LH')).toEqual(['5H', '6H', '7H']);
    expect(cardsToName(split(), 'p1', 'HS')).toHaveLength(6);
  });

  it('a correct call with the partner’s cards named scores one point and keeps the turn', () => {
    const s = call(split(), 'p1', 'LH', ['5H', '6H', '7H']);
    expect(s.called.LH).toMatchObject({ teamId: 't1', callerId: 'p1' });
    expect(s.called.LH!.heldBy).toEqual({ '2H': 'p1', '3H': 'p1', '4H': 'p1', '5H': 'p3', '6H': 'p3', '7H': 'p3' });
    expect(s.hands.p1).toEqual(['KD']);
    expect(s.hands.p3).toEqual(['AC']);
    expect(teamScores(s)).toEqual({ t1: 1, t2: 0 });
    expect(s.currentPlayerId).toBe('p1');
    expect(s.pendingEvent).toMatchObject({ kind: 'call', correct: true, handedOver: false, turnPassed: false });
  });

  it('can be made later: a complete set held by one player is called on a later turn', () => {
    const s0 = craftState({
      current: 'p1',
      hands: { p1: ['9S', '10S', 'JS', 'QS', 'KS', 'AS', '2D'], p2: ['3D'], p3: ['4C'], p4: ['5C'] },
    });
    const s = call(s0, 'p1', 'HS', []); // nothing to name: p1 holds all six
    expect(s.called.HS!.teamId).toBe('t1');
    expect(s.hands.p1).toEqual(['2D']);
  });

  it('works when the partner holds the whole set', () => {
    const s0 = craftState({
      current: 'p1',
      hands: { p1: ['2D'], p2: ['3D'], p3: ['8D', '8C', '8H', '8S', 'JK1', 'JK2', '4C'], p4: ['5C'] },
    });
    const s = call(s0, 'p1', '8J', ['8D', '8C', '8H', '8S', 'JK1', 'JK2']);
    expect(s.called['8J']!.teamId).toBe('t1');
    expect(s.hands.p3).toEqual(['4C']);
  });

  it('a wrong call changes nothing and passes the turn to the next player clockwise', () => {
    // An opponent (p4) holds 7♥, so the partner can't have it.
    const s0 = craftState({
      current: 'p1',
      hands: { p1: ['2H', '3H', '4H'], p2: ['QS'], p3: ['5H', '6H'], p4: ['7H', 'KS'] },
    });
    const s = call(s0, 'p1', 'LH', ['5H', '6H', '7H']);
    expect(s.hands).toEqual(s0.hands);
    expect(s.called).toEqual({});
    expect(s.currentPlayerId).toBe('p2');
    expect(s.pendingEvent).toMatchObject({ kind: 'call', correct: false, called: null, turnPassed: true });
  });

  it('requires naming exactly the cards the caller doesn’t hold', () => {
    const bad = (named: string[]) => callSet(split(), 'p1', 'LH', named);
    expect(bad([]).ok).toBe(false); // nothing named
    expect(bad(['5H', '6H']).ok).toBe(false); // one missing
    expect(bad(['5H', '6H', '7H', '2H']).ok).toBe(false); // names a card the caller holds
    expect(bad(['5H', '5H', '6H']).ok).toBe(false); // duplicate
    expect(bad(['5H', '6H', 'KH']).ok).toBe(false); // not in the set
    const r = bad(['5H', '6H']);
    expect(!r.ok && r.error.code).toBe('bad-naming');
  });

  it('rejects calling a set that is already called', () => {
    const s = craftState({ current: 'p1', hands: { p1: ['2D'], p2: ['3D'], p3: ['4D'], p4: ['5D'] }, called: { HH: calledFor('HH', 't1') } });
    const r = callSet(s, 'p1', 'HH', []);
    expect(!r.ok && r.error.code).toBe('set-called');
  });

  it('when the caller runs out of cards, play moves clockwise', () => {
    const s0 = craftState({
      current: 'p1',
      hands: { p1: ['2H', '3H', '4H'], p2: ['QS'], p3: ['5H', '6H', '7H', 'AC'], p4: ['KH'] },
    });
    const s = call(s0, 'p1', 'LH', ['5H', '6H', '7H']);
    expect(s.hands.p1).toEqual([]);
    expect(s.currentPlayerId).toBe('p2');
  });
});

describe('handing the turn to your teammate after calling', () => {
  // 4 players: p1 → p2 → p3 → p4. p1 and p3 are partners.
  function split(): GameState {
    return craftState({
      current: 'p1',
      hands: {
        p1: ['2H', '3H', '4H', 'KD', '9C'],
        p2: ['QS', '9S', 'JC'],
        p3: ['5H', '6H', '7H', 'AC', '10C'],
        p4: ['KH', '2S', 'QC'],
      },
    });
  }

  it('gives the partner the next turn', () => {
    const s = call(split(), 'p1', 'LH', ['5H', '6H', '7H'], true);
    expect(s.currentPlayerId).toBe('p3');
    expect(s.handoverFromId).toBe('p1');
    expect(s.resumeAfterId).toBe('p1');
    expect(s.pendingEvent).toMatchObject({ handedOver: true, nextPlayerId: 'p3', turnPassed: true });
  });

  it('the partner keeps playing while they guess right', () => {
    let s = ack(call(split(), 'p1', 'LH', ['5H', '6H', '7H'], true));
    s = ask(s, 'p3', 'p2', 'JC'); // p3 holds A♣ 10♣ (9–A ♣); p2 has J♣
    expect(s.currentPlayerId).toBe('p3');
    expect(s.resumeAfterId).toBe('p1');
  });

  it('when the partner misses, the player they asked takes the turn', () => {
    let s = ack(call(split(), 'p1', 'LH', ['5H', '6H', '7H'], true));
    s = ask(s, 'p3', 'p4', 'KC'); // p4 doesn't hold K♣ → miss
    expect(s.currentPlayerId).toBe('p4');
    expect(s.resumeAfterId).toBeNull();
    expect(s.handoverFromId).toBeNull();
  });

  it('if the partner makes a wrong call or runs out of time, play resumes after the caller', () => {
    let s = ack(call(split(), 'p1', 'LH', ['5H', '6H', '7H'], true));
    const wrong = call(s, 'p3', 'HC', ['9C', 'JC', 'QC', 'KC']); // J♣ and Q♣ are with opponents
    expect(wrong.pendingEvent).toMatchObject({ correct: false });
    expect(wrong.currentPlayerId).toBe('p2'); // after p1, not after p3
    const r = timeOut(s, 'p3');
    expect(r.ok && r.state.currentPlayerId).toBe('p2');
    s = ack(wrong);
    expect(s.resumeAfterId).toBeNull();
  });

  it('when resuming, empty players are skipped and the partner doesn’t get the turn straight back', () => {
    // p2 has no cards: after p1 comes p3 — but p3 just ran out of time, so p4 is next.
    const s0 = craftState({
      current: 'p1',
      hands: { p1: ['2H', '3H', '4H', 'KD'], p2: [], p3: ['5H', '6H', '7H', 'AC', '10C'], p4: ['KH', 'QC'] },
    });
    const s = ack(call(s0, 'p1', 'LH', ['5H', '6H', '7H'], true));
    const r = timeOut(s, 'p3');
    expect(r.ok && r.state.currentPlayerId).toBe('p4');
  });

  it('is not possible when the partner has no cards left after the call', () => {
    const s0 = craftState({
      current: 'p1',
      hands: { p1: ['2H', '3H', '4H', 'KD'], p2: ['QS'], p3: ['5H', '6H', '7H'], p4: ['KH'] },
    });
    const s = call(s0, 'p1', 'LH', ['5H', '6H', '7H'], true);
    expect(s.currentPlayerId).toBe('p1');
    expect(s.pendingEvent).toMatchObject({ handedOver: false });
  });

  it('the partner can call and hand the turn back; a later timeout resumes after the partner', () => {
    const s0 = craftState({
      current: 'p1',
      hands: {
        p1: ['2H', '3H', '4H', 'KD', '9C', '10C'],
        p2: ['QS', '2S'],
        p3: ['5H', '6H', '7H', 'JC', 'QC', 'KC', 'AC', '3D'],
        p4: ['KH', '4S'],
      },
    });
    let s = ack(call(s0, 'p1', 'LH', ['5H', '6H', '7H'], true));
    s = ack(call(s, 'p3', 'HC', ['9C', '10C'], true));
    expect(s.currentPlayerId).toBe('p1');
    expect(s.resumeAfterId).toBe('p3');
    const r = timeOut(s, 'p1');
    expect(r.ok && r.state.currentPlayerId).toBe('p4'); // the player after p3
  });

  it('resolveNextTurn: continue keeps, a miss goes to the asked player, pass moves clockwise, handover goes to the partner', () => {
    const s = base();
    expect(resolveNextTurn(s, 'p1', 'continue').nextPlayerId).toBe('p1');
    expect(resolveNextTurn(s, 'p1', { missedOn: 'p4' }).nextPlayerId).toBe('p4');
    expect(resolveNextTurn(s, 'p1', 'pass').nextPlayerId).toBe('p2');
    expect(resolveNextTurn(s, 'p4', 'pass').nextPlayerId).toBe('p1');
    expect(resolveNextTurn(s, 'p1', 'handover')).toEqual({ nextPlayerId: 'p3', resumeAfterId: 'p1', handoverFromId: 'p1' });
  });
});

describe('clockwise turn order', () => {
  it('cycles p1 → p2 → p3 → p4 → p1 when each player runs out of time', () => {
    let s = craftState({ current: 'p1', hands: { p1: ['2H'], p2: ['4D'], p3: ['6C'], p4: ['9S'] } });
    const order = [s.currentPlayerId!];
    for (let i = 0; i < 8; i++) {
      const r = timeOut(s, s.currentPlayerId!);
      if (!r.ok) throw new Error(r.error.message);
      s = ack(r.state);
      order.push(s.currentPlayerId!);
    }
    expect(order).toEqual(['p1', 'p2', 'p3', 'p4', 'p1', 'p2', 'p3', 'p4', 'p1']);
  });

  it('skips players with no cards and wraps around', () => {
    const six = craftState({
      playerCount: 6,
      current: 'p5',
      hands: { p1: ['2H'], p2: ['4H'], p3: [], p4: ['9H'], p5: ['5H'], p6: [] },
    });
    const r = timeOut(six, 'p5');
    expect(r.ok && r.state.currentPlayerId).toBe('p1');
    expect(nextClockwiseWithCards(six, 'p2')).toBe('p4');
  });
});

describe('points and the end of the game', () => {
  function lastSet(): GameState {
    const called: GameState['called'] = {};
    SET_ORDER.filter((id) => id !== 'HS').forEach((id, i) => (called[id] = calledFor(id, i % 2 === 0 ? 't1' : 't2')));
    // 8 sets called: t1 has 4, t2 has 4. 9–A ♠ decides it.
    return craftState({
      current: 'p1',
      hands: { p1: ['9S', '10S', 'JS'], p2: ['QS'], p3: ['KS', 'AS'], p4: [] },
      called,
    });
  }

  it('gives one point per set called', () => {
    expect(teamScores(lastSet())).toEqual({ t1: 4, t2: 4 });
  });

  it('ends when all nine sets are called and the team with the most points wins', () => {
    let s = ack(ask(lastSet(), 'p1', 'p2', 'QS'));
    s = call(s, 'p1', 'HS', ['KS', 'AS']);
    expect(s.status).toBe('finished');
    expect(s.currentPlayerId).toBeNull();
    expect(s.pendingEvent).toMatchObject({ gameOver: true, nextPlayerId: null });
    const result = getResult(s);
    expect(result.scores).toEqual({ t1: 5, t2: 4 });
    expect(result.winnerTeamId).toBe('t1');
    expect(requestCard(ack(s), 'p1', 'p2', 'QS').ok).toBe(false);
  });

  it('declares a draw instead of inventing a winner', () => {
    const called: GameState['called'] = {};
    // 6 players, 3 teams: t1 3, t2 3, t3 3.
    SET_ORDER.forEach((id, i) => (called[id] = calledFor(id, `t${(i % 3) + 1}`)));
    const s = { ...craftState({ playerCount: 6, current: 'p1', hands: {} }), called };
    const result = getResult(s);
    expect(result.isDraw).toBe(true);
    expect(result.winnerTeamId).toBeNull();
    expect(result.leaders).toHaveLength(3);
  });

  it('credits the caller’s team', () => {
    const s0 = craftState({ current: 'p4', hands: { p1: ['KD'], p2: ['9D', '10D', 'JD'], p3: ['2H'], p4: ['QD', 'AD', '5C'] } });
    // p4 (t2) names partner p2's cards 9♦ 10♦ J♦ — but K♦ is with p1 → wrong.
    const wrong = callSet(s0, 'p4', 'HD', ['9D', '10D', 'JD', 'KD']);
    expect(wrong.ok && wrong.state.pendingEvent).toMatchObject({ correct: false });
    const s1 = ack(ask(s0, 'p4', 'p1', 'KD'));
    const s = call(s1, 'p4', 'HD', ['9D', '10D', 'JD']);
    expect(teamScores(s)).toEqual({ t1: 0, t2: 1 });
  });
});

describe('a set can always be finished', () => {
  it('if no opponent has cards left, every set you hold is complete within your team and can be called', () => {
    const s = craftState({ current: 'p1', hands: { p1: ['2H', '3H'], p2: [], p3: ['4H', '5H', '6H', '7H'], p4: [] } });
    expect(validateRequest(s, 'p1', 'p2', '4H').ok).toBe(false);
    const r = callSet(s, 'p1', 'LH' as SetId, ['4H', '5H', '6H', '7H']);
    expect(r.ok && r.state.status).toBe('finished');
  });
});
