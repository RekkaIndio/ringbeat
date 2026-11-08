import { describe, expect, it } from 'vitest';
import { barSeconds, beatsToSeconds, eventsInRange, swingOffsetBeats } from './schedule';
import { makeSong } from './song';

describe('eventsInRange', () => {
  it('places E(3,8) on steps 0, 3 and 6 of a four-beat bar', () => {
    const s = makeSong([{ pulses: 3, steps: 8 }]);
    expect(eventsInRange(s, 0, 4).map((e) => e.beat)).toEqual([0, 1.5, 3]);
  });

  it('repeats every bar', () => {
    const s = makeSong([{ pulses: 3, steps: 8 }]);
    expect(eventsInRange(s, 4, 8).map((e) => e.beat)).toEqual([4, 5.5, 7]);
  });

  it('plays three against four: every ring finishes one bar in the same time', () => {
    const s = makeSong([
      { pulses: 3, steps: 3, voice: 'kick' },
      { pulses: 4, steps: 4, voice: 'clave' },
    ]);
    const ev = eventsInRange(s, 0, 4);
    expect(ev.filter((e) => e.ringIndex === 0).map((e) => e.beat)).toEqual([0, 4 / 3, 8 / 3]);
    expect(ev.filter((e) => e.ringIndex === 1).map((e) => e.beat)).toEqual([0, 1, 2, 3]);
  });

  it('rings only line up on the downbeat when their step counts share no factor', () => {
    const s = makeSong([{ pulses: 5, steps: 5 }, { pulses: 7, steps: 7 }]);
    const beats = eventsInRange(s, 0, 4).map((e) => e.beat);
    const coincide = beats.filter((b, i) => beats.indexOf(b) !== i);
    expect(coincide).toEqual([0]);
  });

  it('applies rotation', () => {
    const s = makeSong([{ pulses: 1, steps: 4, rotation: 2 }]);
    expect(eventsInRange(s, 0, 4).map((e) => e.beat)).toEqual([2]);
  });

  it('skips muted rings, silent rings and rests', () => {
    const s = makeSong([
      { pulses: 4, steps: 4, muted: true },
      { pulses: 0, steps: 4 },
      { pulses: 4, steps: 4, volume: 0 },
      { pulses: 1, steps: 4 },
    ]);
    const ev = eventsInRange(s, 0, 4);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.ringIndex).toBe(3);
  });

  it('is half-open, so adjacent slices neither drop nor repeat events', () => {
    const s = makeSong([
      { pulses: 5, steps: 12, rotation: 1 },
      { pulses: 7, steps: 11 },
      { pulses: 3, steps: 32 },
    ]);
    const whole = eventsInRange(s, 0, 16).map((e) => `${e.ringIndex}:${e.beat}`);
    const sliced: string[] = [];
    for (let b = 0; b < 16; b += 0.25) {
      for (const e of eventsInRange(s, b, b + 0.25)) sliced.push(`${e.ringIndex}:${e.beat}`);
    }
    expect(sliced.sort()).toEqual(whole.sort());
    expect(new Set(sliced).size).toBe(sliced.length);
  });

  it('carries gain from volume and the voice from the ring', () => {
    const s = makeSong([{ pulses: 1, steps: 4, volume: 40, voice: 'snare' }]);
    const [e] = eventsInRange(s, 0, 4);
    expect(e).toMatchObject({ gain: 0.4, voice: 'snare', ringId: 'r1', step: 0 });
  });

  it('returns nothing for an empty range and rejects nonsense', () => {
    const s = makeSong([{ pulses: 4, steps: 4 }]);
    expect(eventsInRange(s, 2, 2)).toEqual([]);
    expect(eventsInRange(s, 3, 1)).toEqual([]);
    expect(() => eventsInRange(s, -1, 1)).toThrow(RangeError);
    expect(() => eventsInRange(s, 0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('swing', () => {
  it('leaves even steps alone and delays odd steps', () => {
    expect(swingOffsetBeats(66, 8, 0)).toBe(0);
    expect(swingOffsetBeats(66, 8, 2)).toBe(0);
    expect(swingOffsetBeats(66, 8, 1)).toBeGreaterThan(0);
    expect(swingOffsetBeats(0, 8, 1)).toBe(0);
  });

  it('gives a triplet feel at about 66 on eighth notes', () => {
    // 8 steps in 4 beats means each step is half a beat; a triplet delays the off-beat by 1/6 beat.
    expect(swingOffsetBeats(66.6667, 8, 1)).toBeCloseTo(1 / 6, 3);
  });

  it('moves the sounding time but not the nominal beat', () => {
    const s = makeSong([{ pulses: 8, steps: 8 }], 100, 66);
    const ev = eventsInRange(s, 0, 1);
    expect(ev.map((e) => e.beat)).toEqual([0, 0.5]);
    expect(ev[0]!.time).toBe(0);
    expect(ev[1]!.time).toBeGreaterThan(0.5);
  });
});

describe('time conversion', () => {
  it('converts beats to seconds', () => {
    expect(beatsToSeconds(1, 120)).toBe(0.5);
    expect(barSeconds(120)).toBe(2);
    expect(barSeconds(60)).toBe(4);
  });
});
