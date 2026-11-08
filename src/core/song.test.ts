import { describe, expect, it } from 'vitest';
import {
  addRing, defaultSong, makeRing, makeSong, MAX_BPM, MAX_RINGS, MIN_BPM, removeRing,
  setSwing, setTempo, updateRing, validateSong, VOICES,
} from './song';
import { PRESETS } from './presets';

describe('song model', () => {
  it('ships a valid default song and valid presets', () => {
    expect(validateSong(defaultSong())).toEqual([]);
    for (const p of PRESETS) expect(validateSong(p.song()), p.id).toEqual([]);
  });

  it('keeps preset ids unique', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it('clamps tempo and swing', () => {
    const s = defaultSong();
    expect(setTempo(s, 5).bpm).toBe(MIN_BPM);
    expect(setTempo(s, 9999).bpm).toBe(MAX_BPM);
    expect(setTempo(s, Number.NaN).bpm).toBe(MIN_BPM);
    expect(setSwing(s, -3).swing).toBe(0);
    expect(setSwing(s, 250).swing).toBe(100);
  });

  it('adds rings with unused voices until the limit, then stops', () => {
    let s = makeSong([{ voice: 'kick' }]);
    for (let i = 0; i < 10; i++) s = addRing(s);
    expect(s.rings).toHaveLength(MAX_RINGS);
    expect(s.rings[1]!.voice).toBe('snare');
    expect(new Set(s.rings.map((r) => r.id)).size).toBe(MAX_RINGS);
    expect(validateSong(s)).toEqual([]);
  });

  it('gives each added ring a different step count so they drift apart', () => {
    let s = makeSong([{ steps: 8 }]);
    for (let i = 0; i < 5; i++) s = addRing(s);
    expect(new Set(s.rings.map((r) => r.steps)).size).toBe(s.rings.length);
    expect(s.rings.every((r) => r.pulses >= 1 && r.pulses < r.steps)).toBe(true);
    expect(validateSong(s)).toEqual([]);
  });

  it('never reuses an id after a removal', () => {
    let s = makeSong([{}, {}, {}]);
    s = removeRing(s, 'r2');
    s = addRing(s);
    expect(s.rings.map((r) => r.id)).toEqual(['r1', 'r3', 'r4']);
  });

  it('refuses to remove the last ring', () => {
    const s = makeSong([{}]);
    expect(removeRing(s, 'r1').rings).toHaveLength(1);
  });

  it('pulls pulses and rotation back in range when steps shrink', () => {
    let s = makeSong([{ pulses: 7, steps: 12, rotation: 9 }]);
    s = updateRing(s, 'r1', { steps: 5 });
    expect(s.rings[0]).toMatchObject({ steps: 5, pulses: 5, rotation: 4 });
    expect(validateSong(s)).toEqual([]);
  });

  it('wraps rotation and ignores edits to unknown ids or bad voices', () => {
    let s = makeSong([{ steps: 8, rotation: 0 }]);
    s = updateRing(s, 'r1', { rotation: -1 });
    expect(s.rings[0]!.rotation).toBe(7);
    s = updateRing(s, 'r1', { rotation: 8 });
    expect(s.rings[0]!.rotation).toBe(0);
    const same = updateRing(s, 'nope', { pulses: 1 });
    expect(same.rings).toEqual(s.rings);
    const bad = updateRing(s, 'r1', { voice: 'banjo' as never });
    expect(bad.rings[0]!.voice).toBe(s.rings[0]!.voice);
  });

  it('does not mutate the song it is given', () => {
    const s = defaultSong();
    const frozen = JSON.stringify(s);
    updateRing(s, 'r1', { pulses: 1 });
    addRing(s);
    removeRing(s, 'r1');
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it('flags broken songs', () => {
    const s = defaultSong();
    s.rings[0]!.pulses = 99;
    expect(validateSong(s)).toContain('r1: pulses out of range');
    expect(validateSong({ bpm: 1, swing: 0, rings: [] }).length).toBeGreaterThan(1);
  });

  it('exposes one ring factory that normalises its input', () => {
    const r = makeRing('x', { steps: 99, pulses: 99, rotation: 100, volume: 500 });
    expect(r).toMatchObject({ steps: 32, pulses: 32, rotation: 4, volume: 100 });
    expect(VOICES).toContain(r.voice);
  });
});
