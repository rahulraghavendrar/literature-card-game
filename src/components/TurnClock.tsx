import { useEffect, useState } from 'react';
import { cx } from '../lib/ui';

/** Seconds left for the current move, counting down from `deadline` (server time). */
export function TurnClock({ deadline, offset = 0, total }: { deadline: number | null; offset?: number; total: number }) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => setNow(Date.now() + offset), 250);
    setNow(Date.now() + offset);
    return () => window.clearInterval(id);
  }, [deadline, offset]);
  if (deadline === null || total <= 0) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const low = left <= 10;
  const fraction = Math.min(1, Math.max(0, (deadline - now) / (total * 1000)));
  return (
    <div className="mt-2 flex flex-col items-center gap-1" data-testid="turn-clock" aria-label={`${left} seconds left`}>
      <span className={cx('numeric font-display text-xl font-semibold', low ? 'text-ember' : 'text-vellum-100')}>
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </span>
      <span className="h-1 w-24 overflow-hidden rounded-full bg-black/30" aria-hidden>
        <span className={cx('block h-full', low ? 'bg-ember' : 'bg-brass-300')} style={{ width: `${fraction * 100}%` }} />
      </span>
    </div>
  );
}
