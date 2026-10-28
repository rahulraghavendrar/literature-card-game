import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import type { GameEvent, SetId } from '../types/game';
import type {
  Ack,
  ClientToServerEvents,
  JoinResult,
  LobbyAction,
  RoomSnapshot,
  ServerInfo,
  ServerToClientEvents,
} from '../types/protocol';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SESSION_KEY = 'literature:online';

interface Session {
  code: string;
  token: string;
}

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: rejoining after a refresh won't work, everything else does */
  }
}

/** Put the room code in the address bar so a refresh rejoins and the link can be shared. */
function setRoomInUrl(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

export function roomFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('room');
  return code ? code.toUpperCase() : null;
}

export interface OnlineStore {
  connection: 'idle' | 'connecting' | 'connected' | 'reconnecting';
  room: RoomSnapshot | null;
  /** The announcement currently on screen. Never a list. */
  overlay: GameEvent | null;
  busy: boolean;
  /** Error for the join/create forms. */
  formError: string | null;
  /** Error for a move or lobby change. */
  actionError: string | null;
  /** Why this player was sent out of the room, if they were. */
  removedReason: string | null;
  lanUrls: string[];
  /** serverNow − Date.now(), so countdowns use the server's clock. */
  clockOffset: number;

  create: (name: string) => Promise<boolean>;
  join: (code: string, name: string) => Promise<boolean>;
  /** Rejoin the room saved for this tab (after a refresh). */
  resume: () => Promise<boolean>;
  leave: () => Promise<void>;
  lobby: (action: LobbyAction) => Promise<boolean>;
  start: () => Promise<boolean>;
  ask: (targetId: string, cardId: string) => Promise<boolean>;
  call: (setId: SetId, partnerCards: string[], handover: boolean) => Promise<boolean>;
  rematch: () => Promise<boolean>;
  backToLobby: () => Promise<boolean>;
  dismissOverlay: () => void;
  clearError: () => void;
  loadServerInfo: () => Promise<void>;
}

let socket: ClientSocket | null = null;
let shownEventId = 0;
let lastPhase: RoomSnapshot['phase'] | null = null;

export const useOnlineStore = create<OnlineStore>((set, get) => {
  function onSnapshot(snapshot: RoomSnapshot) {
    // Event ids restart with every new deal.
    if (snapshot.phase === 'game' && lastPhase !== 'game') shownEventId = 0;
    lastPhase = snapshot.phase;
    const event = snapshot.game?.event ?? null;
    const patch: Partial<OnlineStore> = { room: snapshot, clockOffset: snapshot.turn.serverNow - Date.now() };
    if (event && event.id !== shownEventId) {
      shownEventId = event.id;
      patch.overlay = event;
    }
    set(patch);
  }

  function ensureSocket(): ClientSocket {
    if (socket) return socket;
    set({ connection: 'connecting' });
    socket = io({ autoConnect: true, reconnection: true, transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      set({ connection: 'connected' });
      // After a dropped connection, take our seat back automatically.
      if (get().room) void get().resume();
    });
    socket.on('disconnect', () => set({ connection: 'reconnecting' }));
    socket.on('room:state', onSnapshot);
    socket.on('room:removed', ({ reason }) => {
      writeSession(null);
      setRoomInUrl(null);
      set({ room: null, overlay: null, removedReason: reason });
    });
    return socket;
  }

  function emit<T extends object = object>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<Ack<T>> {
    const s = ensureSocket();
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: 'The server didn’t answer. Check your connection.' }), 10_000);
      (s.emit as (...a: unknown[]) => void)(event, ...args, (r: Ack<T>) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
  }

  async function enter(r: Ack<JoinResult>): Promise<boolean> {
    if (!r.ok) {
      set({ formError: r.error, busy: false });
      return false;
    }
    writeSession({ code: r.code, token: r.token });
    setRoomInUrl(r.code);
    set({ formError: null, busy: false, removedReason: null });
    return true;
  }

  async function action(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<boolean> {
    const r = await emit(event, ...args);
    set({ actionError: r.ok ? null : r.error });
    return r.ok;
  }

  return {
    connection: 'idle',
    room: null,
    overlay: null,
    busy: false,
    formError: null,
    actionError: null,
    removedReason: null,
    lanUrls: [],
    clockOffset: 0,

    create: async (name) => {
      set({ busy: true, formError: null });
      return enter(await emit<JoinResult>('room:create', { name }));
    },

    join: async (code, name) => {
      set({ busy: true, formError: null });
      return enter(await emit<JoinResult>('room:join', { code, name }));
    },

    resume: async () => {
      const session = readSession();
      if (!session) return false;
      const r = await emit<JoinResult>('room:resume', session);
      if (!r.ok) {
        writeSession(null);
        set({ room: null, overlay: null, formError: r.error });
        return false;
      }
      setRoomInUrl(r.code);
      return true;
    },

    leave: async () => {
      // In a game your seat stays yours: keep the session so you can rejoin from this tab.
      const inGame = get().room?.phase !== 'lobby';
      await emit('room:leave');
      if (!inGame) writeSession(null);
      setRoomInUrl(null);
      shownEventId = 0;
      lastPhase = null;
      set({ room: null, overlay: null, actionError: null });
    },

    lobby: (a) => action('lobby:action', a),
    start: () => action('lobby:start'),
    ask: (targetId, cardId) => action('game:ask', { targetId, cardId }),
    call: (setId, partnerCards, handover) => action('game:call', { setId, partnerCards, handover }),
    rematch: () => action('game:rematch'),
    backToLobby: () => action('game:lobby'),

    dismissOverlay: () => set({ overlay: null }),
    clearError: () => set({ actionError: null, formError: null }),

    loadServerInfo: async () => {
      try {
        const res = await fetch('/api/info');
        const info = (await res.json()) as ServerInfo;
        set({ lanUrls: info.lanUrls });
      } catch {
        /* not essential */
      }
    },
  };
});

/** The room this tab was last seated in, if any. */
export function savedRoomCode(): string | null {
  return readSession()?.code ?? null;
}
