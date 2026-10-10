import type { PublicSet, PublicTeam, PublicPlayer } from '../engine';
import { cx, playerById, teamOf } from '../lib/ui';

/**
 * The nine sets as volumes on a bookshelf. An empty slot is still in play; a
 * bound spine in a team's colour has been called by that team. This is game
 * progress, not a log of moves.
 */
export function Shelf({ sets, teams, players }: { sets: PublicSet[]; teams: PublicTeam[]; players: PublicPlayer[] }) {
  return (
    <div data-testid="shelf">
      <div className="flex items-end justify-between gap-1 px-2">
        {sets.map((s) => {
          const team = teamOf(teams, s.called?.teamId);
          const by = playerById(players, s.called?.callerId);
          const title =
            s.status === 'in-play' ? `${s.name} (${s.short}): still in play` : `${s.name}: called by ${by?.name} for ${team?.name}`;
          const special = s.category === 'special';
          const called = s.status === 'called';
          return (
            <div
              key={s.id}
              title={title}
              aria-label={title}
              role="img"
              data-testid={`shelf-${s.id}`}
              data-status={s.status}
              className={cx(
                'relative flex flex-1 items-center justify-center overflow-hidden rounded-t-[3px] transition-colors',
                !called && 'border border-b-0 border-dashed border-vellum-300/20',
              )}
              style={{
                height: special ? 104 : 92,
                maxWidth: 40,
                minWidth: 22,
                background: called
                  ? `linear-gradient(90deg, color-mix(in oklab, ${team?.color} 70%, black), ${team?.color} 35%, color-mix(in oklab, ${team?.color} 85%, white) 55%, ${team?.color} 70%, color-mix(in oklab, ${team?.color} 60%, black))`
                  : 'transparent',
              }}
            >
              {called && (
                <>
                  <span className="absolute inset-x-0 top-2 h-[3px] bg-brass-300/80" />
                  <span className="absolute inset-x-0 bottom-2 h-[3px] bg-brass-300/80" />
                </>
              )}
              <span
                className={cx(
                  'rotate-180 whitespace-nowrap font-display text-[12px] font-semibold [writing-mode:vertical-rl]',
                  called ? 'text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.4)]' : 'text-vellum-400/80',
                )}
              >
                {s.short}
              </span>
            </div>
          );
        })}
      </div>
      {/* The plank */}
      <div className="h-3 rounded-sm bg-gradient-to-b from-walnut-600 to-walnut-800 shadow-[0_6px_10px_-4px_rgb(0_0_0/0.7)]" />
    </div>
  );
}
