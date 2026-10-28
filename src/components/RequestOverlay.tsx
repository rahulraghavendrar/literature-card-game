import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { GameEvent } from '../types/game';
import { SET_BY_ID, cardName, cardPhrase, type PublicPlayer, type PublicTeam } from '../engine';
import { Avatar } from './Avatar';
import { CardBackSvg, CardFaceSvg } from './PlayingCard';
import { playerById, teamOf } from '../lib/ui';

export interface OverlayTiming {
  /** ms before the outcome is revealed */
  reveal: number;
  /** ms after the outcome before the overlay closes by itself */
  autoDismiss: number;
}

export const DEFAULT_TIMING: OverlayTiming = { reveal: 1350, autoDismiss: 4200 };
export const REDUCED_TIMING: OverlayTiming = { reveal: 200, autoDismiss: 3500 };

interface Props {
  event: GameEvent;
  players: PublicPlayer[];
  teams: PublicTeam[];
  onDismiss: () => void;
  paused?: boolean;
  timing?: OverlayTiming;
}

/** A card that starts face down and flips over when `revealed`. */
function FlipCard({
  cardId,
  revealed,
  width,
  dimmed = false,
  delay = 0,
}: {
  cardId: string;
  revealed: boolean;
  width: number;
  dimmed?: boolean;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <div style={{ width, height: width * 1.4, perspective: 900 }}>
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={{ rotateY: 180 }}
        animate={{ rotateY: revealed ? 0 : 180 }}
        transition={reduce ? { duration: 0 } : { duration: 0.6, delay, ease: [0.3, 0.7, 0.3, 1] }}
      >
        <svg
          viewBox="0 0 100 140"
          className="absolute inset-0 h-full w-full"
          style={{
            backfaceVisibility: 'hidden',
            filter: dimmed ? 'grayscale(0.7) brightness(0.8)' : 'drop-shadow(0 10px 18px rgb(0 0 0 / 0.5))',
            transition: 'filter 300ms ease',
          }}
          role="img"
          aria-label={cardName(cardId)}
          data-card-face={cardId}
        >
          <CardFaceSvg cardId={cardId} />
        </svg>
        <svg
          viewBox="0 0 100 140"
          className="absolute inset-0 h-full w-full"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', filter: 'drop-shadow(0 10px 18px rgb(0 0 0 / 0.5))' }}
          aria-hidden
        >
          <CardBackSvg />
        </svg>
      </motion.div>
    </div>
  );
}

function Person({ player, teams, caption }: { player: PublicPlayer | undefined; teams: PublicTeam[]; caption: string }) {
  const team = teamOf(teams, player?.teamId);
  return (
    <div className="flex w-24 shrink-0 flex-col items-center text-center sm:w-32">
      <Avatar name={player?.name ?? '?'} color={team?.color ?? '#777'} size={56} />
      <p className="mt-2 max-w-full truncate font-display text-lg font-semibold text-vellum-50">{player?.name}</p>
      <p className="text-xs text-vellum-400">
        {caption} · <span style={{ color: team?.color }}>{team?.name}</span>
      </p>
    </div>
  );
}

function actorOf(event: GameEvent): string {
  return event.kind === 'request' ? event.requesterId : event.kind === 'call' ? event.callerId : event.playerId;
}

function turnLine(event: GameEvent, players: PublicPlayer[]): string {
  const actorId = actorOf(event);
  const actor = playerById(players, actorId)?.name;
  const next = playerById(players, event.nextPlayerId)?.name;
  const good = event.kind === 'request' ? event.success : event.kind === 'call' ? event.correct : false;
  if (event.gameOver) return 'That was the last set. The game is over.';
  if (event.kind === 'call' && event.handedOver) return `${actor} hands the turn to ${next}.`;
  if (!event.turnPassed) return event.kind === 'request' ? `${actor} asks again.` : `${actor} keeps the turn.`;
  if (good) return `${actor} is out of cards, so the turn passes to ${next}.`;
  return `The turn passes to ${next}.`;
}

export function RequestOverlay({ event, players, teams, onDismiss, paused = false, timing }: Props) {
  const reduce = useReducedMotion();
  const t = timing ?? (reduce ? REDUCED_TIMING : DEFAULT_TIMING);
  const [revealed, setRevealed] = useState(t.reveal <= 0);
  const continueRef = useRef<HTMLButtonElement>(null);

  // Reveal the outcome after a short beat.
  useEffect(() => {
    setRevealed(t.reveal <= 0);
    if (t.reveal <= 0) return;
    const id = window.setTimeout(() => setRevealed(true), t.reveal);
    return () => window.clearTimeout(id);
  }, [event.id, t.reveal]);

  // Close by itself a little later (never at game over: the players should see it).
  const autoClose = revealed && !paused && !event.gameOver && t.autoDismiss > 0;
  useEffect(() => {
    if (!autoClose) return;
    const id = window.setTimeout(onDismiss, t.autoDismiss);
    return () => window.clearTimeout(id);
  }, [autoClose, onDismiss, t.autoDismiss, event.id]);

  useEffect(() => {
    if (revealed) continueRef.current?.focus();
  }, [revealed]);

  let headline: ReactNode;
  let subline: ReactNode = null;
  let stage: ReactNode;
  let outcome: ReactNode = null;
  let result: string;
  let actorId: string;

  if (event.kind === 'request') {
    const requester = playerById(players, event.requesterId);
    const target = playerById(players, event.targetId);
    const name = cardName(event.cardId);
    const phrase = cardPhrase(event.cardId);
    actorId = event.requesterId;
    result = event.success ? 'success' : 'failure';
    headline = (
      <>
        {requester?.name} asked {target?.name} for {phrase}.
      </>
    );
    stage = (
      <div className="relative flex items-center justify-between">
        <Person player={requester} teams={teams} caption="asking" />
        <div className="relative h-[190px] flex-1">
          <div className="absolute inset-x-[12%] top-1/2 border-t border-dashed border-brass-300/25" aria-hidden />
          <motion.div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            initial={{ left: '80%', scale: 0.6, opacity: 0 }}
            animate={{
              left: revealed && event.success ? '20%' : '80%',
              scale: 1,
              opacity: 1,
              x: revealed && !event.success && !reduce ? [0, -12, 12, -8, 6, 0] : 0,
            }}
            transition={
              reduce
                ? { duration: 0 }
                : revealed
                  ? { left: { duration: 0.8, ease: [0.45, 0, 0.2, 1] }, x: { duration: 0.45 } }
                  : { duration: 0.35 }
            }
          >
            <FlipCard cardId={event.cardId} revealed width={110} delay={0.35} dimmed={revealed && !event.success} />
            <AnimatePresence>
              {revealed && !event.success && (
                <motion.span
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border-[3px] border-suit-red bg-vellum-50/90 px-3 py-1 font-display text-xl font-bold italic text-suit-red shadow-lg"
                  initial={{ opacity: 0, scale: 1.8, rotate: -14 }}
                  animate={{ opacity: 1, scale: 1, rotate: -14 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22, delay: reduce ? 0 : 0.2 }}
                >
                  Not here
                </motion.span>
              )}
              {revealed && event.success && !reduce && (
                <motion.span
                  className="pointer-events-none absolute -inset-3 rounded-2xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.9, 0] }}
                  transition={{ duration: 1.1, delay: 0.55 }}
                  style={{ boxShadow: '0 0 40px 10px rgb(227 199 125 / 0.65)' }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </div>
        <Person player={target} teams={teams} caption="asked" />
      </div>
    );
    if (revealed) {
      outcome = event.success ? (
        <p className="font-display text-2xl text-brass-200">
          {target?.name} hands over {phrase}.
        </p>
      ) : (
        <p className="font-display text-2xl text-[#f3a58b]">
          {target?.name} doesn’t have {name === 'Joker' ? 'a Joker' : `the ${name}`}.
        </p>
      );
    }
  } else if (event.kind === 'timeout') {
    const player = playerById(players, event.playerId);
    actorId = event.playerId;
    result = 'timeout';
    headline = <>{player?.name} ran out of time.</>;
    stage = (
      <div className="flex justify-center">
        <Person player={player} teams={teams} caption="out of time" />
      </div>
    );
    if (revealed) outcome = <p className="font-display text-2xl text-[#f3a58b]">Time’s up.</p>;
  } else {
    const caller = playerById(players, event.callerId);
    const partner = playerById(players, event.partnerId);
    const team = teamOf(teams, caller?.teamId);
    const set = SET_BY_ID[event.setId];
    actorId = event.callerId;
    result = event.correct ? 'correct' : 'wrong';
    headline = (
      <>
        {caller?.name} calls {set.short}.
      </>
    );
    subline = (
      <p className="mt-1 text-vellum-300">
        {caller?.name} says {partner?.name} holds every card of it {caller?.name} doesn’t.
      </p>
    );
    const holderName = (c: string) => playerById(players, event.called?.heldBy[c])?.name ?? '';
    stage = (
      <div className="flex items-center justify-between gap-2">
        <Person player={caller} teams={teams} caption="calling" />
        <div className="flex min-w-0 flex-1 justify-center pb-6 pt-2">
          {set.cards.map((c, i) => (
            <motion.div
              key={c}
              className="relative"
              style={{ marginLeft: i === 0 ? 0 : -28 }}
              initial={{ y: 20, opacity: 0, rotate: 0 }}
              animate={{ y: 0, opacity: 1, rotate: (i - 2.5) * 5 }}
              transition={{ delay: reduce ? 0 : i * 0.06 }}
            >
              <FlipCard cardId={c} revealed={revealed} width={66} delay={reduce ? 0 : i * 0.05} dimmed={revealed && !event.correct} />
              {revealed && event.correct && (
                <span className="absolute inset-x-0 -bottom-5 truncate text-center text-[11px] text-vellum-300">{holderName(c)}</span>
              )}
            </motion.div>
          ))}
        </div>
        <Person player={partner} teams={teams} caption="partner" />
      </div>
    );
    if (revealed) {
      outcome = event.correct ? (
        <p className="font-display text-2xl text-brass-200">
          Correct. <span style={{ color: team?.color }}>{team?.name}</span> scores a point.
        </p>
      ) : (
        <p className="font-display text-2xl text-[#f3a58b]">Wrong. The cards stay where they are.</p>
      );
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-walnut-950/80 p-4 backdrop-blur-[3px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.25 }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="overlay-headline"
      data-testid="request-overlay"
      data-kind={event.kind}
      data-result={revealed ? result : 'pending'}
      data-actor={actorId}
      data-target={event.kind === 'request' ? event.targetId : undefined}
      data-card={event.kind === 'request' ? event.cardId : undefined}
      data-set={event.kind === 'call' ? event.setId : undefined}
      onClick={(e) => {
        if (revealed && e.target === e.currentTarget) onDismiss();
      }}
    >
      <motion.div
        className="folio relative w-full max-w-3xl px-4 py-7 text-center sm:px-10"
        initial={{ y: 24, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <h2
          id="overlay-headline"
          className="font-display text-[clamp(1.4rem,3.4vw,2.4rem)] font-semibold leading-tight text-vellum-50"
          data-testid="overlay-headline"
        >
          {headline}
        </h2>
        {subline}

        <div className="mt-6">{stage}</div>

        <div className="mt-5 min-h-[4.5rem] space-y-1" aria-live="assertive" data-testid="overlay-outcome">
          {outcome}
          {revealed && <p className="text-vellum-300">{turnLine(event, players)}</p>}
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            ref={continueRef}
            type="button"
            className="btn-brass min-w-48"
            disabled={!revealed}
            onClick={onDismiss}
            data-testid="overlay-continue"
          >
            {event.gameOver ? 'See the results' : 'Continue'}
          </button>
          <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10" aria-hidden>
            {autoClose && (
              <motion.div
                key={`${event.id}-${paused}`}
                className="h-full bg-brass-400/70"
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: t.autoDismiss / 1000, ease: 'linear' }}
              />
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
