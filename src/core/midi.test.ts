import { describe, expect, it } from 'vitest';
import { GM_DRUM_NOTE, PPQ, songToMidi, vlq } from './midi';
import { defaultSong, makeSong } from './song';

interface ParsedTrack {
  name: string;
  /** Absolute tick of every event, in file order. */
  events: Array<{ tick: number; status: number; data: number[] }>;
  endTick: number;
}

/** Minimal SMF reader, just enough to check what the writer produced. */
function parse(bytes: Uint8Array) {
  let p = 0;
  const str = (n: number) => String.fromCharCode(...bytes.slice(p, (p += n)));
  const u32 = () => ((bytes[p++]! << 24) | (bytes[p++]! << 16) | (bytes[p++]! << 8) | bytes[p++]!) >>> 0;
  const u16 = () => (bytes[p++]! << 8) | bytes[p++]!;
  const readVlq = () => {
    let v = 0;
    for (;;) {
      const b = bytes[p++]!;
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
  };
  expect(str(4)).toBe('MThd');
  expect(u32()).toBe(6);
  const format = u16();
  const ntrks = u16();
  const division = u16();
  const tracks: ParsedTrack[] = [];
  for (let t = 0; t < ntrks; t++) {
    expect(str(4)).toBe('MTrk');
    const len = u32();
    const end = p + len;
    const track: ParsedTrack = { name: '', events: [], endTick: 0 };
    let tick = 0;
    while (p < end) {
      tick += readVlq();
      const status = bytes[p++]!;
      if (status === 0xff) {
        const type = bytes[p++]!;
        const mlen = readVlq();
        const data = Array.from(bytes.slice(p, p + mlen));
        p += mlen;
        if (type === 0x03) track.name = String.fromCharCode(...data);
        else if (type === 0x2f) track.endTick = tick;
        else track.events.push({ tick, status: 0xff00 | type, data });
      } else {
        track.events.push({ tick, status, data: [bytes[p++]!, bytes[p++]!] });
      }
    }
    expect(p).toBe(end);
    tracks.push(track);
  }
  expect(p).toBe(bytes.length);
  return { format, division, tracks };
}

describe('vlq', () => {
  it('matches the examples in the MIDI specification', () => {
    expect(vlq(0)).toEqual([0x00]);
    expect(vlq(0x7f)).toEqual([0x7f]);
    expect(vlq(0x80)).toEqual([0x81, 0x00]);
    expect(vlq(0x2000)).toEqual([0xc0, 0x00]);
    expect(vlq(0x3fff)).toEqual([0xff, 0x7f]);
    expect(vlq(0x4000)).toEqual([0x81, 0x80, 0x00]);
    expect(vlq(0x0fffffff)).toEqual([0xff, 0xff, 0xff, 0x7f]);
  });
  it('rejects values it cannot encode', () => {
    expect(() => vlq(-1)).toThrow(RangeError);
    expect(() => vlq(0x10000000)).toThrow(RangeError);
    expect(() => vlq(1.5)).toThrow(RangeError);
  });
});

describe('songToMidi', () => {
  it('writes a format-1 file with a tempo track and one track per ring', () => {
    const midi = parse(songToMidi(defaultSong(), 2));
    expect(midi.format).toBe(1);
    expect(midi.division).toBe(PPQ);
    expect(midi.tracks).toHaveLength(1 + defaultSong().rings.length);
    expect(midi.tracks[0]!.name).toBe('Ringbeat');
  });

  it('encodes the tempo as microseconds per beat', () => {
    const midi = parse(songToMidi(makeSong([{}], 120)));
    const tempo = midi.tracks[0]!.events.find((e) => e.status === 0xff51)!;
    expect((tempo.data[0]! << 16) | (tempo.data[1]! << 8) | tempo.data[2]!).toBe(500_000);
  });

  it('puts E(3,8) at ticks 0, 720 and 1440 on the percussion channel', () => {
    const midi = parse(songToMidi(makeSong([{ voice: 'kick', pulses: 3, steps: 8, volume: 100 }]), 1));
    const ons = midi.tracks[1]!.events.filter((e) => (e.status & 0xf0) === 0x90);
    expect(ons.map((e) => e.tick)).toEqual([0, 720, 1440]);
    expect(ons.every((e) => e.status === 0x99 && e.data[0] === GM_DRUM_NOTE.kick)).toBe(true);
    expect(ons[0]!.data[1]).toBe(127);
  });

  it('pairs every note-on with a later note-off', () => {
    const midi = parse(songToMidi(defaultSong(), 3));
    for (const t of midi.tracks.slice(1)) {
      const ons = t.events.filter((e) => (e.status & 0xf0) === 0x90);
      const offs = t.events.filter((e) => (e.status & 0xf0) === 0x80);
      expect(offs).toHaveLength(ons.length);
      ons.forEach((on, i) => expect(offs[i]!.tick).toBeGreaterThan(on.tick));
    }
  });

  it('ends every track exactly at the end of the last bar', () => {
    for (const bars of [1, 2, 4]) {
      const midi = parse(songToMidi(defaultSong(), bars));
      for (const t of midi.tracks) expect(t.endTick).toBe(bars * 4 * PPQ);
    }
  });

  it('repeats the pattern each bar', () => {
    const midi = parse(songToMidi(makeSong([{ pulses: 1, steps: 4, rotation: 1 }]), 3));
    const ons = midi.tracks[1]!.events.filter((e) => e.status === 0x99).map((e) => e.tick);
    expect(ons).toEqual([480, 480 + 1920, 480 + 3840]);
  });

  it('leaves muted rings out and applies swing to odd steps', () => {
    const song = makeSong([{ pulses: 8, steps: 8, muted: true }, { voice: 'hat', pulses: 8, steps: 8 }], 120, 66);
    const midi = parse(songToMidi(song, 1));
    expect(midi.tracks).toHaveLength(2);
    expect(midi.tracks[1]!.name).toBe('Ring 2: Closed hat');
    const ons = midi.tracks[1]!.events.filter((e) => e.status === 0x99).map((e) => e.tick);
    expect(ons[0]).toBe(0);
    expect(ons[1]).toBeGreaterThan(240); // an eighth note is 240 ticks; swing pushes it later
    expect(ons[2]).toBe(480);
  });

  it('rejects a bad bar count', () => {
    expect(() => songToMidi(defaultSong(), 0)).toThrow(RangeError);
    expect(() => songToMidi(defaultSong(), 65)).toThrow(RangeError);
  });
});
