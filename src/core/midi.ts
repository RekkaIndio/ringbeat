/**
 * Standard MIDI File export (format 1): one tempo track plus one track per
 * audible ring, all on the General MIDI percussion channel.
 */
import { eventsInRange } from './schedule';
import { BEATS_PER_BAR, VOICE_LABELS, type Song, type VoiceId } from './song';

export const PPQ = 480;
export const MAX_EXPORT_BARS = 64;

/** General MIDI percussion key numbers. */
export const GM_DRUM_NOTE: Record<VoiceId, number> = {
  kick: 36,
  snare: 38,
  hat: 42,
  openHat: 46,
  clap: 39,
  tom: 45,
  clave: 75,
  cowbell: 56,
};

/** Variable-length quantity, as used for delta times. */
export function vlq(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) throw new RangeError(`bad VLQ value ${value}`);
  const out = [value & 0x7f];
  let rest = value >>> 7;
  while (rest > 0) {
    out.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return out;
}

const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number): number[] => [(n >>> 8) & 255, n & 255];
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0) & 0x7f);

function chunk(type: string, data: number[]): number[] {
  return [...ascii(type), ...u32(data.length), ...data];
}

function trackName(name: string): number[] {
  const bytes = ascii(name);
  return [0x00, 0xff, 0x03, ...vlq(bytes.length), ...bytes];
}

interface RawEvent {
  tick: number;
  /** Note-offs sort before note-ons on the same tick so repeated notes retrigger cleanly. */
  order: number;
  bytes: number[];
}

function track(events: RawEvent[], endTick: number, name: string): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data: number[] = [...trackName(name)];
  let last = 0;
  for (const e of sorted) {
    data.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  data.push(...vlq(Math.max(0, endTick - last)), 0xff, 0x2f, 0x00);
  return chunk('MTrk', data);
}

/**
 * Export `bars` bars of the song. The final end-of-track marker sits exactly at
 * the end of the last bar, so the file drops into a DAW as a clean loop.
 */
export function songToMidi(song: Song, bars = 4): Uint8Array {
  if (!Number.isInteger(bars) || bars < 1 || bars > MAX_EXPORT_BARS) {
    throw new RangeError(`bars must be a whole number from 1 to ${MAX_EXPORT_BARS}`);
  }
  const endTick = bars * BEATS_PER_BAR * PPQ;
  const microsPerBeat = Math.round(60_000_000 / song.bpm);

  const tempoTrack = track(
    [
      { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (microsPerBeat >>> 16) & 255, (microsPerBeat >>> 8) & 255, microsPerBeat & 255] },
      { tick: 0, order: 1, bytes: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] },
    ],
    endTick,
    'Ringbeat',
  );

  const audible = song.rings.map((ring, index) => ({ ring, index })).filter(({ ring }) => !ring.muted);
  const ringTracks = audible.map(({ ring, index }) => {
    const note = GM_DRUM_NOTE[ring.voice];
    const stepTicks = Math.floor((BEATS_PER_BAR * PPQ) / ring.steps);
    const length = Math.max(1, Math.min(120, Math.floor(stepTicks / 2)));
    const events: RawEvent[] = [];
    for (const e of eventsInRange(song, 0, bars * BEATS_PER_BAR)) {
      if (e.ringIndex !== index) continue;
      const tick = Math.round(e.time * PPQ);
      const velocity = Math.max(1, Math.min(127, Math.round(e.gain * 127)));
      events.push({ tick, order: 1, bytes: [0x99, note, velocity] });
      events.push({ tick: tick + length, order: 0, bytes: [0x89, note, 0] });
    }
    return track(events, endTick, `Ring ${index + 1}: ${VOICE_LABELS[ring.voice]}`);
  });

  const header = chunk('MThd', [...u16(1), ...u16(1 + ringTracks.length), ...u16(PPQ)]);
  return Uint8Array.from([...header, ...tempoTrack, ...ringTracks.flat()]);
}
