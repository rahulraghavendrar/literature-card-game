import type { GameEvent, SetId, Team } from './game';
import type { GameResult, PlayerView } from '../engine';

/** Messages exchanged between the browser and the game server. */

export interface LobbyPlayer {
  id: string;
  name: string;
  teamId: string;
  connected: boolean;
}

export interface LobbyState {
  /** Clockwise seating order. */
  players: LobbyPlayer[];
  teams: Team[];
  startingPlayer: 'random' | string;
  /** Seconds allowed for each move; 0 = no timer. */
  turnSeconds: number;
  /** Problems that stop the host starting the game. */
  issues: string[];
}

/** Everything one player is allowed to know about the room. Sent after every change. */
export interface RoomSnapshot {
  code: string;
  you: string;
  hostId: string;
  phase: 'lobby' | 'game' | 'results';
  lobby: LobbyState;
  /** Present during a game and on the results screen. Contains only `you`'s own hand. */
  game: { view: PlayerView; event: GameEvent | null } | null;
  result: GameResult | null;
  /** The move clock: when the current player's time runs out (server time, ms), or null if no clock is running. */
  turn: { deadline: number | null; serverNow: number };
}

export type Ack<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export type LobbyAction =
  | { type: 'rename'; name: string }
  | { type: 'assign'; playerId: string; teamId: string }
  | { type: 'move'; playerId: string; delta: -1 | 1 }
  | { type: 'alternate' }
  | { type: 'team'; teamId: string; name?: string; color?: string }
  | { type: 'start-player'; value: string }
  | { type: 'timer'; seconds: number }
  | { type: 'kick'; playerId: string };

export interface JoinResult {
  code: string;
  token: string;
  playerId: string;
}

export interface ClientToServerEvents {
  'room:create': (p: { name: string }, ack: (r: Ack<JoinResult>) => void) => void;
  'room:join': (p: { code: string; name: string }, ack: (r: Ack<JoinResult>) => void) => void;
  'room:resume': (p: { code: string; token: string }, ack: (r: Ack<JoinResult>) => void) => void;
  'room:leave': (ack: (r: Ack) => void) => void;
  'lobby:action': (a: LobbyAction, ack: (r: Ack) => void) => void;
  'lobby:start': (ack: (r: Ack) => void) => void;
  'game:ask': (p: { targetId: string; cardId: string }, ack: (r: Ack) => void) => void;
  'game:call': (p: { setId: SetId; partnerCards: string[]; handover: boolean }, ack: (r: Ack) => void) => void;
  'game:rematch': (ack: (r: Ack) => void) => void;
  'game:lobby': (ack: (r: Ack) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'room:removed': (p: { reason: string }) => void;
}

export interface ServerInfo {
  /** Addresses other devices on the same network can use, e.g. http://192.168.1.5:3000 */
  lanUrls: string[];
}
