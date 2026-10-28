import { useId, type ReactNode } from 'react';
import type { CardId, Rank, Suit } from '../types/game';
import { CARD_BY_ID, cardName, isJoker } from '../engine';

/* Suit glyphs drawn as paths in a 100×100 box (font glyphs can turn into emoji). */
const SUIT_PATHS: Record<Suit, ReactNode> = {
  H: <path d="M50 90 C 22 66, 3 48, 12 27 C 21 9, 44 10, 50 29 C 56 10, 79 9, 88 27 C 97 48, 78 66, 50 90 Z" />,
  D: <path d="M50 4 L 85 50 L 50 96 L 15 50 Z" />,
  S: (
    <path d="M50 6 C 61 28, 93 40, 89 63 C 86 80, 66 84, 55 72 C 56 82, 60 89, 68 95 L 32 95 C 40 89, 44 82, 45 72 C 34 84, 14 80, 11 63 C 7 40, 39 28, 50 6 Z" />
  ),
  C: (
    <g>
      <circle cx="50" cy="27" r="18" />
      <circle cx="28" cy="57" r="18" />
      <circle cx="72" cy="57" r="18" />
      <circle cx="50" cy="52" r="11" />
      <path d="M45 56 L 38 95 L 62 95 L 55 56 Z" />
    </g>
  ),
};

function SuitGlyph({ suit, cx, cy, size, flip = false }: { suit: Suit; cx: number; cy: number; size: number; flip?: boolean }) {
  const s = size / 100;
  return (
    <g transform={`translate(${cx} ${cy}) ${flip ? 'rotate(180)' : ''} scale(${s}) translate(-50 -50)`}>
      {SUIT_PATHS[suit]}
    </g>
  );
}

/* Classic pip layouts on a 100×140 card. */
const L = 32;
const C = 50;
const R = 68;
const PIPS: Partial<Record<Rank, [number, number][]>> = {
  '2': [[C, 30], [C, 110]],
  '3': [[C, 30], [C, 70], [C, 110]],
  '4': [[L, 30], [R, 30], [L, 110], [R, 110]],
  '5': [[L, 30], [R, 30], [C, 70], [L, 110], [R, 110]],
  '6': [[L, 30], [R, 30], [L, 70], [R, 70], [L, 110], [R, 110]],
  '7': [[L, 30], [R, 30], [C, 50], [L, 70], [R, 70], [L, 110], [R, 110]],
  '8': [[L, 30], [R, 30], [C, 50], [L, 70], [R, 70], [C, 90], [L, 110], [R, 110]],
  '9': [[L, 30], [R, 30], [L, 56.7], [R, 56.7], [C, 70], [L, 83.3], [R, 83.3], [L, 110], [R, 110]],
  '10': [[L, 30], [R, 30], [C, 43], [L, 56.7], [R, 56.7], [L, 83.3], [R, 83.3], [C, 97], [L, 110], [R, 110]],
};

const RED = '#b3261e';
const INK = '#1d1a16';

function CornerIndex({ rank, suit, color }: { rank: string; suit: Suit; color: string }) {
  const narrow = rank === '10';
  return (
    <g fill={color}>
      <text
        x="11"
        y="19"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight="600"
        fontSize={narrow ? 13.5 : 16}
        letterSpacing={narrow ? -1.2 : 0}
      >
        {rank}
      </text>
      <SuitGlyph suit={suit} cx={11} cy={28} size={11} />
    </g>
  );
}

function FaceArt({ rank, suit, color, tint }: { rank: Rank; suit: Suit; color: string; tint: string }) {
  return (
    <g>
      <rect x="21" y="22" width="58" height="96" rx="5" fill={tint} stroke={color} strokeWidth="1.3" />
      <rect x="24.5" y="25.5" width="51" height="89" rx="3" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="0.8" />
      <g fill={color}>
        <SuitGlyph suit={suit} cx={50} cy={40} size={15} />
        <SuitGlyph suit={suit} cx={50} cy={100} size={15} flip />
        <text
          x="50"
          y="83"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontStyle="italic"
          fontWeight="500"
          fontSize="42"
        >
          {rank}
        </text>
      </g>
    </g>
  );
}

function JokerArt() {
  const color = RED;
  return (
    <g>
      <g fill={color} fontFamily="var(--font-display)" fontWeight="700" fontSize="8.5" textAnchor="middle">
        {'JOKER'.split('').map((ch, i) => (
          <text key={i} x="10.5" y={15 + i * 8.6}>
            {ch}
          </text>
        ))}
        <g transform="rotate(180 50 70)">
          {'JOKER'.split('').map((ch, i) => (
            <text key={i} x="10.5" y={15 + i * 8.6}>
              {ch}
            </text>
          ))}
        </g>
      </g>
      <circle cx="50" cy="66" r="30" fill={color} fillOpacity="0.07" stroke={color} strokeOpacity="0.4" strokeWidth="0.8" />
      <g transform="translate(26 40) scale(0.48)">
        <path
          d="M20 72 Q 26 42 12 22 Q 36 30 42 54 Q 47 22 50 10 Q 53 22 58 54 Q 64 30 88 22 Q 74 42 80 72 Z"
          fill={color}
        />
        <rect x="16" y="68" width="68" height="12" rx="4" fill={color} />
        <g fill="#c9a24a" stroke="#7d6022" strokeWidth="1.5">
          <circle cx="12" cy="22" r="6" />
          <circle cx="50" cy="10" r="6" />
          <circle cx="88" cy="22" r="6" />
        </g>
        <path d="M30 98 Q 50 112 70 98" stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>
      <text
        x="50"
        y="116"
        textAnchor="middle"
        fill={color}
        fontFamily="var(--font-display)"
        fontStyle="italic"
        fontWeight="600"
        fontSize="11"
      >
        Joker
      </text>
    </g>
  );
}

export function CardFaceSvg({ cardId }: { cardId: CardId }) {
  // "JK" (a Joker, as asked for) looks like either joker: they're identical.
  const card = CARD_BY_ID[cardId === 'JK' ? 'JK1' : cardId];
  const gradId = useId();
  if (!card && !isJoker(cardId)) return null;
  const paper = (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#f3ecdd" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="99" height="139" rx="7" fill={`url(#${gradId})`} stroke="#c9b994" strokeWidth="1" />
    </>
  );
  if (!card || card.kind === 'joker') {
    return (
      <>
        {paper}
        <JokerArt />
      </>
    );
  }
  const red = card.suit === 'H' || card.suit === 'D';
  const color = red ? RED : INK;
  const pips = PIPS[card.rank];
  const isFace = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  return (
    <>
      {paper}
      <CornerIndex rank={card.rank} suit={card.suit} color={color} />
      <g transform="rotate(180 50 70)">
        <CornerIndex rank={card.rank} suit={card.suit} color={color} />
      </g>
      {isFace && <FaceArt rank={card.rank} suit={card.suit} color={color} tint={red ? '#f7e4dc' : '#e9e6de'} />}
      {card.rank === 'A' && (
        <g fill={color}>
          {card.suit === 'S' && <circle cx="50" cy="70" r="28" fill="none" stroke={color} strokeOpacity="0.3" strokeWidth="1" />}
          <SuitGlyph suit={card.suit} cx={50} cy={70} size={card.suit === 'S' ? 40 : 34} />
        </g>
      )}
      {pips && (
        <g fill={color}>
          {pips.map(([x, y], i) => (
            <SuitGlyph key={i} suit={card.suit} cx={x} cy={y} size={17} flip={y > 70} />
          ))}
        </g>
      )}
    </>
  );
}

export function CardBackSvg() {
  const pid = useId();
  return (
    <>
      <defs>
        <pattern id={pid} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 4 H8 M4 0 V8" stroke="#c9a24a" strokeOpacity="0.32" strokeWidth="0.8" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width="99" height="139" rx="7" fill="#5e1c19" stroke="#2a0d0b" strokeWidth="1" />
      <rect x="6" y="6" width="88" height="128" rx="4" fill={`url(#${pid})`} stroke="#c9a24a" strokeOpacity="0.7" strokeWidth="1" />
      <circle cx="50" cy="70" r="17" fill="#5e1c19" stroke="#c9a24a" strokeWidth="1.2" />
      <text
        x="50"
        y="77.5"
        textAnchor="middle"
        fill="#e3c77d"
        fontFamily="var(--font-display)"
        fontStyle="italic"
        fontWeight="600"
        fontSize="21"
      >
        L
      </text>
    </>
  );
}

export interface PlayingCardProps {
  cardId?: CardId;
  faceDown?: boolean;
  width?: number;
  className?: string;
  title?: string;
}

/** A single card, face up (with `data-card-face`) or face down. */
export function PlayingCard({ cardId, faceDown = false, width = 84, className, title }: PlayingCardProps) {
  const showFace = !faceDown && !!cardId;
  return (
    <svg
      viewBox="0 0 100 140"
      width={width}
      height={width * 1.4}
      className={className}
      role="img"
      aria-label={showFace ? cardName(cardId!) : 'Face-down card'}
      data-card-face={showFace ? cardId : undefined}
      style={{ display: 'block', filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 0.35))' }}
    >
      {title && <title>{title}</title>}
      {showFace ? <CardFaceSvg cardId={cardId!} /> : <CardBackSvg />}
    </svg>
  );
}
