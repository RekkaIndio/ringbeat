/**
 * Offline mixdown. Renders a whole loop to samples without any audio hardware,
 * which is what the WAV export uses and what makes the audio testable.
 */
import { eventsInRange, beatsToSeconds } from './schedule';
import { renderVoice } from './synth';
import { BEATS_PER_BAR, VOICES, type Song, type VoiceId } from './song';

export const MAX_RENDER_BARS = 64;

/**
 * Mix `bars` bars of the song. Tails that run past the end of the loop wrap
 * around to the start, so the result loops seamlessly in any player or sampler.
 */
export function renderSong(song: Song, bars: number, sampleRate: number): Float32Array {
  if (!Number.isInteger(bars) || bars < 1 || bars > MAX_RENDER_BARS) {
    throw new RangeError(`bars must be a whole number from 1 to ${MAX_RENDER_BARS}`);
  }
  const total = Math.round(beatsToSeconds(bars * BEATS_PER_BAR, song.bpm) * sampleRate);
  const mix = new Float32Array(total);
  const voices = new Map<VoiceId, Float32Array>();
  for (const v of VOICES) voices.set(v, renderVoice(v, sampleRate));

  for (const e of eventsInRange(song, 0, bars * BEATS_PER_BAR)) {
    const start = Math.round(beatsToSeconds(e.time, song.bpm) * sampleRate);
    const samples = voices.get(e.voice)!;
    for (let i = 0; i < samples.length; i++) {
      const at = (start + i) % total;
      mix[at] = mix[at]! + samples[i]! * e.gain;
    }
  }
  // Soft limiter: keeps dense patterns from clipping while leaving quiet ones untouched.
  for (let i = 0; i < total; i++) mix[i] = Math.tanh(mix[i]!);
  return mix;
}
