import { useMemo, useState } from 'react';
import type { GameConfig, PlayerConfig, Team } from '../types/game';
import {
  MAX_NAME_LENGTH,
  TEAM_COLORS,
  alternateSeating,
  createDefaultConfig,
  isValidPlayerCount,
  validateConfig,
} from '../engine';
import { useGameStore } from '../store/gameStore';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { RulesContent } from '../components/RulesContent';
import { cx } from '../lib/ui';

const COUNTS = [4, 5, 6, 7, 8, 9, 10];

/** Resize the draft to n players, keeping names, team names and colours where possible. */
function resize(draft: GameConfig, n: number): GameConfig {
  const fresh = createDefaultConfig(n);
  const teams = fresh.teams.map((t, i) => (draft.teams[i] ? { ...draft.teams[i], id: t.id } : t));
  const byId = new Map(draft.players.map((p) => [p.id, p]));
  const players = fresh.players.map((p) => ({ ...p, name: byId.get(p.id)?.name ?? p.name }));
  const startingPlayer =
    draft.startingPlayer === 'random' || players.some((p) => p.id === draft.startingPlayer)
      ? draft.startingPlayer
      : players[0].id;
  return { ...draft, players, teams, startingPlayer };
}

export function SetupPage({ onBack }: { onBack?: () => void }) {
  const savedConfig = useGameStore((s) => s.config);
  const startGame = useGameStore((s) => s.startGame);
  const [draft, setDraft] = useState<GameConfig>(() => structuredClone(savedConfig));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const issues = useMemo(() => validateConfig(draft), [draft]);
  const issueFor = (field: string) => issues.find((i) => i.field === field);
  const teamById = (id: string) => draft.teams.find((t) => t.id === id);

  const updatePlayer = (id: string, patch: Partial<PlayerConfig>) =>
    setDraft((d) => ({ ...d, players: d.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const updateTeam = (id: string, patch: Partial<Team>) =>
    setDraft((d) => ({ ...d, teams: d.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const moveSeat = (index: number, delta: number) =>
    setDraft((d) => {
      const players = [...d.players];
      const j = index + delta;
      if (j < 0 || j >= players.length) return d;
      [players[index], players[j]] = [players[j], players[index]];
      return { ...d, players };
    });

  const onStart = () => {
    setAttempted(true);
    if (issues.length === 0) startGame(draft);
  };

  const uniqueMessages = [...new Set(issues.map((i) => i.message))];

  return (
    <div className="mx-auto min-h-full max-w-6xl px-4 pb-16 pt-8 sm:px-8 sm:pt-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          {onBack && (
            <button type="button" className="btn-quiet mb-5 px-3.5 py-1.5 text-sm" onClick={onBack} data-testid="back-home">
              Back
            </button>
          )}
          <h1 className="font-display text-5xl font-medium italic leading-none tracking-tight text-vellum-50 sm:text-6xl">
            One device
          </h1>
          <p className="mt-3 max-w-md text-lg leading-relaxed text-vellum-300">
            Everyone shares this screen. Hands stay hidden until each player says they’re holding the device.
          </p>
        </div>
        <button type="button" className="btn-quiet" onClick={() => setRulesOpen(true)}>
          How to play
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Players & seats */}
        <section className="folio p-5 sm:p-6" aria-labelledby="players-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 id="players-heading" className="font-display text-2xl font-semibold text-vellum-50">
              Players and seats
            </h2>
            <div role="radiogroup" aria-label="Number of players" className="flex rounded-full bg-black/25 p-1">
              {COUNTS.map((n) => {
                const valid = isValidPlayerCount(n);
                const active = draft.players.length === n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!valid}
                    data-testid={`count-${n}`}
                    title={valid ? `${n} players` : `${n} players can’t form teams of two`}
                    onClick={() => setDraft((d) => resize(d, n))}
                    className={cx(
                      'numeric h-9 w-9 rounded-full text-sm font-bold transition-colors',
                      active && 'bg-brass-400 text-walnut-950',
                      !active && valid && 'text-vellum-200 hover:bg-white/10',
                      !valid && 'text-vellum-500/50 line-through decoration-1',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="-mt-2 mb-4 text-sm text-vellum-400">
            Teams are pairs, so play with 4, 6, 8 or 10. List order is the clockwise seating order.
          </p>

          <ol className="space-y-2.5">
            {draft.players.map((p, i) => {
              const team = teamById(p.teamId);
              const err = attempted ? issueFor(`player:${p.id}`) : undefined;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/15 p-2.5 sm:flex-nowrap">
                  <span className="numeric w-6 text-center font-display text-lg text-vellum-400" title={`Seat ${i + 1}`}>
                    {i + 1}
                  </span>
                  <Avatar name={p.name || '?'} color={team?.color ?? '#6b5a48'} size={36} />
                  <input
                    className="field min-w-0 flex-1"
                    value={p.name}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    aria-label={`Name for seat ${i + 1}`}
                    aria-invalid={!!err}
                    data-testid={`name-${i}`}
                  />
                  <div className="flex gap-1" role="radiogroup" aria-label={`Team for ${p.name || `seat ${i + 1}`}`}>
                    {draft.teams.map((t) => {
                      const selected = p.teamId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          title={t.name}
                          data-testid={`assign-${i}-${t.id}`}
                          onClick={() => updatePlayer(p.id, { teamId: t.id })}
                          className={cx(
                            'h-8 w-8 rounded-full border-2 transition-transform',
                            selected ? 'scale-100 border-vellum-50' : 'scale-75 border-transparent opacity-60 hover:opacity-100',
                          )}
                          style={{ background: t.color }}
                        >
                          <span className="sr-only">{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex">
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-vellum-300 hover:bg-white/10 disabled:opacity-25"
                      onClick={() => moveSeat(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${p.name} one seat earlier`}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                        <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-vellum-300 hover:bg-white/10 disabled:opacity-25"
                      onClick={() => moveSeat(i, 1)}
                      disabled={i === draft.players.length - 1}
                      aria-label={`Move ${p.name} one seat later`}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  {err && <p className="w-full pl-9 text-sm text-ember">{err.message}</p>}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="btn-quiet mt-4"
            onClick={() => setDraft((d) => ({ ...d, players: alternateSeating(d.players, d.teams) }))}
          >
            Seat teammates opposite each other
          </button>
        </section>

        <div className="flex flex-col gap-6">
          {/* Teams */}
          <section className="folio p-5 sm:p-6" aria-labelledby="teams-heading">
            <h2 id="teams-heading" className="mb-4 font-display text-2xl font-semibold text-vellum-50">
              Teams
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {draft.teams.map((t) => {
                const members = draft.players.filter((p) => p.teamId === t.id);
                const err = issueFor(`team:${t.id}`);
                return (
                  <div
                    key={t.id}
                    className="rounded-xl border-l-4 bg-black/20 p-3"
                    style={{ borderColor: t.color }}
                    data-testid={`team-${t.id}`}
                  >
                    <input
                      className="field mb-2 py-1.5 font-semibold"
                      value={t.name}
                      maxLength={MAX_NAME_LENGTH}
                      onChange={(e) => updateTeam(t.id, { name: e.target.value })}
                      aria-label="Team name"
                      aria-invalid={!!err && attempted}
                    />
                    <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${t.name} colour`}>
                      {TEAM_COLORS.map((c) => {
                        const takenBy = draft.teams.find((o) => o.id !== t.id && o.color === c.hex);
                        const selected = t.color === c.hex;
                        return (
                          <button
                            key={c.hex}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={!!takenBy}
                            title={takenBy ? `${c.name} — used by ${takenBy.name}` : c.name}
                            onClick={() => updateTeam(t.id, { color: c.hex })}
                            className={cx(
                              'h-5 w-5 rounded-full',
                              selected && 'ring-2 ring-vellum-50 ring-offset-2 ring-offset-walnut-850',
                              takenBy && 'opacity-20',
                            )}
                            style={{ background: c.hex }}
                          >
                            <span className="sr-only">{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <ul className="space-y-1 text-sm">
                      {[0, 1].map((slot) => (
                        <li key={slot} className={members[slot] ? 'text-vellum-100' : 'italic text-vellum-500'}>
                          {members[slot]?.name || 'Open spot'}
                        </li>
                      ))}
                      {members.slice(2).map((m) => (
                        <li key={m.id} className="text-ember">
                          {m.name} (one too many)
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Table preview, options, start */}
          <section className="folio p-5 sm:p-6" aria-labelledby="table-heading">
            <h2 id="table-heading" className="mb-4 font-display text-2xl font-semibold text-vellum-50">
              At the table
            </h2>
            <SeatingPreview players={draft.players} teams={draft.teams} />

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-vellum-200">Who goes first</span>
                <select
                  className="field"
                  value={draft.startingPlayer}
                  onChange={(e) => setDraft((d) => ({ ...d, startingPlayer: e.target.value }))}
                  data-testid="starting-player"
                >
                  {draft.players.map((p, i) => (
                    <option key={p.id} value={p.id}>
                      {p.name || `Seat ${i + 1}`}
                    </option>
                  ))}
                  <option value="random">Pick at random</option>
                </select>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={draft.passTheDevice}
                  onChange={(e) => setDraft((d) => ({ ...d, passTheDevice: e.target.checked }))}
                  data-testid="pass-device-toggle"
                />
                <span
                  aria-hidden
                  className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-walnut-700 transition-colors peer-checked:bg-brass-500 peer-focus-visible:outline-2 peer-focus-visible:outline-brass-300 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-vellum-100 after:transition-transform peer-checked:after:translate-x-5"
                />
                <span>
                  <span className="block font-semibold text-vellum-100">Pass-the-device screen</span>
                  <span className="block text-sm text-vellum-400">
                    Hide the hand between turns until the next player says they’re ready.
                  </span>
                </span>
              </label>
            </div>

            {attempted && uniqueMessages.length > 0 && (
              <ul className="mt-5 space-y-1 rounded-xl bg-ember/10 p-3 text-sm text-[#f3a58b]" aria-live="polite" data-testid="setup-errors">
                {uniqueMessages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
            {!attempted && uniqueMessages.length > 0 && (
              <p className="mt-5 text-sm text-vellum-400" aria-live="polite">
                {uniqueMessages[0]}
              </p>
            )}

            <button type="button" className="btn-brass mt-5 w-full py-3.5 text-lg" onClick={onStart} data-testid="start-game">
              Deal the cards
            </button>
          </section>
        </div>
      </div>

      <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title="How to play" wide>
        <RulesContent />
      </Modal>
    </div>
  );
}

/** A small round table showing seats in clockwise order, seat 1 at the bottom. */
function SeatingPreview({ players, teams }: { players: PlayerConfig[]; teams: Team[] }) {
  const n = players.length;
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-sm" aria-label="Seating plan" role="img">
      <div className="table-top absolute inset-[16%] rounded-[50%]" />
      <svg className="absolute inset-[16%] h-[68%] w-[68%] overflow-visible" viewBox="0 0 100 100" aria-hidden>
        <path
          d="M 50 84 A 34 34 0 0 1 16 50"
          fill="none"
          stroke="var(--color-brass-400)"
          strokeOpacity="0.55"
          strokeWidth="1.4"
          markerEnd="url(#cw-arrow)"
        />
        <defs>
          <marker id="cw-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--color-brass-400)" fillOpacity="0.7" />
          </marker>
        </defs>
        <text x="50" y="54" textAnchor="middle" fontSize="7" fill="var(--color-vellum-300)" fontFamily="var(--font-sans)">
          clockwise
        </text>
      </svg>
      {players.map((p, i) => {
        const angle = ((90 + (i * 360) / n) * Math.PI) / 180;
        const x = 50 + 42 * Math.cos(angle);
        const y = 50 + 40 * Math.sin(angle);
        const team = teams.find((t) => t.id === p.teamId);
        return (
          <div
            key={p.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <Avatar name={p.name || '?'} color={team?.color ?? '#6b5a48'} size={34} />
            <span className="mt-0.5 max-w-20 truncate text-xs text-vellum-200">
              <span className="numeric text-vellum-500">{i + 1}</span> {p.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
