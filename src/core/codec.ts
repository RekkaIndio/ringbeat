/**
 * Share-link codec. A whole song becomes a short URL fragment such as
 * `v1-AGQAAwQBAAA...`, so patterns can be shared with no server and no account.
 *
 * Layout (bytes): version, bpm - 40, swing, ring count, then six bytes per ring
 * (voice index, pulses, steps, rotation, volume, flags), then a CRC-8 of
 * everything before it. Decoding validates every field and never clamps:
 * a damaged link is rejected, not silently turned into a different song.
 */
import { MAX_STEPS } from './euclid';
import {
  MAX_BPM, MAX_RINGS, MAX_SWING, MIN_BPM, MIN_RINGS, VOICES, makeRing, type Song,
} from './song';

export const CODEC_VERSION = 1;
const PREFIX = `v${CODEC_VERSION}-`;
const BYTES_PER_RING = 6;
const HEADER_BYTES = 4;

export type DecodeResult =
  | { ok: true; song: Song }
  | { ok: false; reason: string };

function crc8(bytes: readonly number[]): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

function toBase64Url(bytes: readonly number[]): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): number[] | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    return Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeSong(song: Song): string {
  const bytes: number[] = [CODEC_VERSION, song.bpm - MIN_BPM, song.swing, song.rings.length];
  for (const r of song.rings) {
    bytes.push(VOICES.indexOf(r.voice), r.pulses, r.steps, r.rotation, r.volume, r.muted ? 1 : 0);
  }
  bytes.push(crc8(bytes));
  return PREFIX + toBase64Url(bytes);
}

export function decodeSong(input: string): DecodeResult {
  const text = input.replace(/^#/, '').trim();
  if (!text.startsWith(PREFIX)) return { ok: false, reason: 'unrecognised link format' };
  const bytes = fromBase64Url(text.slice(PREFIX.length));
  if (!bytes) return { ok: false, reason: 'link contains invalid characters' };
  if (bytes.length < HEADER_BYTES + 1) return { ok: false, reason: 'link is too short' };

  const body = bytes.slice(0, -1);
  if (crc8(body) !== bytes[bytes.length - 1]) return { ok: false, reason: 'link is damaged (checksum mismatch)' };
  if (body[0] !== CODEC_VERSION) return { ok: false, reason: `unsupported version ${body[0]}` };

  const bpm = body[1]! + MIN_BPM;
  const swing = body[2]!;
  const count = body[3]!;
  if (bpm > MAX_BPM) return { ok: false, reason: 'tempo out of range' };
  if (swing > MAX_SWING) return { ok: false, reason: 'swing out of range' };
  if (count < MIN_RINGS || count > MAX_RINGS) return { ok: false, reason: 'ring count out of range' };
  if (body.length !== HEADER_BYTES + count * BYTES_PER_RING) return { ok: false, reason: 'link length does not match ring count' };

  const rings = [];
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + i * BYTES_PER_RING;
    const [voiceIndex, pulses, steps, rotation, volume, flags] = body.slice(o, o + BYTES_PER_RING) as [
      number, number, number, number, number, number,
    ];
    const voice = VOICES[voiceIndex];
    if (!voice) return { ok: false, reason: `ring ${i + 1}: unknown sound` };
    if (steps < 1 || steps > MAX_STEPS) return { ok: false, reason: `ring ${i + 1}: steps out of range` };
    if (pulses > steps) return { ok: false, reason: `ring ${i + 1}: more pulses than steps` };
    if (rotation >= steps) return { ok: false, reason: `ring ${i + 1}: rotation out of range` };
    if (volume > 100) return { ok: false, reason: `ring ${i + 1}: volume out of range` };
    if (flags > 1) return { ok: false, reason: `ring ${i + 1}: unknown flags` };
    rings.push(makeRing(`r${i + 1}`, { voice, pulses, steps, rotation, volume, muted: flags === 1 }));
  }
  return { ok: true, song: { bpm, swing, rings } };
}

/** The fragment to put after `#` in a URL. */
export function songToHash(song: Song): string {
  return encodeSong(song);
}
