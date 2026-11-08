import { describe, expect, it } from 'vitest';
import { Scheduler, SLICE_BEATS } from './scheduler';
import { eventsInRange, type NoteEvent } from '../core/schedule';
import { makeSong, setTempo, type Song } from '../core/song';

function harness(initial: Song, lookahead = 0.15) {
  let clock = 10;
  let song = initial;
  const played: Array<{ at: number; ring: number; beat: number; handedOverAt: number }> = [];
  const scheduler = new Scheduler({
    getSong: () => song,
    now: () => clock,
    play: (e: NoteEvent, at: number) => played.push({ at, ring: e.ringIndex, beat: e.beat, handedOverAt: clock }),
    lookaheadSeconds: () => lookahead,
  });
  return {
    scheduler,
    played,
    advance(seconds: number, step = 0.025) {
      for (let t = 0; t < seconds - 1e-9; t += step) {
        clock += step;
        scheduler.tick();
      }
    },
    setSong: (s: Song) => { song = s; },
    get clock() { return clock; },
  };
}

describe('Scheduler', () => {
  it('schedules E(3,8) at exact audio times, a bar at a time', () => {
    const h = harness(makeSong([{ pulses: 3, steps: 8 }], 120));
    h.scheduler.start(0.1);
    h.advance(4.2);
    // 120 bpm: a beat is 0.5 s, so beats 0, 1.5, 3 land at +0, +0.75, +1.5 s from the first downbeat.
    const first = h.played.slice(0, 6).map((p) => +(p.at - 10.1).toFixed(6));
    expect(first).toEqual([0, 0.75, 1.5, 2, 2.75, 3.5]);
  });

  it('never schedules the same note twice or skips one', () => {
    const song = makeSong([{ pulses: 5, steps: 12 }, { pulses: 7, steps: 11 }], 133, 40);
    const h = harness(song);
    h.scheduler.start();
    h.advance(10);
    const keys = h.played.map((p) => `${p.ring}:${p.beat}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Independent check: every event up to the last one handed over must be there, exactly once.
    const lastBeat = Math.max(...h.played.map((p) => p.beat));
    const expected = eventsInRange(song, 0, lastBeat + 1e-9).map((e) => `${e.ringIndex}:${e.beat}`);
    expect([...keys].sort()).toEqual([...expected].sort());
    expect(keys.length).toBeGreaterThan(40);
  });

  it('hands each note over in time: never late, never absurdly early', () => {
    const lookahead = 0.15;
    const h = harness(makeSong([{ pulses: 8, steps: 8 }], 200), lookahead);
    h.scheduler.start();
    h.advance(3);
    expect(h.played.length).toBeGreaterThan(5);
    const sliceSeconds = (SLICE_BEATS * 60) / 200;
    for (const p of h.played) {
      expect(p.at).toBeGreaterThanOrEqual(p.handedOverAt);
      expect(p.at - p.handedOverAt).toBeLessThanOrEqual(lookahead + sliceSeconds + 1e-9);
    }
  });

  it('does nothing when stopped, and stop holds position at zero', () => {
    const h = harness(makeSong([{ pulses: 4, steps: 4 }]));
    h.scheduler.tick();
    expect(h.played).toHaveLength(0);
    h.scheduler.start();
    h.scheduler.stop();
    const n = h.played.length;
    h.advance(2);
    expect(h.played.length).toBe(n);
    expect(h.scheduler.positionBeats()).toBe(0);
  });

  it('picks up edits made while playing, without a gap or a restart', () => {
    const h = harness(makeSong([{ pulses: 4, steps: 4 }], 120));
    h.scheduler.start(0.05);
    h.advance(1.0);
    const before = h.played.length;
    h.setSong(setTempo(makeSong([{ pulses: 4, steps: 4 }], 120), 240));
    h.advance(1.0);
    expect(h.played.length).toBeGreaterThan(before);
    const times = h.played.map((p) => p.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('reports a playhead that follows the audio clock', () => {
    const h = harness(makeSong([{ pulses: 4, steps: 4 }], 120));
    h.scheduler.start(0.0);
    h.advance(1.0, 0.01);
    // After about one second at 120 bpm the playhead is near beat 2, within one slice.
    expect(Math.abs(h.scheduler.positionBeats() - 2)).toBeLessThanOrEqual(SLICE_BEATS + 0.05);
    h.advance(1.0, 0.01);
    expect(h.scheduler.positionBeats()).toBeGreaterThan(3.5);
  });

  it('holds the playhead at zero until the first downbeat has sounded', () => {
    const h = harness(makeSong([{ pulses: 4, steps: 4 }], 120));
    h.scheduler.start(0.5);
    h.advance(0.2);
    expect(h.scheduler.positionBeats()).toBe(0);
  });

  it('copes with a long lookahead, as used when the tab is hidden', () => {
    const h = harness(makeSong([{ pulses: 8, steps: 8 }], 120), 1.1);
    h.scheduler.start();
    h.advance(1, 1);
    // One tick per second still fills the next bar, so playback does not stutter.
    const maxAt = Math.max(...h.played.map((p) => p.at));
    expect(maxAt).toBeGreaterThan(h.clock);
  });
});
