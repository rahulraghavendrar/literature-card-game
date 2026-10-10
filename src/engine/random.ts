/**
 * Randomness for shuffling and picking the starting player.
 *
 * An `Rng` returns uniformly distributed unsigned 32-bit integers.
 * `randomInt` uses rejection sampling so every outcome is equally likely
 * (no modulo bias), and `shuffle` is a Fisher–Yates shuffle on top of it.
 */
export type Rng = () => number;

/** Cryptographically strong RNG used for real games. */
export function cryptoRng(): Rng {
  const buffer = new Uint32Array(64);
  let index = buffer.length;
  return () => {
    if (index >= buffer.length) {
      globalThis.crypto.getRandomValues(buffer);
      index = 0;
    }
    return buffer[index++];
  };
}

/** Deterministic RNG (mulberry32) for tests and reproducible `?seed=` games. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const TWO_32 = 2 ** 32;

/** Uniform integer in [0, max). */
export function randomInt(rng: Rng, max: number): number {
  if (!Number.isInteger(max) || max <= 0) throw new Error(`randomInt: invalid max ${max}`);
  const limit = Math.floor(TWO_32 / max) * max;
  for (;;) {
    const r = rng() >>> 0;
    if (r < limit) return r % max;
  }
}

/** Fisher–Yates shuffle. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
