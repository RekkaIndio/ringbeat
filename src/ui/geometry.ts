/** Pure layout maths for the ring diagram, kept apart from React so it can be tested. */
import { swingOffsetBeats } from '../core/schedule';
import { BEATS_PER_BAR } from '../core/song';

export const VIEW = 100;
export const CENTER = VIEW / 2;
export const OUTER_RADIUS = 46;
export const INNER_RADIUS = 19;
export const MAX_SPACING = 9.5;

/** Radius of each ring, first ring outermost. */
export function ringRadii(count: number): number[] {
  if (count <= 0) return [];
  const spacing = count === 1 ? 0 : Math.min(MAX_SPACING, (OUTER_RADIUS - INNER_RADIUS) / (count - 1));
  return Array.from({ length: count }, (_, i) => OUTER_RADIUS - i * spacing);
}

/** Gap between neighbouring rings. */
export function ringSpacing(count: number): number {
  const r = ringRadii(count);
  return r.length > 1 ? r[0]! - r[1]! : MAX_SPACING;
}

/** Angle in radians for a position around the dial; phase 0 is straight up, increasing clockwise. */
export function phaseToAngle(phase: number): number {
  return -Math.PI / 2 + phase * Math.PI * 2;
}

export function pointOnRing(radius: number, phase: number): { x: number; y: number } {
  const a = phaseToAngle(phase);
  return { x: CENTER + radius * Math.cos(a), y: CENTER + radius * Math.sin(a) };
}

/** Where in the bar (0 to 1) a step sounds, including swing. */
export function stepPhase(steps: number, step: number, swing: number): number {
  return (step / steps) + swingOffsetBeats(swing, steps, step) / BEATS_PER_BAR;
}

/** Playhead phase (0 to 1) for a position in beats. */
export function beatsToPhase(beats: number): number {
  const p = (beats % BEATS_PER_BAR) / BEATS_PER_BAR;
  return p < 0 ? p + 1 : p;
}

/**
 * 1 at the instant the playhead reaches a step, falling to 0 over `window`
 * of a bar. Used for the little pop each hit makes on the dial.
 */
export function hitPulse(playheadPhase: number, targetPhase: number, window = 0.1): number {
  const since = ((playheadPhase - targetPhase) % 1 + 1) % 1;
  return since < window ? 1 - since / window : 0;
}

/** Radius of a pulse disc, limited by the ring spacing and by how tightly its steps are packed. */
export function pulseRadius(radius: number, steps: number, spacing: number): number {
  const arc = (2 * Math.PI * radius) / steps;
  return Math.max(0.9, Math.min(spacing * 0.34, arc * 0.34, 3));
}
