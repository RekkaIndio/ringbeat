/**
 * Euclidean rhythm generation (Bjorklund's algorithm).
 *
 * `euclid(k, n)` spreads `k` pulses as evenly as possible over `n` steps.
 * See G. Toussaint, "The Euclidean Algorithm Generates Traditional Musical
 * Rhythms" (2005), for why the result matches many traditional timelines.
 */

export const MIN_STEPS = 1;
export const MAX_STEPS = 32;

function assertInt(name: string, value: number): void {
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer, got ${value}`);
}

/** Spread `pulses` hits over `steps` slots. The first slot is always a pulse when `pulses > 0`. */
export function euclid(pulses: number, steps: number): boolean[] {
  assertInt('pulses', pulses);
  assertInt('steps', steps);
  if (steps < MIN_STEPS || steps > MAX_STEPS) {
    throw new RangeError(`steps must be between ${MIN_STEPS} and ${MAX_STEPS}, got ${steps}`);
  }
  if (pulses < 0 || pulses > steps) {
    throw new RangeError(`pulses must be between 0 and steps (${steps}), got ${pulses}`);
  }
  if (pulses === 0) return new Array<boolean>(steps).fill(false);

  // Bjorklund: repeatedly pair up the two groups until at most one remainder is left.
  let head: number[][] = Array.from({ length: pulses }, () => [1]);
  let tail: number[][] = Array.from({ length: steps - pulses }, () => [0]);
  while (tail.length > 1) {
    const pairs = Math.min(head.length, tail.length);
    const merged: number[][] = [];
    for (let i = 0; i < pairs; i++) merged.push([...head[i]!, ...tail[i]!]);
    const rest = head.length > tail.length ? head.slice(pairs) : tail.slice(pairs);
    head = merged;
    tail = rest;
  }
  return [...head, ...tail].flat().map((v) => v === 1);
}

/**
 * Rotate a pattern to the right: the pulse at index `i` moves to `(i + by) mod n`.
 * Negative and oversized amounts wrap around.
 */
export function rotate<T>(pattern: readonly T[], by: number): T[] {
  assertInt('by', by);
  const n = pattern.length;
  if (n === 0) return [];
  const shift = ((by % n) + n) % n;
  return pattern.map((_, i) => pattern[(i - shift + n) % n]!);
}

/** A ring's finished pattern: `euclid(pulses, steps)` rotated right by `rotation`. */
export function ringPattern(pulses: number, steps: number, rotation: number): boolean[] {
  return rotate(euclid(pulses, steps), rotation);
}

/** Render a pattern the way rhythm papers do: `x` for a pulse, `.` for a rest. */
export function patternToString(pattern: readonly boolean[]): string {
  return pattern.map((p) => (p ? 'x' : '.')).join('');
}

/** Cyclic distances between consecutive pulses. Empty when there are no pulses. */
export function gaps(pattern: readonly boolean[]): number[] {
  const idx = pattern.flatMap((p, i) => (p ? [i] : []));
  if (idx.length === 0) return [];
  return idx.map((start, i) => {
    const next = i + 1 < idx.length ? idx[i + 1]! : idx[0]! + pattern.length;
    return next - start;
  });
}
