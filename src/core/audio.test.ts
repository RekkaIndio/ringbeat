import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';
import { renderSong } from './render';
import { renderVoice } from './synth';
import { makeSong, VOICES } from './song';

const SR = 44100;
const energy = (a: Float32Array, from = 0, to = a.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]! * a[i]!;
  return s;
};

describe('synth voices', () => {
  for (const voice of VOICES) {
    it(`${voice} is finite, audible, bounded and ends silent`, () => {
      const a = renderVoice(voice, SR);
      expect(a.length).toBeGreaterThan(SR * 0.05);
      expect(a.length).toBeLessThan(SR);
      let peak = 0;
      for (const v of a) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0.3);
      expect(peak).toBeLessThanOrEqual(0.9001);
      expect(Math.abs(a[a.length - 1]!)).toBeLessThan(1e-3);
    });

    it(`${voice} renders identically every time`, () => {
      expect(Array.from(renderVoice(voice, SR))).toEqual(Array.from(renderVoice(voice, SR)));
    });
  }

  it('scales with sample rate instead of changing length in samples', () => {
    const a = renderVoice('kick', 22050).length;
    const b = renderVoice('kick', 44100).length;
    expect(b / a).toBeCloseTo(2, 1);
  });

  it('gives each voice its own character', () => {
    const sigs = new Set(VOICES.map((v) => renderVoice(v, SR).slice(0, 2000).reduce((s, x) => s + Math.abs(x), 0).toFixed(3)));
    expect(sigs.size).toBe(VOICES.length);
  });
});

describe('renderSong', () => {
  it('renders exactly the length of the requested bars', () => {
    const s = makeSong([{ pulses: 3, steps: 8 }], 120);
    expect(renderSong(s, 1, SR)).toHaveLength(2 * SR);
    expect(renderSong(s, 4, SR)).toHaveLength(8 * SR);
    expect(renderSong(makeSong([{}], 60), 1, 8000)).toHaveLength(4 * 8000);
  });

  it('puts sound where the pattern says, and silence elsewhere', () => {
    // One kick on the downbeat of a 2-second bar: loud at the start, silent by 1.5s.
    const s = makeSong([{ voice: 'kick', pulses: 1, steps: 4 }], 120);
    const out = renderSong(s, 1, SR);
    expect(energy(out, 0, SR * 0.2)).toBeGreaterThan(10);
    expect(energy(out, Math.round(SR * 1.5), out.length)).toBeLessThan(1e-6);
  });

  it('wraps tails past the end of the loop back to the start', () => {
    // A kick on the last eighth note starts at 1.75 s of a 2 s bar and rings for 0.45 s,
    // so 0.2 s of its tail must reappear at the start of the buffer.
    const s = makeSong([{ voice: 'kick', pulses: 1, steps: 8, rotation: 7 }], 120);
    const out = renderSong(s, 1, SR);
    expect(energy(out, 0, Math.round(SR * 0.1))).toBeGreaterThan(1);
    // ...but only the tail: nothing is sounding at the very start of the kick itself.
    expect(energy(out, Math.round(SR * 1.0), Math.round(SR * 1.7))).toBeLessThan(1e-6);
  });

  it('is deterministic', () => {
    const s = makeSong([{ pulses: 5, steps: 8 }, { voice: 'snare', pulses: 3, steps: 7 }], 99, 30);
    expect(Array.from(renderSong(s, 2, 22050))).toEqual(Array.from(renderSong(s, 2, 22050)));
  });

  it('never exceeds full scale, even when every ring fires at once', () => {
    const dense = makeSong(VOICES.slice(0, 6).map((voice) => ({ voice, pulses: 16, steps: 16, volume: 100 })), 240);
    const out = renderSong(dense, 1, 22050);
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.5);
  });

  it('is silent when every ring is muted', () => {
    const s = makeSong([{ pulses: 8, steps: 8, muted: true }]);
    expect(energy(renderSong(s, 1, 22050))).toBe(0);
  });

  it('applies swing to the timing of odd steps', () => {
    const straight = renderSong(makeSong([{ voice: 'clave', pulses: 8, steps: 8 }], 120, 0), 1, SR);
    const swung = renderSong(makeSong([{ voice: 'clave', pulses: 8, steps: 8 }], 120, 66), 1, SR);
    expect(Array.from(straight)).not.toEqual(Array.from(swung));
    // The first hit (a downbeat) is untouched by swing.
    expect(Array.from(swung.slice(0, 200))).toEqual(Array.from(straight.slice(0, 200)));
  });

  it('rejects an invalid number of bars', () => {
    const s = makeSong([{}]);
    expect(() => renderSong(s, 0, SR)).toThrow(RangeError);
    expect(() => renderSong(s, 1.5, SR)).toThrow(RangeError);
    expect(() => renderSong(s, 65, SR)).toThrow(RangeError);
  });
});

describe('encodeWav', () => {
  const text = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));

  it('writes a valid 16-bit mono PCM header', () => {
    const wav = encodeWav(new Float32Array(100), 44100);
    const v = new DataView(wav.buffer);
    expect(text(wav, 0, 4)).toBe('RIFF');
    expect(text(wav, 8, 4)).toBe('WAVE');
    expect(text(wav, 12, 4)).toBe('fmt ');
    expect(text(wav, 36, 4)).toBe('data');
    expect(wav.length).toBe(44 + 200);
    expect(v.getUint32(4, true)).toBe(wav.length - 8);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(88200);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(200);
  });

  it('round-trips sample values to within one 16-bit step and clamps overs', () => {
    const src = Float32Array.from([0, 0.5, -0.5, 1, -1, 2, -2, 0.123456]);
    const wav = encodeWav(src, 8000);
    const v = new DataView(wav.buffer);
    const back = Array.from(src, (_, i) => v.getInt16(44 + i * 2, true) / 32768);
    const expected = Array.from(src, (x) => Math.max(-1, Math.min(1, x)));
    back.forEach((b, i) => expect(Math.abs(b - expected[i]!)).toBeLessThan(2 / 32768));
  });

  it('encodes a rendered song as audible audio of the right duration', () => {
    const s = makeSong([{ voice: 'snare', pulses: 3, steps: 8 }], 120);
    const wav = encodeWav(renderSong(s, 2, SR), SR);
    const v = new DataView(wav.buffer);
    expect(v.getUint32(40, true) / 2 / SR).toBeCloseTo(4, 3);
    let loud = 0;
    for (let i = 44; i < wav.length; i += 2) if (Math.abs(v.getInt16(i, true)) > 3000) loud++;
    expect(loud).toBeGreaterThan(100);
  });
});
