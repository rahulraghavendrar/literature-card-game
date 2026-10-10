import { cx, initials } from '../lib/ui';

export function Avatar({
  name,
  color,
  size = 44,
  ring = false,
  dim = false,
  className,
}: {
  name: string;
  color: string;
  size?: number;
  ring?: boolean;
  dim?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white select-none',
        dim && 'opacity-45 grayscale-[40%]',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${color} 70%, white), ${color} 60%, color-mix(in oklab, ${color} 70%, black))`,
        boxShadow: ring
          ? `0 0 0 2px var(--color-walnut-900), 0 0 0 4px var(--color-brass-300), 0 0 22px 4px rgb(227 199 125 / 0.45)`
          : `0 0 0 2px rgb(0 0 0 / 0.35), inset 0 1px 0 rgb(255 255 255 / 0.25)`,
        textShadow: '0 1px 1px rgb(0 0 0 / 0.35)',
      }}
    >
      {initials(name)}
    </span>
  );
}
