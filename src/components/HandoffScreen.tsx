import { motion } from 'framer-motion';
import type { PublicPlayer, PublicTeam } from '../engine';
import { Avatar } from './Avatar';
import { PlayingCard } from './PlayingCard';
import { plural, teamOf } from '../lib/ui';

/** Shown between turns when pass-the-device is on. No hand is rendered here. */
export function HandoffScreen({
  player,
  teams,
  onReady,
  note,
}: {
  player: PublicPlayer;
  teams: PublicTeam[];
  onReady: () => void;
  note?: string;
}) {
  const team = teamOf(teams, player.teamId);
  return (
    <motion.section
      key={player.id}
      className="flex h-full flex-col items-center justify-center px-6 py-10 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      data-testid="handoff-screen"
      aria-labelledby="handoff-title"
    >
      <div className="relative mb-8 h-36 w-48" aria-hidden>
        {[-1, 0, 1].map((k) => (
          <div
            key={k}
            className="absolute left-1/2 top-0 origin-bottom"
            style={{ transform: `translateX(-50%) rotate(${k * 12}deg)` }}
          >
            <PlayingCard faceDown width={88} />
          </div>
        ))}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
          <Avatar name={player.name} color={team?.color ?? '#777'} size={72} ring />
        </div>
      </div>
      <h2 id="handoff-title" className="font-display text-4xl font-semibold text-vellum-50 sm:text-5xl">
        Pass the device to {player.name}
      </h2>
      <p className="mt-3 text-vellum-300">
        <span className="font-semibold" style={{ color: team?.color }}>
          {team?.name}
        </span>{' '}
        · {plural(player.cardCount, 'card')}
      </p>
      {note && (
        <p className="mt-4 rounded-full bg-brass-300/10 px-4 py-1.5 text-sm font-semibold text-brass-200" data-testid="handoff-note">
          {note}
        </p>
      )}
      <p className="mt-6 max-w-sm text-vellum-300">
        Everyone else, look away. {player.name}, show your cards when you’re holding the device.
      </p>
      <button type="button" className="btn-brass mt-8 px-8 py-3.5 text-lg" onClick={onReady} data-testid="handoff-ready" autoFocus>
        I’m {player.name}, show my cards
      </button>
    </motion.section>
  );
}
