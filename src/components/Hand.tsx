import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { CardId, SetId } from '../types/game';
import { cardName, setOf } from '../engine';
import { PlayingCard } from './PlayingCard';


/** The viewer's own cards, fanned along the bottom. Click a card to ask from its set. */
export function Hand({
  cards,
  selectedSet,
  onSelectSet,
  interactive,
}: {
  cards: CardId[];
  selectedSet: SetId | null;
  onSelectSet: (setId: SetId) => void;
  interactive: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const CARD_W = width < 520 ? 66 : 92;
  const n = cards.length;
  const boundaries = cards.filter((c, i) => i > 0 && setOf(c) !== setOf(cards[i - 1])).length;
  const setGap = width < 520 ? 6 : 10;
  const available = Math.max(width - CARD_W - boundaries * setGap - 48, 40);
  const step = n > 1 ? Math.min(CARD_W * 0.72, available / (n - 1)) : 0;
  const mid = (n - 1) / 2;

  let x = 0;
  const positions = cards.map((c, i) => {
    if (i > 0) x += step + (setOf(c) !== setOf(cards[i - 1]) ? setGap : 0);
    return x;
  });
  const total = n > 0 ? positions[n - 1] + CARD_W : 0;

  return (
    <div ref={ref} className="relative h-[168px] w-full" data-testid="hand" aria-label="Your hand">
      {n === 0 ? (
        <p className="pt-12 text-center text-vellum-400">You have no cards left.</p>
      ) : (
        <div className="absolute bottom-3 left-1/2 h-full -translate-x-1/2" style={{ width: total }}>
          {cards.map((c, i) => {
            const sid = setOf(c);
            const selected = selectedSet === sid;
            const tilt = (i - mid) * Math.min(2.2, 24 / n);
            const drop = Math.min(Math.abs(i - mid) ** 2 * Math.min(0.9, 9 / n), 18) - 18;
            return (
              <motion.button
                key={c}
                type="button"
                disabled={!interactive}
                onClick={() => onSelectSet(sid)}
                className="absolute bottom-0 origin-bottom rounded-[8px] disabled:cursor-default"
                style={{ left: positions[i], zIndex: i }}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: drop - (selected ? 16 : 0), rotate: tilt, opacity: 1 }}
                whileHover={interactive ? { y: drop - 22 } : undefined}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                aria-label={`${cardName(c)}${interactive ? ' — ask from this set' : ''}`}
                aria-pressed={interactive ? selected : undefined}
              >
                <PlayingCard
                  cardId={c}
                  width={CARD_W}
                  className={selected ? 'rounded-[8px] outline-2 outline-offset-1 outline-brass-300' : undefined}
                />
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
