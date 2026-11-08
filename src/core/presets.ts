import { makeSong, type Song } from './song';

export interface Preset {
  id: string;
  name: string;
  song: () => Song;
}

/**
 * Starting points. The first four are named patterns from Toussaint's 2005
 * paper "The Euclidean Algorithm Generates Traditional Musical Rhythms";
 * the last two show polyrhythm, where rings of different sizes drift in and
 * out of step.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'tresillo',
    name: 'Tresillo (3 in 8)',
    song: () =>
      makeSong([
        { voice: 'kick', pulses: 3, steps: 8, volume: 90 },
        { voice: 'hat', pulses: 8, steps: 8, volume: 40 },
        { voice: 'clave', pulses: 2, steps: 8, rotation: 4, volume: 60 },
      ], 100),
  },
  {
    id: 'cinquillo',
    name: 'Cinquillo (5 in 8)',
    song: () =>
      makeSong([
        { voice: 'kick', pulses: 2, steps: 8, volume: 90 },
        { voice: 'cowbell', pulses: 5, steps: 8, volume: 60 },
        { voice: 'hat', pulses: 4, steps: 8, rotation: 1, volume: 45 },
      ], 96),
  },
  {
    id: 'bell',
    name: 'Bell (7 in 12)',
    song: () =>
      makeSong([
        { voice: 'cowbell', pulses: 7, steps: 12, volume: 65 },
        { voice: 'kick', pulses: 4, steps: 12, volume: 90 },
        { voice: 'clave', pulses: 5, steps: 12, rotation: 2, volume: 55 },
      ], 108),
  },
  {
    id: 'bossa',
    name: 'Bossa (5 in 16)',
    song: () =>
      makeSong([
        { voice: 'clave', pulses: 5, steps: 16, volume: 70 },
        { voice: 'kick', pulses: 4, steps: 16, volume: 85 },
        { voice: 'hat', pulses: 8, steps: 16, volume: 35 },
      ], 120),
  },
  {
    id: 'three-four',
    name: 'Three against four',
    song: () =>
      makeSong([
        { voice: 'kick', pulses: 3, steps: 3, volume: 90 },
        { voice: 'clave', pulses: 4, steps: 4, volume: 70 },
      ], 84),
  },
  {
    id: 'drift',
    name: 'Five, seven and eleven',
    song: () =>
      makeSong([
        { voice: 'kick', pulses: 5, steps: 5, volume: 85 },
        { voice: 'tom', pulses: 7, steps: 7, volume: 60 },
        { voice: 'hat', pulses: 11, steps: 11, volume: 40 },
      ], 76),
  },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
