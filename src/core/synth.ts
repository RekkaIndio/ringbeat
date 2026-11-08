/**
 * A tiny drum synth. Each voice is a pure function from sample rate to a
 * buffer of samples, with no randomness beyond a fixed-seed noise source, so
 * the same song always renders to exactly the same audio. The browser
 * uploads these buffers to the Web Audio graph; the WAV exporter mixes them directly.
 */
import type { VoiceId } from './song';

const TWO_PI = Math.PI * 2;

/** Deterministic white noise in [-1, 1). */
function noiseSource(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 2 ** 31) - 1;
  };
}

function build(
  sampleRate: number,
  seconds: number,
  fn: (t: number, i: number) => number,
  peak = 0.9,
): Float32Array {
  const n = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const v = fn(i / sampleRate, i);
    out[i] = v;
    max = Math.max(max, Math.abs(v));
  }
  if (max > 0) {
    const k = peak / max;
    // A short fade-out guarantees no click at the end of the buffer.
    const fade = Math.min(n, Math.round(0.004 * sampleRate));
    for (let i = 0; i < n; i++) {
      const tail = i >= n - fade ? (n - i) / fade : 1;
      out[i] = out[i]! * k * tail;
    }
  }
  return out;
}

const exp = (t: number, decay: number) => Math.exp(-t / decay);

/** A sine whose pitch glides from `from` to `to` Hz; the phase is integrated so there are no clicks. */
function sweep(sampleRate: number, from: number, to: number, glide: number) {
  let phase = 0;
  return (t: number) => {
    const f = to + (from - to) * Math.exp(-t / glide);
    phase += (TWO_PI * f) / sampleRate;
    return Math.sin(phase);
  };
}

export function renderVoice(voice: VoiceId, sampleRate: number): Float32Array {
  switch (voice) {
    case 'kick': {
      const body = sweep(sampleRate, 160, 46, 0.035);
      return build(sampleRate, 0.45, (t) => body(t) * exp(t, 0.14) + (t < 0.004 ? 0.4 : 0));
    }
    case 'snare': {
      const noise = noiseSource(11);
      const tone = sweep(sampleRate, 230, 180, 0.04);
      return build(sampleRate, 0.3, (t) => noise() * exp(t, 0.06) * 0.8 + tone(t) * exp(t, 0.05) * 0.6);
    }
    case 'hat': {
      const noise = noiseSource(23);
      let prev = 0;
      return build(sampleRate, 0.12, (t) => {
        const n = noise();
        const high = n - prev; // first difference: a cheap high-pass
        prev = n;
        return high * exp(t, 0.018);
      }, 0.7);
    }
    case 'openHat': {
      const noise = noiseSource(37);
      let prev = 0;
      return build(sampleRate, 0.5, (t) => {
        const n = noise();
        const high = n - prev;
        prev = n;
        return high * exp(t, 0.12);
      }, 0.65);
    }
    case 'clap': {
      const noise = noiseSource(41);
      let prev = 0;
      return build(sampleRate, 0.35, (t) => {
        const n = noise();
        const band = n - 0.6 * prev;
        prev = n;
        // Three quick bursts, then a tail: a hand-clap in three beats.
        const burst = [0, 0.011, 0.022].reduce((sum, start) => sum + (t >= start ? exp(t - start, 0.006) : 0), 0);
        return band * (burst * 0.6 + exp(t, 0.09) * 0.5);
      }, 0.8);
    }
    case 'tom': {
      const body = sweep(sampleRate, 210, 115, 0.06);
      return build(sampleRate, 0.5, (t) => body(t) * exp(t, 0.16));
    }
    case 'clave': {
      return build(sampleRate, 0.15, (t) =>
        (Math.sin(TWO_PI * 2500 * t) + 0.5 * Math.sin(TWO_PI * 1700 * t)) * exp(t, 0.018), 0.8);
    }
    case 'cowbell': {
      const square = (f: number, t: number) => (Math.sin(TWO_PI * f * t) >= 0 ? 1 : -1);
      return build(sampleRate, 0.45, (t) => (square(540, t) + square(800, t)) * 0.5 * exp(t, 0.11), 0.7);
    }
  }
}
