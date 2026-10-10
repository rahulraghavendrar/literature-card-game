import type { PublicPlayer, PublicTeam } from '../engine';
import { cx } from '../lib/ui';

/** Live team scores. The team whose player is on turn gets a brass underline. */
export function Scoreboard({ teams, players, currentPlayerId }: { teams: PublicTeam[]; players: PublicPlayer[]; currentPlayerId: string | null }) {
  const currentTeamId = players.find((p) => p.id === currentPlayerId)?.teamId;
  return (
    <ol className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1" aria-label="Scores" data-testid="scoreboard">
      {teams.map((t) => {
        const members = t.memberIds.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);
        const active = t.id === currentTeamId;
        return (
          <li
            key={t.id}
            className={cx('flex items-center gap-2 border-b-2 py-1', active ? 'border-brass-300' : 'border-transparent')}
            data-testid={`score-${t.id}`}
            title={members.join(' & ')}
          >
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: t.color }} aria-hidden />
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-vellum-50">{t.name}</span>
              <span className="hidden max-w-36 truncate text-[11px] text-vellum-400 xl:block">{members.join(' & ')}</span>
            </span>
            <span className="numeric font-display text-2xl font-semibold text-vellum-50" data-testid={`score-value-${t.id}`}>
              {t.score}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
