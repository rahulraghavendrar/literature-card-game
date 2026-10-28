import { randomUUID } from 'node:crypto';
import type { GameConfig, GameState, SetId, Team } from '../src/types/game';
import type { LobbyAction, RoomSnapshot } from '../src/types/protocol';
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  TEAM_COLORS,
  TURN_TIMER_OPTIONS,
  acknowledgeEvent,
  alternateSeating,
  callSet,
  createGame,
  getPlayerView,
  getResult,
  publicEvent,
  requestCard,
  timeOut,
  validateConfig,
  type GameResult,
  type Rng,
} from '../src/engine';

/**
 * One online game room. Pure game/lobby logic with no networking, so it can
 * be unit-tested directly. The server (index.ts) wires it to sockets.
 *
 * The room holds the full GameState privately; the only thing that ever
 * leaves it is `snapshotFor(memberId)`, which contains that member's own
 * hand and public information.
 */

export interface Member {
  id: string;
  /** Secret that lets a player rejoin their seat after a refresh or dropped connection. */
  token: string;
  name: string;
  teamId: string;
  connected: boolean;
}

export type Result = { ok: true } | { ok: false; error: string };
const OK: Result = { ok: true };
const err = (error: string): Result => ({ ok: false, error });

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

export function normaliseCode(code: unknown): string {
  return typeof code === 'string' ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

function cleanName(name: unknown): string {
  return typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) : '';
}

export interface RoomOptions {
  /** Deterministic shuffles for tests. */
  rng?: () => Rng;
}

export class Room {
  readonly code: string;
  hostId = '';
  members: Member[] = [];
  teams: Team[] = [];
  startingPlayer: 'random' | string = 'random';
  /** Seconds allowed for each move; 0 = no timer. */
  turnSeconds = 60;
  /** When the current player's time runs out (ms since epoch), or null. */
  turnDeadline: number | null = null;
  private clockKey: string | null = null;
  phase: 'lobby' | 'game' | 'results' = 'lobby';
  game: GameState | null = null;
  result: GameResult | null = null;
  lastActivity = Date.now();
  private nextMemberNumber = 1;
  private nextTeamNumber = 1;
  private readonly options: RoomOptions;

  constructor(code: string, options: RoomOptions = {}) {
    this.code = code;
    this.options = options;
  }

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  member(id: string): Member | undefined {
    return this.members.find((m) => m.id === id);
  }

  findByToken(token: unknown): Member | undefined {
    return typeof token === 'string' ? this.members.find((m) => m.token === token) : undefined;
  }

  isEmpty(): boolean {
    return this.members.length === 0;
  }

  anyoneConnected(): boolean {
    return this.members.some((m) => m.connected);
  }

  /** Add a new player to the lobby. */
  join(rawName: unknown): { ok: true; member: Member } | { ok: false; error: string } {
    if (this.phase !== 'lobby') return { ok: false, error: 'This game has already started.' };
    if (this.members.length >= MAX_PLAYERS) return { ok: false, error: `This room is full (${MAX_PLAYERS} players).` };
    const n = this.nextMemberNumber++;
    const member: Member = {
      id: `m${n}`,
      token: randomUUID(),
      name: this.uniqueName(cleanName(rawName) || `Player ${n}`),
      teamId: '',
      connected: true,
    };
    this.members.push(member);
    if (!this.hostId) this.hostId = member.id;
    this.normaliseTeams(); // also places the new player on the emptiest team
    this.touch();
    return { ok: true, member };
  }

  /** Leave the lobby. During a game a player keeps their seat (they're just offline). */
  leave(memberId: string): Result {
    const m = this.member(memberId);
    if (!m) return err('You are not in this room.');
    if (this.phase !== 'lobby') {
      this.setConnected(memberId, false);
      return OK;
    }
    this.members = this.members.filter((x) => x.id !== memberId);
    if (this.startingPlayer === memberId) this.startingPlayer = 'random';
    if (this.hostId === memberId) this.hostId = this.members.find((x) => x.connected)?.id ?? this.members[0]?.id ?? '';
    this.normaliseTeams();
    this.touch();
    return OK;
  }

  setConnected(memberId: string, connected: boolean): void {
    const m = this.member(memberId);
    if (!m) return;
    m.connected = connected;
    this.touch();
  }

  /**
   * The player with host controls right now: the host, or — while the host is
   * offline (say, refreshing their page) — the first connected player. The
   * host gets the controls back when they return.
   */
  effectiveHostId(): string {
    if (this.member(this.hostId)?.connected) return this.hostId;
    return this.members.find((m) => m.connected)?.id ?? this.hostId;
  }

  private uniqueName(name: string, exceptId?: string): string {
    const taken = (n: string) =>
      this.members.some((m) => m.id !== exceptId && m.name.toLocaleLowerCase() === n.toLocaleLowerCase());
    if (!taken(name)) return name;
    for (let i = 2; ; i++) {
      const suffix = ` ${i}`;
      const candidate = name.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix;
      if (!taken(candidate)) return candidate;
    }
  }

  // -------------------------------------------------------------------------
  // Teams
  // -------------------------------------------------------------------------

  private teamSize(teamId: string): number {
    return this.members.filter((m) => m.teamId === teamId).length;
  }

  /** The emptiest team that still has room (the earliest one on a tie). */
  private teamWithSpace(): Team | undefined {
    let best: Team | undefined;
    for (const t of this.teams) {
      const size = this.teamSize(t.id);
      if (size < 2 && (!best || size < this.teamSize(best.id))) best = t;
    }
    return best;
  }

  /** Keep exactly ceil(players / 2) teams (at least two), and everyone on one of them. */
  private normaliseTeams(): void {
    const target = Math.max(2, Math.ceil(this.members.length / 2));
    while (this.teams.length < target) {
      const used = new Set(this.teams.map((t) => t.color));
      const usedNames = new Set(this.teams.map((t) => t.name));
      const color = TEAM_COLORS.find((c) => !used.has(c.hex) && !usedNames.has(c.name)) ?? TEAM_COLORS[0];
      this.teams.push({ id: `t${this.nextTeamNumber++}`, name: color.name, color: color.hex });
    }
    while (this.teams.length > target) {
      // Remove the emptiest team (the later one on a tie).
      let victim = this.teams[this.teams.length - 1];
      for (const t of this.teams) if (this.teamSize(t.id) < this.teamSize(victim.id)) victim = t;
      this.teams = this.teams.filter((t) => t.id !== victim.id);
      for (const m of this.members.filter((x) => x.teamId === victim.id)) {
        m.teamId = this.teamWithSpace()?.id ?? this.teams[0].id;
      }
    }
    for (const m of this.members) {
      if (!this.teams.some((t) => t.id === m.teamId)) m.teamId = this.teamWithSpace()?.id ?? this.teams[0].id;
    }
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  config(): GameConfig {
    return {
      players: this.members.map((m) => ({ id: m.id, name: m.name, teamId: m.teamId })),
      teams: this.teams.map((t) => ({ ...t })),
      startingPlayer: this.startingPlayer,
      passTheDevice: false,
      turnSeconds: this.turnSeconds,
    };
  }

  lobbyAction(actorId: string, action: LobbyAction): Result {
    if (this.phase !== 'lobby') return err('The game has already started.');
    const actor = this.member(actorId);
    if (!actor) return err('You are not in this room.');
    const isHost = actorId === this.effectiveHostId();
    if (!action || typeof action !== 'object') return err('Unknown action.');

    switch (action.type) {
      case 'rename': {
        const name = cleanName(action.name);
        if (!name) return err('Enter a name.');
        if (this.members.some((m) => m.id !== actorId && m.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
          return err(`Someone is already called ${name}.`);
        }
        actor.name = name;
        break;
      }
      case 'assign': {
        if (!isHost && action.playerId !== actorId) return err('Only the host can move other players.');
        const target = this.member(action.playerId);
        if (!target) return err('That player has left.');
        if (!this.teams.some((t) => t.id === action.teamId)) return err('That team does not exist.');
        if (target.teamId === action.teamId) break;
        if (this.teamSize(action.teamId) >= 2) {
          // Swap with someone on the full team so teams stay pairs.
          const other = isHost ? this.members.find((m) => m.teamId === action.teamId) : undefined;
          if (!other) return err('That team is full.');
          other.teamId = target.teamId;
        }
        target.teamId = action.teamId;
        break;
      }
      case 'move': {
        if (!isHost) return err('Only the host can change seats.');
        const i = this.members.findIndex((m) => m.id === action.playerId);
        const j = i + (action.delta === -1 ? -1 : 1);
        if (i < 0 || j < 0 || j >= this.members.length) return err('That seat can’t move further.');
        [this.members[i], this.members[j]] = [this.members[j], this.members[i]];
        break;
      }
      case 'alternate': {
        if (!isHost) return err('Only the host can change seats.');
        const order = alternateSeating(this.config().players, this.teams).map((p) => p.id);
        this.members.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        break;
      }
      case 'team': {
        const team = this.teams.find((t) => t.id === action.teamId);
        if (!team) return err('That team does not exist.');
        if (!isHost && actor.teamId !== team.id) return err('Only the host or the team’s players can change a team.');
        if (action.name !== undefined) {
          const name = cleanName(action.name);
          if (!name) return err('Enter a team name.');
          team.name = name;
        }
        if (action.color !== undefined) {
          if (!TEAM_COLORS.some((c) => c.hex === action.color)) return err('Pick one of the team colours.');
          if (this.teams.some((t) => t.id !== team.id && t.color === action.color)) return err('Another team has that colour.');
          team.color = action.color;
        }
        break;
      }
      case 'start-player': {
        if (!isHost) return err('Only the host can choose who goes first.');
        if (action.value !== 'random' && !this.member(action.value)) return err('That player has left.');
        this.startingPlayer = action.value;
        break;
      }
      case 'timer': {
        if (!isHost) return err('Only the host can set the turn timer.');
        if (!(TURN_TIMER_OPTIONS as readonly number[]).includes(action.seconds)) return err('Pick one of the timer options.');
        this.turnSeconds = action.seconds;
        break;
      }
      case 'kick': {
        if (!isHost) return err('Only the host can remove players.');
        if (action.playerId === actorId) return err('Use “Leave room” to leave.');
        if (!this.member(action.playerId)) return err('That player has already left.');
        return this.leave(action.playerId);
      }
      default:
        return err('Unknown action.');
    }
    this.touch();
    return OK;
  }

  issues(): string[] {
    const issues = validateConfig(this.config()).map((i) => i.message);
    const offline = this.members.filter((m) => !m.connected).map((m) => m.name);
    if (offline.length > 0) issues.push(`Waiting for ${offline.join(', ')} to reconnect.`);
    return [...new Set(issues)];
  }

  start(actorId: string): Result {
    if (actorId !== this.effectiveHostId()) return err('Only the host can start the game.');
    if (this.phase !== 'lobby') return err('The game has already started.');
    const issues = this.issues();
    if (issues.length > 0) return err(issues[0]);
    this.game = createGame(this.config(), { rng: this.options.rng?.() });
    this.clockKey = null;
    this.turnDeadline = null;
    this.phase = 'game';
    this.result = null;
    this.touch();
    return OK;
  }

  rematch(actorId: string): Result {
    if (actorId !== this.effectiveHostId()) return err('Only the host can start a rematch.');
    if (this.phase !== 'results') return err('The game isn’t over yet.');
    this.phase = 'lobby';
    const r = this.start(actorId);
    if (!r.ok) this.phase = 'results';
    return r;
  }

  backToLobby(actorId: string): Result {
    if (actorId !== this.effectiveHostId()) return err('Only the host can go back to the lobby.');
    if (this.phase !== 'results') return err('The game isn’t over yet.');
    this.phase = 'lobby';
    this.game = null;
    this.result = null;
    // Players who never came back are dropped from the lobby.
    for (const m of this.members.filter((x) => !x.connected)) this.leave(m.id);
    this.touch();
    return OK;
  }

  // -------------------------------------------------------------------------
  // Game actions (all validated by the engine)
  // -------------------------------------------------------------------------

  ask(actorId: string, targetId: unknown, cardId: unknown): Result {
    if (this.phase !== 'game' || !this.game) return err('There is no game in progress.');
    if (typeof targetId !== 'string' || typeof cardId !== 'string') return err('Choose a player and a card.');
    const r = requestCard(this.game, actorId, targetId, cardId);
    if (!r.ok) return err(r.error.message);
    this.game = r.state;
    this.touch();
    return OK;
  }

  call(actorId: string, setId: unknown, partnerCards: unknown, handover: unknown): Result {
    if (this.phase !== 'game' || !this.game) return err('There is no game in progress.');
    if (typeof setId !== 'string' || !Array.isArray(partnerCards) || !partnerCards.every((c) => typeof c === 'string')) {
      return err('Choose a set and name your partner’s cards.');
    }
    const r = callSet(this.game, actorId, setId as SetId, partnerCards as string[], handover === true);
    if (!r.ok) return err(r.error.message);
    this.game = r.state;
    this.touch();
    return OK;
  }

  /** Called by the server once the current announcement has been on screen long enough. */
  acknowledge(): boolean {
    if (!this.game?.pendingEvent) return false;
    const r = acknowledgeEvent(this.game);
    if (r.ok) this.game = r.state;
    if (this.game.status === 'finished') {
      this.phase = 'results';
      this.result = getResult(this.game);
    }
    return true;
  }

  hasPendingEvent(): boolean {
    return !!this.game?.pendingEvent;
  }

  // -------------------------------------------------------------------------
  // The move clock
  // -------------------------------------------------------------------------

  /**
   * Start or keep the clock for the move that is now due. Every new move
   * (after each announcement) gets the full time; the clock is stopped while
   * an announcement is on screen. Returns ms until it runs out, or null when
   * no clock should run. `scale` shortens the timer for tests.
   */
  syncClock(now = Date.now(), scale = 1): number | null {
    const g = this.game;
    if (this.phase !== 'game' || !g || g.status !== 'playing' || g.pendingEvent || !g.turnSeconds) {
      this.turnDeadline = null;
      this.clockKey = null;
      return null;
    }
    const key = `${g.eventCounter}:${g.currentPlayerId}`;
    if (key !== this.clockKey || this.turnDeadline === null) {
      this.clockKey = key;
      this.turnDeadline = now + g.turnSeconds * 1000 * scale;
    }
    return Math.max(0, this.turnDeadline - now);
  }

  /** The current player's time is up: pass the turn. Returns true if it did. */
  expireTurn(now = Date.now()): boolean {
    const g = this.game;
    if (!g || this.turnDeadline === null || now < this.turnDeadline - 100 || !g.currentPlayerId) return false;
    const r = timeOut(g, g.currentPlayerId);
    if (!r.ok) return false;
    this.game = r.state;
    this.turnDeadline = null;
    this.touch();
    return true;
  }

  // -------------------------------------------------------------------------
  // What each player receives
  // -------------------------------------------------------------------------

  snapshotFor(memberId: string): RoomSnapshot {
    return {
      code: this.code,
      you: memberId,
      hostId: this.effectiveHostId(),
      phase: this.phase,
      lobby: {
        players: this.members.map((m) => ({ id: m.id, name: m.name, teamId: m.teamId, connected: m.connected })),
        teams: this.teams.map((t) => ({ ...t })),
        startingPlayer: this.startingPlayer,
        turnSeconds: this.turnSeconds,
        issues: this.phase === 'lobby' ? this.issues() : [],
      },
      game: this.game
        ? { view: getPlayerView(this.game, this.member(memberId) ? memberId : null), event: publicEvent(this.game.pendingEvent) }
        : null,
      result: this.result ? { ...this.result, scores: { ...this.result.scores }, leaders: [...this.result.leaders] } : null,
      turn: { deadline: this.turnDeadline, serverNow: Date.now() },
    };
  }

  private touch() {
    this.lastActivity = Date.now();
  }
}
