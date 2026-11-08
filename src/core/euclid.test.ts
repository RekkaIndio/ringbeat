import { describe, expect, it } from 'vitest';
import { euclid, gaps, MAX_STEPS, patternToString, rotate, ringPattern } from './euclid';

const s = (k: number, n: number) => patternToString(euclid(k, n));

/** True if `b` is some rotation of `a`. */
function sameNecklace(a: string, b: string): boolean {
  return a.length === b.length && (a + a).includes(b);
}

describe('euclid: named rhythms', () => {
  it('produces the tresillo, E(3,8)', () => expect(s(3, 8)).toBe('x..x..x.'));
  it('produces the cinquillo, E(5,8)', () => expect(s(5, 8)).toBe('x.xx.xx.'));
  it('produces the 7-in-12 bell pattern', () => expect(s(7, 12)).toBe('x.xx.x.xx.x.'));
  it('produces E(2,5)', () => expect(s(2, 5)).toBe('x.x..'));

  // From the Toussaint table; equal up to rotation, which is how the paper compares them.
  const table: Array<[number, number, string]> = [
    [3, 4, 'x.xx'],
    [3, 5, 'x.x.x'],
    [3, 7, 'x.x.x..'],
    [4, 7, 'x.x.x.x'],
    [4, 9, 'x.x.x.x..'],
    [4, 11, 'x..x..x..x.'],
    [5, 6, 'x.xxxx'],
    [5, 7, 'x.xx.xx'],
    [5, 9, 'x.x.x.x.x'],
    [5, 11, 'x.x.x.x.x..'],
    [5, 12, 'x..x.x..x.x.'],
    [5, 16, 'x..x..x..x..x...'],
    [7, 8, 'x.xxxxxx'],
    [7, 16, 'x..x.x.x..x.x.x.'],
    [9, 16, 'x.xx.x.x.xx.x.x.'],
    [11, 24, 'x..x.x.x.x.x..x.x.x.x.x.'],
    [13, 24, 'x.xx.x.x.x.x.xx.x.x.x.x.'],
  ];
  for (const [k, n, expected] of table) {
    it(`matches the published E(${k},${n}) up to rotation`, () => {
      // Guard the table itself: a mistyped row would otherwise make the test meaningless.
      expect(expected).toHaveLength(n);
      expect(expected.split('x')).toHaveLength(k + 1);
      expect(sameNecklace(expected, s(k, n))).toBe(true);
    });
  }
});

describe('euclid: properties across every (k, n)', () => {
  it('has exactly k pulses, starts on a pulse, and spaces them maximally evenly', () => {
    for (let n = 1; n <= MAX_STEPS; n++) {
      for (let k = 0; k <= n; k++) {
        const p = euclid(k, n);
        expect(p).toHaveLength(n);
        expect(p.filter(Boolean)).toHaveLength(k);
        if (k > 0) expect(p[0]).toBe(true);
        const g = gaps(p);
        if (g.length > 0) {
          // Cyclic gaps sum to n and differ by at most one: the definition of "even".
          expect(g.reduce((a, b) => a + b, 0)).toBe(n);
          expect(Math.max(...g) - Math.min(...g)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('handles the edges', () => {
    expect(s(0, 4)).toBe('....');
    expect(s(4, 4)).toBe('xxxx');
    expect(s(1, 1)).toBe('x');
    expect(s(0, 1)).toBe('.');
  });

  it('rejects invalid input instead of guessing', () => {
    expect(() => euclid(-1, 8)).toThrow(RangeError);
    expect(() => euclid(9, 8)).toThrow(RangeError);
    expect(() => euclid(3, 0)).toThrow(RangeError);
    expect(() => euclid(3, MAX_STEPS + 1)).toThrow(RangeError);
    expect(() => euclid(2.5, 8)).toThrow(RangeError);
    expect(() => euclid(Number.NaN, 8)).toThrow(RangeError);
  });
});

describe('rotate', () => {
  it('moves each element right by the given amount', () => {
    expect(rotate([1, 2, 3, 4], 1)).toEqual([4, 1, 2, 3]);
    expect(rotate([1, 2, 3, 4], 3)).toEqual([2, 3, 4, 1]);
  });
  it('wraps around and accepts negative amounts', () => {
    expect(rotate([1, 2, 3, 4], 4)).toEqual([1, 2, 3, 4]);
    expect(rotate([1, 2, 3, 4], 5)).toEqual([4, 1, 2, 3]);
    expect(rotate([1, 2, 3, 4], -1)).toEqual([2, 3, 4, 1]);
  });
  it('does not mutate its input and tolerates an empty pattern', () => {
    const a = [true, false, false];
    rotate(a, 1);
    expect(a).toEqual([true, false, false]);
    expect(rotate([], 3)).toEqual([]);
  });
  it('ringPattern combines euclid and rotate', () => {
    expect(patternToString(ringPattern(3, 8, 1))).toBe('.x..x..x');
    expect(patternToString(ringPattern(3, 8, 0))).toBe('x..x..x.');
  });
});
