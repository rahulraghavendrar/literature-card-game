// @vitest-environment node
import { io as connect, type Socket } from 'socket.io-client';
import { startServer, type RunningServer } from './app';
import type { Ack, ClientToServerEvents, JoinResult, RoomSnapshot, ServerToClientEvents } from '../src/types/protocol';
import { eligibleSets, requestableCards } from '../src/engine';

type Client = Socket<ServerToClientEvents, ClientToServerEvents> & { latest: RoomSnapshot | null };

let server: RunningServer;
const clients: Client[] = [];

beforeAll(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', mode: 'production', eventLockMs: 50, log: () => {} });
});
afterAll(async () => {
  for (const c of clients) c.disconnect();
  await server.close();
});

async function client(): Promise<Client> {
  const c = connect(`http://127.0.0.1:${server.port}`, { transports: ['websocket'], forceNew: true }) as Client;
  c.latest = null;
  c.on('room:state', (s) => (c.latest = s));
  clients.push(c);
  await new Promise<void>((resolve) => c.on('connect', () => resolve()));
  return c;
}

function call<T extends object>(c: Client, event: string, ...args: unknown[]): Promise<Ack<T>> {
  return new Promise((resolve) => (c.emit as (...a: unknown[]) => void)(event, ...args, (r: Ack<T>) => resolve(r)));
}

async function until(check: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('online play over Socket.IO', () => {
  it('creates a room, lets three friends join, and starts a game where everyone sees only their own hand', async () => {
    const host = await client();
    const created = await call<JoinResult>(host, 'room:create', { name: 'Rahul' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const code = created.code;
    expect(code).toMatch(/^[A-Z2-9]{5}$/);

    const friends = await Promise.all(['Priya', 'Arjun', 'Meera'].map(() => client()));
    for (const [i, f] of friends.entries()) {
      const r = await call<JoinResult>(f, 'room:join', { code: code.toLowerCase(), name: ['Priya', 'Arjun', 'Meera'][i] });
      expect(r.ok).toBe(true);
    }
    await until(() => host.latest?.lobby.players.length === 4);
    expect(host.latest!.lobby.issues).toEqual([]);

    // A friend can't start; the host can.
    expect((await call(friends[0], 'lobby:start')).ok).toBe(false);
    expect((await call(host, 'lobby:start')).ok).toBe(true);
    const all = [host, ...friends];
    await until(() => all.every((c) => c.latest?.phase === 'game'));

    const hands = all.map((c) => c.latest!.game!.view.myHand!);
    expect(hands.flat()).toHaveLength(54);
    expect(new Set(hands.flat()).size).toBe(54);
    for (const [i, c] of all.entries()) {
      const view = c.latest!.game!.view;
      expect(view.viewerId).toBe(c.latest!.you);
      // Nothing in what this player received names another player's cards outside the move options.
      const json = JSON.stringify({ ...c.latest, game: { ...c.latest!.game, view: { ...view, options: null } } });
      for (const [j, h] of hands.entries()) if (j !== i) for (const card of h) expect(json).not.toContain(`"${card}"`);
    }

    // Play a move: the current player asks an opponent for a card.
    const g = server.rooms.get(code)!.game!;
    const me = g.currentPlayerId!;
    const mover = all.find((c) => c.latest!.you === me)!;
    const setId = eligibleSets(g, me)[0];
    const card = requestableCards(g, me, setId)[0];
    const myTeam = g.players.find((p) => p.id === me)!.teamId;
    const target = g.players.find((p) => p.teamId !== myTeam)!.id;
    const notMe = all.find((c) => c.latest!.you !== me)!;
    expect((await call(notMe, 'game:ask', { targetId: target, cardId: card })).ok).toBe(false);
    expect((await call(mover, 'game:ask', { targetId: target, cardId: card })).ok).toBe(true);

    // Everyone sees the same announcement, then it clears after the lock.
    await until(() => all.every((c) => c.latest?.game?.event?.kind === 'request'));
    for (const c of all) expect(c.latest!.game!.event).toMatchObject({ requesterId: me, targetId: target, cardId: card });
    await until(() => all.every((c) => c.latest?.game?.event === null));
  });

  it('lets a player refresh and rejoin their seat with their token', async () => {
    const host = await client();
    const created = await call<JoinResult>(host, 'room:create', { name: 'Host' });
    if (!created.ok) throw new Error(created.error);
    const guest = await client();
    const joined = await call<JoinResult>(guest, 'room:join', { code: created.code, name: 'Guest' });
    if (!joined.ok) throw new Error(joined.error);
    guest.disconnect();
    await until(() => host.latest?.lobby.players.find((p) => p.id === joined.playerId)?.connected === false);

    const again = await client();
    const resumed = await call<JoinResult>(again, 'room:resume', { code: created.code, token: joined.token });
    expect(resumed.ok && resumed.playerId).toBe(joined.playerId);
    await until(() => host.latest?.lobby.players.find((p) => p.id === joined.playerId)?.connected === true);

    const bad = await call(again, 'room:resume', { code: created.code, token: 'nope' });
    expect(bad.ok).toBe(false);
  });

  it('rejects unknown room codes', async () => {
    const c = await client();
    const r = await call(c, 'room:join', { code: 'ZZZZZ', name: 'X' });
    expect(r.ok).toBe(false);
  });

  it('serves server info for sharing on the local network', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/info`);
    const info = await res.json();
    expect(Array.isArray(info.lanUrls)).toBe(true);
  });
});
