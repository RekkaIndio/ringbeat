import { describe, expect, it } from 'vitest';
import {
  beatsToPhase, CENTER, hitPulse, INNER_RADIUS, OUTER_RADIUS, phaseToAngle, pointOnRing,
  pulseRadius, ringRadii, stepPhase,
} from './geometry';

describe('ring geometry', () => {
  it('puts the first ring outermost and keeps every ring clear of the hub', () => {
    for (let n = 1; n <= 6; n++) {
      const r = ringRadii(n);
      expect(r).toHaveLength(n);
      expect(r[0]).toBe(OUTER_RADIUS);
      expect(Math.min(...r)).toBeGreaterThanOrEqual(INNER_RADIUS);
      for (let i = 1; i < n; i++) expect(r[i]!).toBeLessThan(r[i - 1]!);
    }
    expect(ringRadii(0)).toEqual([]);
  });

  it('starts at the top and runs clockwise', () => {
    const top = pointOnRing(10, 0);
    expect(top.x).toBeCloseTo(CENTER);
    expect(top.y).toBeCloseTo(CENTER - 10);
    const right = pointOnRing(10, 0.25);
    expect(right.x).toBeCloseTo(CENTER + 10);
    expect(right.y).toBeCloseTo(CENTER);
    expect(phaseToAngle(0)).toBeCloseTo(-Math.PI / 2);
  });

  it('maps beats to a repeating phase', () => {
    expect(beatsToPhase(0)).toBe(0);
    expect(beatsToPhase(1)).toBe(0.25);
    expect(beatsToPhase(4)).toBe(0);
    expect(beatsToPhase(5)).toBe(0.25);
    expect(beatsToPhase(-1)).toBe(0.75);
  });

  it('places steps evenly, with swing nudging odd steps later', () => {
    expect(stepPhase(8, 2, 0)).toBe(0.25);
    expect(stepPhase(8, 1, 0)).toBe(0.125);
    expect(stepPhase(8, 1, 66)).toBeGreaterThan(0.125);
    expect(stepPhase(8, 2, 66)).toBe(0.25);
  });

  it('pulses at the instant of a hit and fades out', () => {
    expect(hitPulse(0.25, 0.25)).toBe(1);
    expect(hitPulse(0.30, 0.25)).toBeCloseTo(0.5);
    expect(hitPulse(0.40, 0.25)).toBe(0);
    expect(hitPulse(0.2, 0.25)).toBe(0); // before the hit: nothing
    expect(hitPulse(0.02, 0.98)).toBeCloseTo(0.6); // across the wrap at the top of the dial
  });

  it('keeps pulse discs from overlapping their neighbours on crowded rings', () => {
    for (let n = 1; n <= 6; n++) {
      for (const steps of [1, 8, 16, 32]) {
        for (const radius of ringRadii(n)) {
          const rad = pulseRadius(radius, steps, n === 1 ? 9.5 : ringRadii(n)[0]! - ringRadii(n)[1]!);
          expect(rad).toBeGreaterThanOrEqual(0.9);
          expect(rad).toBeLessThanOrEqual(3);
          if (steps > 1 && rad > 0.9) expect(2 * rad).toBeLessThan((2 * Math.PI * radius) / steps);
        }
      }
    }
  });
});
