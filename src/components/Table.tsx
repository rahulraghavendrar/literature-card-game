import { motion } from 'framer-motion';
import type { PlayerView } from '../engine';
import { Avatar } from './Avatar';
import { PlayingCard } from './PlayingCard';
import { cx, plural, possessive, teamOf } from '../lib/ui';

/**
 * The virtual table. Seats are fixed; the view is rotated so the person
 * holding the device sits at the bottom. Rotation preserves clockwise order:
 * from the bottom, play moves left, across the top, then down the right.
 */
export function Table({ view, offlineIds = [] }: { view: PlayerView; offlineIds?: string[] }) {
  const n = view.players.length;
  const anchorId = view.viewerId ?? view.currentPlayerId ?? view.players[0].id;
  const anchorSeat = view.players.find((p) => p.id === anchorId)?.seat ?? 0;
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const currentTeam = teamOf(view.teams, current?.teamId);
  const inPlay = view.sets.filter((s) => s.status === 'in-play').length;
  const handoverFrom = view.players.find((p) => p.id === view.handoverFromId);
  const resumeAfter = view.players.find((p) => p.id === view.resumeAfterId);

  return (
    <div className="relative h-full w-full" data-testid="table">
      <div className="table-top absolute inset-x-[9%] inset-y-[13%] rounded-[50%]" />

      {/* Centre: whose turn, and the direction of play */}
      <div className="absolute inset-x-[9%] inset-y-[13%] flex items-center justify-center">
        <div className="relative flex aspect-square h-[82%] max-h-72 items-center justify-center">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
            <defs>
              <marker id="table-cw" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="var(--color-brass-300)" />
              </marker>
            </defs>
            {[0, 1, 2].map((k) => {
              const a0 = ((100 + k * 120) * Math.PI) / 180;
              const a1 = ((170 + k * 120) * Math.PI) / 180;
              return (
                <path
                  key={k}
                  d={`M ${50 + 46 * Math.cos(a0)} ${50 + 46 * Math.sin(a0)} A 46 46 0 0 1 ${50 + 46 * Math.cos(a1)} ${50 + 46 * Math.sin(a1)}`}
                  fill="none"
                  stroke="var(--color-brass-300)"
                  strokeOpacity="0.35"
                  strokeWidth="1.2"
                  markerEnd="url(#table-cw)"
                />
              );
            })}
          </svg>
          <div className="px-4 text-center" aria-live="polite" data-testid="turn-indicator">
            {current ? (
              <>
                <p className="font-display text-[clamp(1.1rem,2.4vw,1.9rem)] font-semibold leading-tight text-vellum-50">
                  {possessive(current.name)} turn
                </p>
                <p className="mt-1 text-sm font-semibold" style={{ color: currentTeam?.color }}>
                  <span className="rounded-full bg-black/30 px-2 py-0.5">{currentTeam?.name}</span>
                </p>
                {handoverFrom && (
                  <p className="mt-1.5 text-xs text-vellum-200" data-testid="handover-note">
                    handed over by {handoverFrom.name}
                    {resumeAfter && <span className="block text-vellum-400">after a miss, play goes on from {resumeAfter.name}</span>}
                  </p>
                )}
              </>
            ) : (
              <p className="font-display text-xl text-vellum-100">Game over</p>
            )}
            <p className="numeric mt-2 text-xs text-vellum-300/80">{plural(inPlay, 'set')} still in play</p>
          </div>
        </div>
      </div>

      {/* Seats */}
      {view.players.map((p) => {
        const offset = (p.seat - anchorSeat + n) % n;
        const angle = ((90 + (offset * 360) / n) * Math.PI) / 180;
        const x = 50 + 44 * Math.cos(angle);
        const y = 50 + 42 * Math.sin(angle);
        const team = teamOf(view.teams, p.teamId);
        const isViewer = p.id === view.viewerId;
        const isPartner = p.id === view.partnerId;
        const out = p.cardCount === 0;
        const offline = offlineIds.includes(p.id);
        return (
          <motion.div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            initial={false}
            animate={{ left: `${x}%`, top: `${y}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            data-testid={`seat-${p.id}`}
            data-current={p.isCurrent || undefined}
          >
            <div className="flex w-24 flex-col items-center text-center">
              <Avatar name={p.name} color={team?.color ?? '#777'} size={46} ring={p.isCurrent} dim={out || offline} />
              <p
                className={cx(
                  'mt-1.5 max-w-full truncate rounded-full px-2 text-sm font-semibold',
                  p.isCurrent ? 'bg-brass-300 text-walnut-950' : 'text-vellum-50',
                )}
              >
                {p.name}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-vellum-300">
                {out ? (
                  <span className="italic">out of cards</span>
                ) : (
                  <>
                    <PlayingCard faceDown width={11} />
                    <span className="numeric font-semibold text-vellum-100" data-testid={`count-${p.id}`}>
                      {p.cardCount}
                    </span>
                  </>
                )}
                {isViewer && <span className="text-brass-300">· you</span>}
                {isPartner && <span className="text-vellum-300">· partner</span>}
              </p>
              {offline && <p className="text-[11px] font-semibold text-ember">offline</p>}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
