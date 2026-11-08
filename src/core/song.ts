/**
 * The song model. Everything here is plain data plus pure functions, so it can
 * be tested without a browser and serialised without surprises.
 */
import { MAX_STEPS, MIN_STEPS } from './euclid';

export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const MAX_RINGS = 6;
export const MIN_RINGS = 1;
export const MAX_SWING = 100;
export const BEATS_PER_BAR = 4;

export const VOICES = ['kick', 'snare', 'hat', 'openHat', 'clap', 'tom', 'clave', 'cowbell'] as const;
export type VoiceId = (typeof VOICES)[number];

export const VOICE_LABELS: Record<VoiceId, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hat: 'Closed hat',
  openHat: 'Open hat',
  clap: 'Clap',
  tom: 'Tom',
  clave: 'Clave',
  cowbell: 'Cowbell',
};

export interface Ring {
  /** Stable identifier used for React keys and edits. Not part of the share link. */
  id: string;
  voice: VoiceId;
  /** Hits spread evenly over `steps`. */
  pulses: number;
  /** Slots in one bar. Every ring takes exactly one bar to go round. */
  steps: number;
  /** Shift of the finished pattern to the right, `0 <= rotation < steps`. */
  rotation: number;
  /** 0 to 100. */
  volume: number;
  muted: boolean;
}

export interface Song {
  bpm: number;
  /** 0 is straight; about 66 gives a triplet feel. See `swingOffsetBeats`. */
  swing: number;
  rings: Ring[];
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function isVoice(value: unknown): value is VoiceId {
  return typeof value === 'string' && (VOICES as readonly string[]).includes(value);
}

export function makeRing(id: string, init: Partial<Omit<Ring, 'id'>> = {}): Ring {
  const steps = clampInt(init.steps ?? 8, MIN_STEPS, MAX_STEPS);
  const pulses = clampInt(init.pulses ?? 3, 0, steps);
  return {
    id,
    voice: isVoice(init.voice) ? init.voice : 'kick',
    pulses,
    steps,
    rotation: mod(Math.trunc(init.rotation ?? 0), steps),
    volume: clampInt(init.volume ?? 80, 0, 100),
    muted: init.muted === true,
  };
}

export function makeSong(
  rings: Array<Partial<Omit<Ring, 'id'>>>,
  bpm = 100,
  swing = 0,
): Song {
  return {
    bpm: clampInt(bpm, MIN_BPM, MAX_BPM),
    swing: clampInt(swing, 0, MAX_SWING),
    rings: rings.map((r, i) => makeRing(`r${i + 1}`, r)),
  };
}

export function defaultSong(): Song {
  return makeSong(
    [
      { voice: 'kick', pulses: 3, steps: 8, rotation: 0, volume: 90 },
      { voice: 'hat', pulses: 7, steps: 12, rotation: 0, volume: 55 },
      { voice: 'clave', pulses: 5, steps: 16, rotation: 2, volume: 70 },
    ],
    104,
    0,
  );
}

function nextRingId(song: Song): string {
  const used = song.rings.map((r) => Number(/^r(\d+)$/.exec(r.id)?.[1] ?? 0));
  return `r${Math.max(0, ...used) + 1}`;
}

/** Step counts offered to new rings in turn, so added rings drift against the others. */
const NEW_RING_STEPS = [8, 12, 16, 5, 7, 10] as const;

/**
 * Add a ring using the first voice not already in play, with a step count the
 * song is unlikely to have yet. No-op at the ring limit.
 */
export function addRing(song: Song): Song {
  if (song.rings.length >= MAX_RINGS) return song;
  const inUse = new Set(song.rings.map((r) => r.voice));
  const voice = VOICES.find((v) => !inUse.has(v)) ?? VOICES[song.rings.length % VOICES.length]!;
  const used = new Set(song.rings.map((r) => r.steps));
  const steps = NEW_RING_STEPS.find((s) => !used.has(s)) ?? NEW_RING_STEPS[song.rings.length % NEW_RING_STEPS.length]!;
  const pulses = Math.max(1, Math.round((steps * 3) / 8));
  return { ...song, rings: [...song.rings, makeRing(nextRingId(song), { voice, steps, pulses })] };
}

/** Remove a ring by id. No-op if it would leave the song empty. */
export function removeRing(song: Song, id: string): Song {
  if (song.rings.length <= MIN_RINGS) return song;
  return { ...song, rings: song.rings.filter((r) => r.id !== id) };
}

/**
 * Edit a ring, keeping it valid. Changing `steps` pulls `pulses` and `rotation`
 * back into range, so a slider can never put a ring in an impossible state.
 */
export function updateRing(
  song: Song,
  id: string,
  patch: Partial<Omit<Ring, 'id'>>,
): Song {
  return {
    ...song,
    rings: song.rings.map((ring) => {
      if (ring.id !== id) return ring;
      const steps = clampInt(patch.steps ?? ring.steps, MIN_STEPS, MAX_STEPS);
      const pulses = clampInt(patch.pulses ?? ring.pulses, 0, steps);
      const rotation = mod(Math.trunc(patch.rotation ?? ring.rotation), steps);
      return {
        ...ring,
        voice: isVoice(patch.voice) ? patch.voice : ring.voice,
        steps,
        pulses,
        rotation,
        volume: clampInt(patch.volume ?? ring.volume, 0, 100),
        muted: patch.muted ?? ring.muted,
      };
    }),
  };
}

export function setTempo(song: Song, bpm: number): Song {
  return { ...song, bpm: clampInt(bpm, MIN_BPM, MAX_BPM) };
}

export function setSwing(song: Song, swing: number): Song {
  return { ...song, swing: clampInt(swing, 0, MAX_SWING) };
}

/** Human-readable problems with a song; an empty array means it is valid. */
export function validateSong(song: Song): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(song.bpm) || song.bpm < MIN_BPM || song.bpm > MAX_BPM) problems.push('bpm out of range');
  if (!Number.isInteger(song.swing) || song.swing < 0 || song.swing > MAX_SWING) problems.push('swing out of range');
  if (song.rings.length < MIN_RINGS || song.rings.length > MAX_RINGS) problems.push('ring count out of range');
  const ids = new Set<string>();
  for (const r of song.rings) {
    if (ids.has(r.id)) problems.push(`duplicate ring id ${r.id}`);
    ids.add(r.id);
    if (!isVoice(r.voice)) problems.push(`${r.id}: unknown voice`);
    if (!Number.isInteger(r.steps) || r.steps < MIN_STEPS || r.steps > MAX_STEPS) problems.push(`${r.id}: steps out of range`);
    else {
      if (!Number.isInteger(r.pulses) || r.pulses < 0 || r.pulses > r.steps) problems.push(`${r.id}: pulses out of range`);
      if (!Number.isInteger(r.rotation) || r.rotation < 0 || r.rotation >= r.steps) problems.push(`${r.id}: rotation out of range`);
    }
    if (!Number.isInteger(r.volume) || r.volume < 0 || r.volume > 100) problems.push(`${r.id}: volume out of range`);
  }
  return problems;
}
