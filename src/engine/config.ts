import type { GameConfig, PlayerConfig, Team } from '../types/game';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;
export const TEAM_SIZE = 2;
export const MAX_NAME_LENGTH = 16;

/** Turn timer choices, in seconds (0 = no timer). */
export const TURN_TIMER_OPTIONS = [0, 30, 60, 90, 120] as const;

/** Bookcloth colours offered for teams. */
export const TEAM_COLORS: readonly { name: string; hex: string }[] = [
  { name: 'Crimson', hex: '#c8423b' },
  { name: 'Cobalt', hex: '#3d6fd1' },
  { name: 'Saffron', hex: '#d99a1e' },
  { name: 'Jade', hex: '#2e9e6b' },
  { name: 'Plum', hex: '#9257b8' },
  { name: 'Teal', hex: '#2593a0' },
  { name: 'Rose', hex: '#d24f7c' },
  { name: 'Slate', hex: '#6f8193' },
];

/** Player counts that can be split into teams of exactly two. */
export const VALID_PLAYER_COUNTS = [4, 6, 8, 10] as const;

export function isValidPlayerCount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_PLAYERS && n <= MAX_PLAYERS && n % TEAM_SIZE === 0;
}

export interface ConfigIssue {
  /** 'players' | 'teams' | 'player:<id>' | 'team:<id>' | 'start' */
  field: string;
  message: string;
}

/**
 * Default setup for n players: teams of two, teammates seated directly
 * opposite each other so the teams alternate around the table.
 * Seat order p1, p2, … ; team k = { p(k), p(k + n/2) }.
 */
export function createDefaultConfig(playerCount: number): GameConfig {
  const n = isValidPlayerCount(playerCount) ? playerCount : MIN_PLAYERS;
  const teamCount = n / TEAM_SIZE;
  const teams: Team[] = Array.from({ length: teamCount }, (_, i) => ({
    id: `t${i + 1}`,
    name: TEAM_COLORS[i].name,
    color: TEAM_COLORS[i].hex,
  }));
  const players: PlayerConfig[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    teamId: teams[i % teamCount].id,
  }));
  return { players, teams, startingPlayer: players[0].id, passTheDevice: true, turnSeconds: 0 };
}

/** Validate a configuration before a game can start. Returns [] when valid. */
export function validateConfig(config: GameConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const { players, teams } = config;
  const n = players.length;

  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    issues.push({ field: 'players', message: `Literature needs ${MIN_PLAYERS}–${MAX_PLAYERS} players.` });
  } else if (n % TEAM_SIZE !== 0) {
    issues.push({ field: 'players', message: 'Teams are pairs, so the number of players must be even.' });
  }

  const expectedTeams = Math.floor(n / TEAM_SIZE);
  if (teams.length !== expectedTeams && n % TEAM_SIZE === 0) {
    issues.push({ field: 'teams', message: `${n} players need exactly ${expectedTeams} teams of two.` });
  }

  // Players: ids unique, names present and unique.
  const seenIds = new Set<string>();
  const seenNames = new Map<string, string>();
  for (const p of players) {
    if (seenIds.has(p.id)) issues.push({ field: `player:${p.id}`, message: 'Each player can only take one seat.' });
    seenIds.add(p.id);
    const name = p.name.trim();
    if (!name) {
      issues.push({ field: `player:${p.id}`, message: 'Every player needs a name.' });
    } else if (name.length > MAX_NAME_LENGTH) {
      issues.push({ field: `player:${p.id}`, message: `Names can be at most ${MAX_NAME_LENGTH} characters.` });
    } else {
      const key = name.toLocaleLowerCase();
      if (seenNames.has(key)) {
        issues.push({ field: `player:${p.id}`, message: `Two players are called “${name}”. Names must be different.` });
      }
      seenNames.set(key, p.id);
    }
  }

  // Teams: ids unique, names present and unique, colours unique.
  const teamIds = new Set<string>();
  const teamNames = new Set<string>();
  const teamColors = new Set<string>();
  for (const t of teams) {
    if (teamIds.has(t.id)) issues.push({ field: `team:${t.id}`, message: 'Duplicate team.' });
    teamIds.add(t.id);
    const name = t.name.trim();
    if (!name) {
      issues.push({ field: `team:${t.id}`, message: 'Every team needs a name.' });
    } else if (name.length > MAX_NAME_LENGTH) {
      issues.push({ field: `team:${t.id}`, message: `Team names can be at most ${MAX_NAME_LENGTH} characters.` });
    } else {
      const key = name.toLocaleLowerCase();
      if (teamNames.has(key)) issues.push({ field: `team:${t.id}`, message: `Two teams are called “${name}”.` });
      teamNames.add(key);
    }
    const color = t.color.toLowerCase();
    if (teamColors.has(color)) issues.push({ field: `team:${t.id}`, message: `${name || 'A team'} shares its colour with another team.` });
    teamColors.add(color);
  }

  // Membership: every player on exactly one existing team, every team exactly two players.
  for (const p of players) {
    if (!p.teamId) {
      issues.push({ field: `player:${p.id}`, message: `${p.name.trim() || 'A player'} isn't on a team yet.` });
    } else if (!teamIds.has(p.teamId)) {
      issues.push({ field: `player:${p.id}`, message: `${p.name.trim() || 'A player'} is assigned to a team that doesn't exist.` });
    }
  }
  for (const t of teams) {
    const size = players.filter((p) => p.teamId === t.id).length;
    if (size !== TEAM_SIZE) {
      issues.push({
        field: `team:${t.id}`,
        message: `${t.name.trim() || 'A team'} has ${size} player${size === 1 ? '' : 's'}; every team needs exactly ${TEAM_SIZE}.`,
      });
    }
  }

  if (config.startingPlayer !== 'random' && !players.some((p) => p.id === config.startingPlayer)) {
    issues.push({ field: 'start', message: 'Choose who goes first.' });
  }

  return issues;
}

/**
 * Rearrange seats so teams alternate around the table and teammates sit as
 * far apart as possible (directly opposite). Keeps each team's internal order.
 */
export function alternateSeating(players: readonly PlayerConfig[], teams: readonly Team[]): PlayerConfig[] {
  const byTeam = teams.map((t) => players.filter((p) => p.teamId === t.id));
  const unassigned = players.filter((p) => !teams.some((t) => t.id === p.teamId));
  const firstRound = byTeam.map((m) => m[0]).filter(Boolean);
  const secondRound = byTeam.map((m) => m[1]).filter(Boolean);
  const extras = byTeam.flatMap((m) => m.slice(2));
  return [...firstRound, ...secondRound, ...extras, ...unassigned];
}
