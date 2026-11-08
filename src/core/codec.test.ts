import { describe, expect, it } from 'vitest';
import { decodeSong, encodeSong, songToHash } from './codec';
import { PRESETS } from './presets';
import { defaultSong, makeSong, MAX_RINGS, VOICES, validateSong, type Song } from './song';

/** Small deterministic generator so the fuzz test is reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function randomSong(rand: () => number): Song {
  const ri = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const count = ri(1, MAX_RINGS);
  return makeSong(
    Array.from({ length: count }, () => {
      const steps = ri(1, 32);
      return {
        voice: VOICES[ri(0, VOICES.length - 1)],
        steps,
        pulses: ri(0, steps),
        rotation: ri(0, steps - 1),
        volume: ri(0, 100),
        muted: rand() < 0.3,
      };
    }),
    ri(40, 240),
    ri(0, 100),
  );
}

describe('share-link codec', () => {
  it('round-trips the default song and every preset', () => {
    for (const song of [defaultSong(), ...PRESETS.map((p) => p.song())]) {
      const result = decodeSong(encodeSong(song));
      expect(result).toEqual({ ok: true, song });
    }
  });

  it('round-trips 500 random songs', () => {
    const rand = lcg(2024);
    for (let i = 0; i < 500; i++) {
      const song = randomSong(rand);
      const r = decodeSong(encodeSong(song));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.song).toEqual(song);
        expect(validateSong(r.song)).toEqual([]);
      }
    }
  });

  it('is deterministic and compact', () => {
    const song = defaultSong();
    expect(encodeSong(song)).toBe(encodeSong(structuredClone(song)));
    expect(encodeSong(song).length).toBeLessThan(40);
    expect(encodeSong(song)).toMatch(/^v1-[A-Za-z0-9_-]+$/);
  });

  it('accepts a leading # and surrounding whitespace', () => {
    const song = defaultSong();
    expect(decodeSong(`#${songToHash(song)}`)).toEqual({ ok: true, song });
    expect(decodeSong(`  ${encodeSong(song)}\n`)).toEqual({ ok: true, song });
  });

  it('rejects links in the wrong shape', () => {
    for (const bad of ['', '#', 'hello', 'v2-AAAA', 'v1-', 'v1-!!!!', 'v1-A', 'v1-AAAA', 'v1-' + 'A'.repeat(500)]) {
      expect(decodeSong(bad).ok, bad).toBe(false);
    }
  });

  it('rejects every single-character corruption of a valid link', () => {
    const good = encodeSong(defaultSong());
    const body = good.slice(3);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let accepted = 0;
    for (let i = 0; i < body.length; i++) {
      for (const ch of alphabet) {
        if (ch === body[i]) continue;
        const mutated = `v1-${body.slice(0, i)}${ch}${body.slice(i + 1)}`;
        const r = decodeSong(mutated);
        // The last base64 character may carry unused padding bits and decode to the same bytes.
        if (r.ok) {
          accepted++;
          expect(r.song).toEqual(defaultSong());
        }
      }
    }
    expect(accepted).toBeLessThan(alphabet.length);
  });

  it('rejects truncated links', () => {
    const good = encodeSong(defaultSong());
    for (let cut = 4; cut < good.length; cut++) expect(decodeSong(good.slice(0, cut)).ok, `cut ${cut}`).toBe(false);
  });

  it('explains why it failed', () => {
    const r = decodeSong('hello');
    expect(r).toEqual({ ok: false, reason: 'unrecognised link format' });
  });
});
