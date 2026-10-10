import { alternateSeating, createDefaultConfig, isValidPlayerCount, validateConfig } from './config';

describe('configuration', () => {
  it('accepts the default config for every even count 4–10', () => {
    for (const n of [4, 6, 8, 10]) {
      const config = createDefaultConfig(n);
      expect(validateConfig(config)).toEqual([]);
      expect(config.teams).toHaveLength(n / 2);
    }
  });

  it('only allows even player counts between 4 and 10 (teams are pairs)', () => {
    expect([3, 4, 5, 6, 7, 8, 9, 10, 11].filter(isValidPlayerCount)).toEqual([4, 6, 8, 10]);
  });

  it('assigns every player to exactly one team of exactly two', () => {
    for (const n of [4, 6, 8, 10]) {
      const config = createDefaultConfig(n);
      for (const p of config.players) {
        expect(config.teams.filter((t) => t.id === p.teamId)).toHaveLength(1);
      }
      for (const t of config.teams) {
        expect(config.players.filter((p) => p.teamId === t.id)).toHaveLength(2);
      }
    }
  });

  it('seats teammates opposite each other by default', () => {
    const config = createDefaultConfig(6);
    expect(config.players.map((p) => p.teamId)).toEqual(['t1', 't2', 't3', 't1', 't2', 't3']);
  });

  it('rejects a team with the wrong number of players', () => {
    const config = createDefaultConfig(4);
    config.players[1].teamId = 't1';
    const issues = validateConfig(config).map((i) => i.message).join(' ');
    expect(issues).toMatch(/Crimson has 3 players/);
    expect(issues).toMatch(/Cobalt has 1 player;/);
  });

  it('rejects unassigned players and unknown teams', () => {
    const config = createDefaultConfig(4);
    config.players[0].teamId = '';
    config.players[1].teamId = 'nope';
    const messages = validateConfig(config).map((i) => i.message);
    expect(messages.some((m) => /isn't on a team/.test(m))).toBe(true);
    expect(messages.some((m) => /doesn't exist/.test(m))).toBe(true);
  });

  it('rejects odd player counts', () => {
    const config = createDefaultConfig(4);
    config.players.push({ id: 'p5', name: 'Extra', teamId: 't1' });
    expect(validateConfig(config).some((i) => /must be even/.test(i.message))).toBe(true);
  });

  it('rejects blank and duplicate names', () => {
    const config = createDefaultConfig(4);
    config.players[0].name = '  ';
    config.players[1].name = 'Priya';
    config.players[2].name = 'priya';
    config.teams[1].name = config.teams[0].name;
    config.teams[1].color = config.teams[0].color;
    const messages = validateConfig(config).map((i) => i.message);
    expect(messages).toContain('Every player needs a name.');
    expect(messages.some((m) => /Two players are called/.test(m))).toBe(true);
    expect(messages.some((m) => /Two teams are called/.test(m))).toBe(true);
    expect(messages.some((m) => /shares its colour/.test(m))).toBe(true);
  });

  it('rejects a player sitting in two seats', () => {
    const config = createDefaultConfig(4);
    config.players[3] = { ...config.players[0] };
    expect(validateConfig(config).some((i) => /one seat/.test(i.message))).toBe(true);
  });

  it('requires a valid starting player', () => {
    const config = createDefaultConfig(4);
    config.startingPlayer = 'ghost';
    expect(validateConfig(config).some((i) => i.field === 'start')).toBe(true);
    config.startingPlayer = 'random';
    expect(validateConfig(config)).toEqual([]);
  });

  it('alternates seating so teams interleave', () => {
    const config = createDefaultConfig(6);
    // Seat teammates next to each other, then re-alternate.
    const grouped = [...config.players].sort((a, b) => a.teamId.localeCompare(b.teamId));
    const seated = alternateSeating(grouped, config.teams);
    expect(seated.map((p) => p.teamId)).toEqual(['t1', 't2', 't3', 't1', 't2', 't3']);
  });
});
