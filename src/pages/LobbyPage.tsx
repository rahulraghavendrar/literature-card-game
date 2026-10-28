import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_NAME_LENGTH, TEAM_COLORS, TURN_TIMER_OPTIONS } from '../engine';
import { useOnlineStore } from '../store/onlineStore';
import type { RoomSnapshot } from '../types/protocol';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { RulesContent } from '../components/RulesContent';
import { cx } from '../lib/ui';

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** The link other players open. On localhost, use the computer's network address instead. */
function useShareLink(code: string): { link: string; lanOnly: boolean } {
  const lanUrls = useOnlineStore((s) => s.lanUrls);
  const loadServerInfo = useOnlineStore((s) => s.loadServerInfo);
  useEffect(() => {
    void loadServerInfo();
  }, [loadServerInfo]);
  const local = isLocalHost(window.location.hostname);
  const base = local && lanUrls[0] ? lanUrls[0] : window.location.origin;
  return { link: `${base}/?room=${code}`, lanOnly: local };
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      inputRef.current?.select();
    }
  };
  return (
    <div className="flex gap-2">
      <input ref={inputRef} className="field min-w-0 flex-1 text-sm" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" data-testid="invite-link" />
      <button type="button" className="btn-quiet shrink-0" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function LobbyPage({ room }: { room: RoomSnapshot }) {
  const { lobby, start, leave, actionError, clearError } = useOnlineStore();
  const { players, teams, startingPlayer, issues, turnSeconds } = room.lobby;
  const isHost = room.you === room.hostId;
  const me = players.find((p) => p.id === room.you);
  const host = players.find((p) => p.id === room.hostId);
  const { link, lanOnly } = useShareLink(room.code);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(me?.name ?? '');
  const [teamDrafts, setTeamDrafts] = useState<Record<string, string>>({});

  useEffect(() => setNameDraft(me?.name ?? ''), [me?.name]);

  const teamMembers = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.id, players.filter((p) => p.teamId === t.id)])),
    [teams, players],
  );

  const commitName = () => {
    const n = nameDraft.trim();
    if (n && n !== me?.name) void lobby({ type: 'rename', name: n });
    else setNameDraft(me?.name ?? '');
  };

  return (
    <div className="mx-auto min-h-full max-w-6xl px-4 pb-16 pt-8 sm:px-8 sm:pt-12" data-testid="lobby">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-display text-lg italic text-vellum-400">Literature · room</p>
          <p className="mt-1 flex gap-1.5" aria-label={`Room code ${room.code.split('').join(' ')}`} data-testid="room-code">
            {room.code.split('').map((ch, i) => (
              <span
                key={i}
                className="flex h-14 w-11 items-center justify-center rounded-lg bg-vellum-100 font-display text-3xl font-semibold text-walnut-950 shadow-[inset_0_-3px_0_rgb(0_0_0/0.15)] sm:h-16 sm:w-12"
              >
                {ch}
              </span>
            ))}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-quiet" onClick={() => setRulesOpen(true)}>
            How to play
          </button>
          <button type="button" className="btn-quiet" onClick={() => void leave()} data-testid="leave-room">
            Leave room
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-6">
          <section className="folio p-5 sm:p-6" aria-labelledby="invite-heading">
            <h2 id="invite-heading" className="mb-2 font-display text-2xl font-semibold text-vellum-50">
              Invite players
            </h2>
            <p className="mb-3 text-sm text-vellum-300">
              Send this link, or have them open the game and enter the code <strong className="text-vellum-50">{room.code}</strong>.
              {lanOnly && ' This link works for anyone on the same Wi‑Fi as this computer.'}
            </p>
            <CopyLink link={link} />
          </section>

          <section className="folio p-5 sm:p-6" aria-labelledby="seats-heading">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="seats-heading" className="font-display text-2xl font-semibold text-vellum-50">
                Seats
              </h2>
              <p className="numeric text-sm text-vellum-400">{players.length} of 10 · play goes down the list, clockwise</p>
            </div>
            <ol className="space-y-2.5">
              {players.map((p, i) => {
                const team = teams.find((t) => t.id === p.teamId);
                const isMe = p.id === room.you;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/15 p-2.5 sm:flex-nowrap" data-testid={`lobby-player-${i}`}>
                    <span className="numeric w-5 text-center font-display text-lg text-vellum-400">{i + 1}</span>
                    <Avatar name={p.name} color={team?.color ?? '#6b5a48'} size={36} dim={!p.connected} />
                    <div className="min-w-[8rem] flex-1">
                      {isMe ? (
                        <input
                          className="field py-1.5"
                          value={nameDraft}
                          maxLength={MAX_NAME_LENGTH}
                          onChange={(e) => setNameDraft(e.target.value)}
                          onBlur={commitName}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          aria-label="Your name"
                          data-testid="my-name"
                        />
                      ) : (
                        <p className="truncate font-semibold text-vellum-50">{p.name}</p>
                      )}
                      <p className="text-xs text-vellum-400">
                        {[isMe && 'you', p.id === room.hostId && 'host', !p.connected && 'offline'].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex gap-1" role="radiogroup" aria-label={`Team for ${p.name}`}>
                      {teams.map((t) => {
                        const selected = p.teamId === t.id;
                        const canChange = isHost || isMe;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={!canChange}
                            title={t.name}
                            onClick={() => void lobby({ type: 'assign', playerId: p.id, teamId: t.id })}
                            data-testid={`lobby-assign-${i}-${t.id}`}
                            className={cx(
                              'h-7 w-7 rounded-full border-2 transition-transform disabled:cursor-default',
                              selected ? 'scale-100 border-vellum-50' : 'scale-75 border-transparent opacity-50',
                              canChange && !selected && 'hover:opacity-100',
                            )}
                            style={{ background: t.color }}
                          >
                            <span className="sr-only">{t.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    {isHost && (
                      <div className="flex">
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-vellum-300 hover:bg-white/10 disabled:opacity-25"
                          onClick={() => void lobby({ type: 'move', playerId: p.id, delta: -1 })}
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
                          onClick={() => void lobby({ type: 'move', playerId: p.id, delta: 1 })}
                          disabled={i === players.length - 1}
                          aria-label={`Move ${p.name} one seat later`}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                          </svg>
                        </button>
                        {!isMe && (
                          <button
                            type="button"
                            className="rounded-md px-2 text-xs text-vellum-400 hover:bg-white/10 hover:text-ember"
                            onClick={() => void lobby({ type: 'kick', playerId: p.id })}
                            aria-label={`Remove ${p.name}`}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {players.length < 4 && (
              <p className="mt-4 text-sm text-vellum-400">Waiting for more players. You need at least 4 (4, 6, 8 or 10).</p>
            )}
            {isHost && players.length >= 4 && (
              <button type="button" className="btn-quiet mt-4" onClick={() => void lobby({ type: 'alternate' })} data-testid="alternate">
                Seat teammates opposite each other
              </button>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="folio p-5 sm:p-6" aria-labelledby="teams-heading">
            <h2 id="teams-heading" className="mb-4 font-display text-2xl font-semibold text-vellum-50">
              Teams
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {teams.map((t) => {
                const members = teamMembers[t.id] ?? [];
                const canEdit = isHost || me?.teamId === t.id;
                const draft = teamDrafts[t.id] ?? t.name;
                return (
                  <div key={t.id} className="rounded-xl border-l-4 bg-black/20 p-3" style={{ borderColor: t.color }} data-testid={`lobby-team-${t.id}`}>
                    {canEdit ? (
                      <input
                        className="field mb-2 py-1.5 font-semibold"
                        value={draft}
                        maxLength={MAX_NAME_LENGTH}
                        onChange={(e) => setTeamDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                        onBlur={() => {
                          if (draft.trim() && draft.trim() !== t.name) void lobby({ type: 'team', teamId: t.id, name: draft });
                          setTeamDrafts((d) => {
                            const { [t.id]: _drop, ...rest } = d;
                            void _drop;
                            return rest;
                          });
                        }}
                        aria-label="Team name"
                      />
                    ) : (
                      <p className="mb-2 font-semibold text-vellum-50">{t.name}</p>
                    )}
                    {canEdit && (
                      <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${t.name} colour`}>
                        {TEAM_COLORS.map((c) => {
                          const takenBy = teams.find((o) => o.id !== t.id && o.color === c.hex);
                          return (
                            <button
                              key={c.hex}
                              type="button"
                              role="radio"
                              aria-checked={t.color === c.hex}
                              disabled={!!takenBy}
                              title={takenBy ? `${c.name} — used by ${takenBy.name}` : c.name}
                              onClick={() => void lobby({ type: 'team', teamId: t.id, color: c.hex })}
                              className={cx(
                                'h-5 w-5 rounded-full',
                                t.color === c.hex && 'ring-2 ring-vellum-50 ring-offset-2 ring-offset-walnut-850',
                                takenBy && 'opacity-20',
                              )}
                              style={{ background: c.hex }}
                            >
                              <span className="sr-only">{c.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <ul className="space-y-1 text-sm">
                      {[0, 1].map((slot) => (
                        <li key={slot} className={members[slot] ? 'text-vellum-100' : 'italic text-vellum-500'}>
                          {members[slot]?.name ?? 'Open spot'}
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

          <section className="folio p-5 sm:p-6" aria-labelledby="start-heading">
            <h2 id="start-heading" className="mb-4 font-display text-2xl font-semibold text-vellum-50">
              Start
            </h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-vellum-200">Who goes first</span>
              <select
                className="field"
                value={startingPlayer}
                disabled={!isHost}
                onChange={(e) => void lobby({ type: 'start-player', value: e.target.value })}
                data-testid="lobby-starting-player"
              >
                <option value="random">Pick at random</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-vellum-200">Time for each move</span>
              <select
                className="field"
                value={turnSeconds}
                disabled={!isHost}
                onChange={(e) => void lobby({ type: 'timer', seconds: Number(e.target.value) })}
                data-testid="lobby-timer"
              >
                {TURN_TIMER_OPTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec === 0 ? 'No timer' : sec < 60 ? `${sec} seconds` : sec === 60 ? '1 minute' : `${sec / 60} minutes`}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-vellum-400">When time runs out, the turn passes to the next player clockwise.</span>
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-vellum-200">Time for each move</span>
              <select
                className="field"
                value={turnSeconds}
                disabled={!isHost}
                onChange={(e) => void lobby({ type: 'timer', seconds: Number(e.target.value) })}
                data-testid="lobby-timer"
              >
                {TURN_TIMER_OPTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec === 0 ? 'No timer' : sec < 60 ? `${sec} seconds` : sec === 60 ? '1 minute' : `${sec / 60} minutes`}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-vellum-400">If time runs out, the turn passes to the next player.</span>
            </label>

            {issues.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm text-vellum-300" aria-live="polite" data-testid="lobby-issues">
                {issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
            {actionError && (
              <p className="mt-3 rounded-lg bg-ember/10 px-3 py-2 text-sm text-[#f3a58b]" role="alert" onClick={clearError}>
                {actionError}
              </p>
            )}

            {isHost ? (
              <button
                type="button"
                className="btn-brass mt-5 w-full py-3.5 text-lg"
                disabled={issues.length > 0}
                onClick={() => void start()}
                data-testid="lobby-start"
              >
                Deal the cards
              </button>
            ) : (
              <p className="mt-5 rounded-xl bg-black/20 px-4 py-3 text-center text-vellum-300" data-testid="waiting-for-host">
                Waiting for {host?.name ?? 'the host'} to start the game.
              </p>
            )}
          </section>
        </div>
      </div>

      <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title="How to play" wide>
        <RulesContent />
      </Modal>
    </div>
  );
}
