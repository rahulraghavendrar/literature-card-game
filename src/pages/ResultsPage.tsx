import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { GameResult, PlayerView } from '../engine';
import { Avatar } from '../components/Avatar';
import { PlayingCard } from '../components/PlayingCard';
import { Shelf } from '../components/Shelf';
import { playerById } from '../lib/ui';

/** Final scores and every called set. `actions` holds the rematch / leave buttons. */
export function ResultsPage({ view, result, actions }: { view: PlayerView; result: GameResult; actions: ReactNode }) {
  const ranked = [...view.teams].sort((a, b) => result.scores[b.id] - result.scores[a.id]);
  const winner = view.teams.find((t) => t.id === result.winnerTeamId);
  const leaders = view.teams.filter((t) => result.leaders.includes(t.id));
  const points = (n: number) => `${n} point${n === 1 ? '' : 's'}`;

  return (
    <div className="mx-auto min-h-full max-w-5xl px-4 pb-16 pt-10 sm:px-8 sm:pt-14" data-testid="results">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <p className="font-display text-lg italic text-vellum-400">Game over</p>
        {winner ? (
          <h1 className="mt-2 font-display text-5xl font-semibold leading-tight text-vellum-50 sm:text-7xl" data-testid="winner">
            <span style={{ color: winner.color }}>{winner.name}</span> win{/s$/i.test(winner.name) ? '' : 's'}
          </h1>
        ) : (
          <h1 className="mt-2 font-display text-5xl font-semibold leading-tight text-vellum-50 sm:text-7xl" data-testid="draw">
            It’s a draw
          </h1>
        )}
        <p className="numeric mt-3 text-xl text-vellum-300">
          {winner
            ? ranked.map((t) => result.scores[t.id]).join('–') + ' in points'
            : `${leaders.map((t) => t.name).join(' and ')} tied on ${points(result.scores[leaders[0]?.id] ?? 0)}`}
        </p>
      </motion.header>

      <div className="folio mx-auto mt-10 max-w-xl p-5">
        <Shelf sets={view.sets} teams={view.teams} players={view.players} />
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {ranked.map((t) => {
          const sets = view.sets.filter((s) => s.called?.teamId === t.id);
          return (
            <section key={t.id} className="folio p-5" data-testid={`final-${t.id}`}>
              <div className="mb-4 flex items-center gap-3">
                <span className="h-4 w-4 rounded-sm" style={{ background: t.color }} aria-hidden />
                <h2 className="font-display text-2xl font-semibold text-vellum-50">{t.name}</h2>
                <span className="numeric ml-auto font-display text-4xl font-semibold text-vellum-50">{result.scores[t.id]}</span>
              </div>
              <div className="mb-4 flex flex-wrap gap-4">
                {t.memberIds.map((id) => {
                  const p = playerById(view.players, id);
                  return (
                    <span key={id} className="flex items-center gap-2 text-sm text-vellum-200">
                      <Avatar name={p?.name ?? '?'} color={t.color} size={28} />
                      {p?.name}
                    </span>
                  );
                })}
              </div>
              {sets.length === 0 ? (
                <p className="text-sm italic text-vellum-400">No sets called.</p>
              ) : (
                <ul className="space-y-2.5">
                  {sets.map((s) => (
                    <li key={s.id} className="flex items-center gap-3">
                      <div className="flex">
                        {s.called!.cards.map((c, i) => (
                          <div key={c} style={{ marginLeft: i === 0 ? 0 : -26 }}>
                            <PlayingCard cardId={c} width={38} />
                          </div>
                        ))}
                      </div>
                      <span className="text-sm text-vellum-200">
                        {s.short}
                        <span className="text-vellum-500"> · called by {playerById(view.players, s.called!.callerId)?.name}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">{actions}</div>
    </div>
  );
}
