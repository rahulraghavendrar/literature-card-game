// @vitest-environment node
import { Room, normaliseCode } from './rooms';
import { seededRng, cardsToName, eligibleSets, requestableCards, SET_BY_ID } from '../src/engine';
import type { GameState } from '../src/types/game';

function lobby(names: string[]) {
  const room = new Room('ABCDE', { rng: () => seededRng(7) });
  const members = names.map((n) => {
    const r = room.join(n);
    if (!r.ok) throw new Error(r.error);
    return r.member;
  });
  return { room, members };
}

function engine(room: Room): GameState {
  return room.game!;
}

describe('lobby', () => {
  it('makes the first player the host and pairs players into teams as they join', () => {
    const { room, members } = lobby(['Rahul', 'Priya', 'Arjun', 'Meera']);
    expect(room.hostId).toBe(members[0].id);
    // With four players, teams alternate round the table by default.
    expect(members.map((m) => m.teamId)).toEqual(['t1', 't2', 't1', 't2']);
    expect(room.teams).toHaveLength(2);
    for (const t of room.teams) expect(room.members.filter((m) => m.teamId === t.id)).toHaveLength(2);
    expect(room.issues()).toEqual([]);
  });

  it('keeps one team per two players and reports odd counts', () => {
    const { room } = lobby(['A', 'B', 'C', 'D', 'E']);
    expect(room.teams).toHaveLength(3);
    expect(room.issues().join(' ')).toMatch(/must be even/);
    room.join('F');
    expect(room.issues()).toEqual([]);
  });

  it('refuses an eleventh player and late joiners', () => {
    const { room } = lobby(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    expect(room.join('K').ok).toBe(false);
    const { room: r2, members } = lobby(['A', 'B', 'C', 'D']);
    expect(r2.start(members[0].id).ok).toBe(true);
    const late = r2.join('E');
    expect(late.ok).toBe(false);
  });

  it('gives duplicate names a number', () => {
    const { room } = lobby(['Sam', 'sam', 'Sam']);
    expect(room.members.map((m) => m.name)).toEqual(['Sam', 'sam 2', 'Sam 3']);
  });

  it('lets players pick their team and the host move anyone, swapping to keep pairs', () => {
    const { room, members } = lobby(['A', 'B', 'C', 'D']);
    const [a, b, c] = members;
    const otherTeam = room.teams.find((t) => t.id !== c.teamId)!;
    // A non-host can't join a full team…
    expect(room.lobbyAction(c.id, { type: 'assign', playerId: c.id, teamId: otherTeam.id }).ok).toBe(false);
    // …or move someone else.
    expect(room.lobbyAction(c.id, { type: 'assign', playerId: b.id, teamId: c.teamId }).ok).toBe(false);
    // The host can, and the teams stay pairs.
    expect(room.lobbyAction(a.id, { type: 'assign', playerId: c.id, teamId: otherTeam.id }).ok).toBe(true);
    for (const t of room.teams) expect(room.members.filter((m) => m.teamId === t.id)).toHaveLength(2);
  });

  it('only the host can reorder seats, choose the first player and start', () => {
    const { room, members } = lobby(['A', 'B', 'C', 'D']);
    const [host, b] = members;
    expect(room.lobbyAction(b.id, { type: 'move', playerId: b.id, delta: -1 }).ok).toBe(false);
    expect(room.lobbyAction(host.id, { type: 'move', playerId: b.id, delta: -1 }).ok).toBe(true);
    expect(room.members[0].id).toBe(b.id);
    expect(room.lobbyAction(b.id, { type: 'start-player', value: b.id }).ok).toBe(false);
    expect(room.lobbyAction(host.id, { type: 'start-player', value: b.id }).ok).toBe(true);
    expect(room.start(b.id).ok).toBe(false);
    expect(room.start(host.id).ok).toBe(true);
    expect(engine(room).currentPlayerId).toBe(b.id);
  });

  it('seats teammates opposite each other on request', () => {
    const { room, members } = lobby(['A', 'B', 'C', 'D', 'E', 'F']);
    room.lobbyAction(members[0].id, { type: 'alternate' });
    const teamOrder = room.members.map((m) => room.teams.findIndex((t) => t.id === m.teamId));
    expect(teamOrder).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('lends host controls out while the host is offline, and passes hosting on when they leave', () => {
    const { room, members } = lobby(['A', 'B', 'C', 'D']);
    room.setConnected(members[0].id, false);
    expect(room.effectiveHostId()).toBe(members[1].id);
    expect(room.snapshotFor(members[2].id).hostId).toBe(members[1].id);
    room.setConnected(members[0].id, true); // back after a refresh
    expect(room.effectiveHostId()).toBe(members[0].id);
    room.leave(members[0].id);
    expect(room.effectiveHostId()).toBe(members[1].id);
    expect(room.teams).toHaveLength(2);
  });

  it('can’t start while someone is offline', () => {
    const { room, members } = lobby(['A', 'B', 'C', 'D']);
    room.setConnected(members[3].id, false);
    const r = room.start(members[0].id);
    expect(!r.ok && r.error).toMatch(/reconnect/);
  });

  it('normalises codes typed by players', () => {
    expect(normaliseCode(' ab-cde ')).toBe('ABCDE');
  });
});

describe('privacy', () => {
  it('each snapshot contains only that player’s own cards', () => {
    const { room, members } = lobby(['A', 'B', 'C', 'D']);
    room.start(members[0].id);
    const g = engine(room);
    for (const m of members) {
      const snap = room.snapshotFor(m.id);
      expect(snap.game!.view.myHand).toEqual(g.hands[m.id]);
      const json = JSON.stringify(snap);
      for (const other of members.filter((o) => o.id !== m.id)) {
        // No other player's card ids appear anywhere in the snapshot, except inside
        // option lists of whole sets (which list every card of a set regardless of owner).
        const withoutOptions = JSON.stringify({ ...snap, game: { ...snap.game, view: { ...snap.game!.view, options: null } } });
        for (const c of g.hands[other.id]) expect(withoutOptions).not.toContain(`"${c}"`);
      }
      expect(json).not.toContain('token');
    }
  });
});

describe('playing', () => {
  function started() {
    const { room, members } = lobby(['A', 'B', 'C', 'D']);
    room.lobbyAction(members[0].id, { type: 'start-player', value: members[0].id });
    room.start(members[0].id);
    return { room, members };
  }

  it('validates moves with the engine and locks until the announcement is acknowledged', () => {
    const { room, members } = started();
    const g = engine(room);
    const me = g.currentPlayerId!;
    const other = members.find((m) => m.id !== me)!.id;
    expect(room.ask(other, me, 'AS').ok).toBe(false); // not their turn
    const setId = eligibleSets(g, me)[0];
    const card = requestableCards(g, me, setId)[0];
    const opponent = g.players.find((p) => p.teamId !== g.players.find((q) => q.id === me)!.teamId)!.id;
    expect(room.ask(me, opponent, card).ok).toBe(true);
    expect(room.hasPendingEvent()).toBe(true);
    const next = engine(room).currentPlayerId!;
    const nextSet = eligibleSets(engine(room), next)[0];
    const nextCard = requestableCards(engine(room), next, nextSet)[0];
    const nextOpponent = engine(room).players.find((p) => p.teamId !== engine(room).players.find((q) => q.id === next)!.teamId)!.id;
    const blocked = room.ask(next, nextOpponent, nextCard);
    expect(!blocked.ok && blocked.error).toMatch(/Wait/);
    expect(room.acknowledge()).toBe(true);
    expect(room.hasPendingEvent()).toBe(false);
  });

  it('accepts calls with named cards and moves to results when the last set is called', () => {
    const { room } = started();
    // Play the game out with perfect knowledge: call every set via whoever is on turn
    // after moving all of its cards to one team.
    let guard = 0;
    while (room.phase === 'game' && guard++ < 500) {
      const g = engine(room);
      const me = g.currentPlayerId!;
      const myTeam = g.players.find((p) => p.id === me)!.teamId;
      const partner = g.players.find((p) => p.teamId === myTeam && p.id !== me)!.id;
      // Ask an opponent for a card they hold, if possible; otherwise call a complete set.
      let moved = false;
      for (const setId of eligibleSets(g, me)) {
        for (const card of requestableCards(g, me, setId)) {
          const holder = g.players.find((p) => g.hands[p.id].includes(card))!;
          if (holder.teamId !== myTeam && room.ask(me, holder.id, card).ok) {
            moved = true;
            break;
          }
        }
        if (moved) break;
      }
      if (!moved) {
        const setId = (Object.keys(SET_BY_ID) as (keyof typeof SET_BY_ID)[]).find(
          (id) => !g.called[id] && cardsToName(g, me, id).every((c) => g.hands[partner].includes(c)),
        )!;
        expect(room.call(me, setId, cardsToName(g, me, setId), false).ok).toBe(true);
      }
      room.acknowledge();
    }
    expect(room.phase).toBe('results');
    expect(room.result).not.toBeNull();
    expect(Object.values(room.result!.scores).reduce((a, b) => a + b, 0)).toBe(9);
  });

  it('rematch deals a new game for the same players; back to lobby keeps the room', () => {
    const { room, members } = started();
    room.phase = 'results';
    expect(room.rematch(members[1].id).ok).toBe(false);
    expect(room.rematch(members[0].id).ok).toBe(true);
    expect(room.phase).toBe('game');
    room.phase = 'results';
    expect(room.backToLobby(members[0].id).ok).toBe(true);
    expect(room.phase).toBe('lobby');
    expect(room.game).toBeNull();
    expect(room.members).toHaveLength(4);
  });

  it('a player who leaves mid-game keeps their seat as offline', () => {
    const { room, members } = started();
    room.leave(members[2].id);
    expect(room.members).toHaveLength(4);
    expect(room.member(members[2].id)!.connected).toBe(false);
  });
});
