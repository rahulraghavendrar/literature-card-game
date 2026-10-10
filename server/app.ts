import { createServer, type Server as HttpServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type { Ack, ClientToServerEvents, JoinResult, ServerInfo, ServerToClientEvents } from '../src/types/protocol';
import { Room, makeRoomCode, normaliseCode, type Result } from './rooms';
import { seededRng } from '../src/engine';

type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface ServerOptions {
  port: number;
  host?: string;
  /** 'development' serves the app through Vite with hot reload; otherwise from dist/. */
  mode: 'development' | 'production';
  /** How long each announcement stays on screen before the next move is allowed (ms). */
  eventLockMs?: number;
  /** Let tests deal reproducible hands. Never enable on a public server. */
  allowSeeds?: boolean;
  /** Close rooms nobody has been connected to for this long (ms). */
  idleRoomMs?: number;
  log?: (msg: string) => void;
}

export interface RunningServer {
  http: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  rooms: Map<string, Room>;
  port: number;
  close: () => Promise<void>;
}

export function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${port}`);
    }
  }
  return urls;
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const log = options.log ?? ((m: string) => console.log(m));
  const eventLockMs = options.eventLockMs ?? 2600;
  const idleRoomMs = options.idleRoomMs ?? 30 * 60_000;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  const app = express();
  const http = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    serveClient: false,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });
  let actualPort = options.port;

  app.get('/api/info', (_req, res) => {
    const info: ServerInfo = { lanUrls: lanUrls(actualPort) };
    res.json(info);
  });
  app.get('/healthz', (_req, res) => {
    res.type('text').send('ok');
  });

  if (options.mode === 'development') {
    const { createServer: createVite } = await import('vite');
    const vite = await createVite({
      root,
      server: { middlewareMode: true, ws: { server: http } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(root, 'dist');
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // ---------------------------------------------------------------------------
  // Rooms and sockets
  // ---------------------------------------------------------------------------
  const rooms = new Map<string, Room>();
  /** socket id → where that socket sits */
  const seats = new Map<string, { code: string; memberId: string }>();
  const lockTimers = new Map<string, NodeJS.Timeout>();

  const socketsOf = (code: string, memberId: string) =>
    [...seats.entries()].filter(([, s]) => s.code === code && s.memberId === memberId).map(([id]) => id);

  function broadcast(room: Room) {
    for (const [socketId, seat] of seats) {
      if (seat.code !== room.code) continue;
      if (!room.member(seat.memberId)) continue;
      io.to(socketId).emit('room:state', room.snapshotFor(seat.memberId));
    }
  }

  /** Keep an announcement on everyone's screen briefly before the next move is allowed. */
  function scheduleAcknowledge(room: Room) {
    clearTimeout(lockTimers.get(room.code));
    lockTimers.set(
      room.code,
      setTimeout(() => {
        lockTimers.delete(room.code);
        if (room.acknowledge()) broadcast(room);
      }, eventLockMs),
    );
  }

  function attach(socket: IoSocket, room: Room, memberId: string) {
    const previous = seats.get(socket.id);
    if (previous && (previous.code !== room.code || previous.memberId !== memberId)) detach(socket);
    seats.set(socket.id, { code: room.code, memberId });
    void socket.join(room.code);
    room.setConnected(memberId, true);
  }

  function detach(socket: IoSocket) {
    const seat = seats.get(socket.id);
    if (!seat) return;
    seats.delete(socket.id);
    void socket.leave(seat.code);
    const room = rooms.get(seat.code);
    if (!room) return;
    if (socketsOf(seat.code, seat.memberId).length === 0) room.setConnected(seat.memberId, false);
    broadcast(room);
  }

  function newRoom(): Room {
    let code = makeRoomCode();
    while (rooms.has(code)) code = makeRoomCode();
    const seed = options.allowSeeds ? Number(process.env.LITERATURE_SEED ?? NaN) : NaN;
    let game = 0;
    const room = new Room(code, Number.isFinite(seed) ? { rng: () => seededRng(seed + game++) } : {});
    rooms.set(code, room);
    return room;
  }

  function reply(ack: unknown, r: Ack | Ack<JoinResult>) {
    if (typeof ack === 'function') (ack as (r: unknown) => void)(r);
  }

  io.on('connection', (socket) => {
    const seatOf = () => {
      const seat = seats.get(socket.id);
      const room = seat ? rooms.get(seat.code) : undefined;
      return seat && room && room.member(seat.memberId) ? { room, memberId: seat.memberId } : null;
    };

    /** Run an action for this socket's player, then share the new state. */
    const act = (ack: unknown, run: (room: Room, memberId: string) => Result, afterGameMove = false) => {
      const s = seatOf();
      if (!s) return reply(ack, { ok: false, error: 'You are not in a room.' });
      const r = run(s.room, s.memberId);
      reply(ack, r);
      if (r.ok) {
        if (afterGameMove && s.room.hasPendingEvent()) scheduleAcknowledge(s.room);
        broadcast(s.room);
      }
    };

    socket.on('room:create', (p, ack) => {
      const room = newRoom();
      const r = room.join(p?.name);
      if (!r.ok) return reply(ack, r);
      attach(socket, room, r.member.id);
      reply(ack, { ok: true, code: room.code, token: r.member.token, playerId: r.member.id });
      broadcast(room);
      log(`Room ${room.code} created`);
    });

    socket.on('room:join', (p, ack) => {
      const room = rooms.get(normaliseCode(p?.code));
      if (!room) return reply(ack, { ok: false, error: 'There’s no room with that code. Check it and try again.' });
      const r = room.join(p?.name);
      if (!r.ok) return reply(ack, r);
      attach(socket, room, r.member.id);
      reply(ack, { ok: true, code: room.code, token: r.member.token, playerId: r.member.id });
      broadcast(room);
    });

    socket.on('room:resume', (p, ack) => {
      const room = rooms.get(normaliseCode(p?.code));
      const member = room?.findByToken(p?.token);
      if (!room || !member) return reply(ack, { ok: false, error: 'That game has ended or the room has closed.' });
      attach(socket, room, member.id);
      reply(ack, { ok: true, code: room.code, token: member.token, playerId: member.id });
      broadcast(room);
    });

    socket.on('room:leave', (ack) => {
      const s = seatOf();
      if (!s) return reply(ack, { ok: true });
      const r = s.room.leave(s.memberId);
      seats.delete(socket.id);
      void socket.leave(s.room.code);
      reply(ack, r);
      if (s.room.isEmpty()) rooms.delete(s.room.code);
      else broadcast(s.room);
    });

    socket.on('lobby:action', (a, ack) => {
      const s = seatOf();
      const kicked = a?.type === 'kick' ? a.playerId : null;
      act(ack, (room, me) => room.lobbyAction(me, a));
      if (s && kicked && !s.room.member(kicked)) {
        for (const id of socketsOf(s.room.code, kicked)) {
          io.to(id).emit('room:removed', { reason: 'The host removed you from the room.' });
          seats.delete(id);
          io.sockets.sockets.get(id)?.leave(s.room.code);
        }
      }
    });

    socket.on('lobby:start', (ack) => act(ack, (room, me) => room.start(me)));
    socket.on('game:ask', (p, ack) => act(ack, (room, me) => room.ask(me, p?.targetId, p?.cardId), true));
    socket.on('game:call', (p, ack) =>
      act(ack, (room, me) => room.call(me, p?.setId, p?.partnerCards, p?.handover), true),
    );
    socket.on('game:rematch', (ack) => act(ack, (room, me) => room.rematch(me)));
    socket.on('game:lobby', (ack) => act(ack, (room, me) => room.backToLobby(me)));

    socket.on('disconnect', () => detach(socket));
  });

  // Close rooms nobody has been connected to for a while.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (!room.anyoneConnected() && now - room.lastActivity > idleRoomMs) {
        rooms.delete(code);
        clearTimeout(lockTimers.get(code));
        lockTimers.delete(code);
      }
    }
  }, 60_000);
  sweeper.unref();

  await new Promise<void>((resolve) => http.listen(options.port, options.host ?? '0.0.0.0', resolve));
  const address = http.address();
  if (address && typeof address === 'object') actualPort = address.port;

  return {
    http,
    io,
    rooms,
    port: actualPort,
    close: async () => {
      clearInterval(sweeper);
      for (const t of lockTimers.values()) clearTimeout(t);
      await io.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
