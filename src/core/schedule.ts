/**
 * Turns a song into timed note events.
 *
 * Time is measured in beats from the start of the loop. One bar is four
 * beats and every ring completes exactly one bar, whatever its step count:
 * a 3-step ring and a 4-step ring therefore play 3 against 4.
 */
import { ringPattern } from './euclid';
import { BEATS_PER_BAR, MAX_SWING, type Song, type VoiceId } from './song';

export interface NoteEvent {
  /** Nominal position in beats, before swing. Used to decide which slice owns the event. */
  beat: number;
  /** Position in beats after swing; this is when the note actually sounds. */
  time: number;
  ringIndex: number;
  ringId: string;
  voice: VoiceId;
  /** 0 to 1. */
  gain: number;
  /** Step index within the ring. */
  step: number;
}

export function barSeconds(bpm: number): number {
  return (BEATS_PER_BAR * 60) / bpm;
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}

/**
 * How far a step is delayed by swing, in beats. Odd-numbered steps (1, 3, 5, ...)
 * are pushed late by `swing / 100 * 0.5` of a step: 0 is straight, 100 delays a
 * step by half its length, and about 66 lands on a triplet feel.
 */
export function swingOffsetBeats(swing: number, steps: number, stepIndex: number): number {
  if (swing <= 0 || stepIndex % 2 === 0) return 0;
  const stepLength = BEATS_PER_BAR / steps;
  return (Math.min(swing, MAX_SWING) / 100) * 0.5 * stepLength;
}

/**
 * Events whose nominal beat lies in `[fromBeat, toBeat)`. Muted rings and rests
 * produce nothing. Results are ordered by sounding time, then ring.
 */
export function eventsInRange(song: Song, fromBeat: number, toBeat: number): NoteEvent[] {
  if (!Number.isFinite(fromBeat) || !Number.isFinite(toBeat) || fromBeat < 0) {
    throw new RangeError('beat range must be finite and start at or after 0');
  }
  if (toBeat <= fromBeat) return [];
  const firstBar = Math.floor(fromBeat / BEATS_PER_BAR);
  const lastBar = Math.floor(toBeat / BEATS_PER_BAR);
  const out: NoteEvent[] = [];
  song.rings.forEach((ring, ringIndex) => {
    if (ring.muted || ring.pulses === 0 || ring.volume === 0) return;
    const pattern = ringPattern(ring.pulses, ring.steps, ring.rotation);
    for (let bar = firstBar; bar <= lastBar; bar++) {
      for (let step = 0; step < ring.steps; step++) {
        if (!pattern[step]) continue;
        // One integer division keeps boundaries exact whenever the true value is dyadic.
        const beat = (bar * BEATS_PER_BAR * ring.steps + BEATS_PER_BAR * step) / ring.steps;
        if (beat < fromBeat || beat >= toBeat) continue;
        out.push({
          beat,
          time: beat + swingOffsetBeats(song.swing, ring.steps, step),
          ringIndex,
          ringId: ring.id,
          voice: ring.voice,
          gain: ring.volume / 100,
          step,
        });
      }
    }
  });
  return out.sort((a, b) => a.time - b.time || a.ringIndex - b.ringIndex);
}
