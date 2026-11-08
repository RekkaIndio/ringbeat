import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AudioEngine } from '../audio/engine';
import { decodeSong, songToHash } from '../core/codec';
import { songToMidi } from '../core/midi';
import { PRESETS, findPreset } from '../core/presets';
import { renderSong } from '../core/render';
import {
  addRing, defaultSong, MAX_BPM, MAX_RINGS, MAX_SWING, MIN_BPM, removeRing, setSwing, setTempo, updateRing,
  type Ring, type Song,
} from '../core/song';
import { encodeWav } from '../core/wav';
import { downloadBytes } from './download';
import { RingRow, Slider } from './RingRow';
import { PlayStopIcon } from './icons';
import { RingStage } from './RingStage';

const EXPORT_BARS = 4;
const EXPORT_SAMPLE_RATE = 44100;

type Action =
  | { type: 'load'; song: Song }
  | { type: 'tempo'; bpm: number }
  | { type: 'swing'; swing: number }
  | { type: 'add' }
  | { type: 'remove'; id: string }
  | { type: 'ring'; id: string; patch: Partial<Omit<Ring, 'id'>> };

function reducer(song: Song, action: Action): Song {
  switch (action.type) {
    case 'load': return action.song;
    case 'tempo': return setTempo(song, action.bpm);
    case 'swing': return setSwing(song, action.swing);
    case 'add': return addRing(song);
    case 'remove': return removeRing(song, action.id);
    case 'ring': return updateRing(song, action.id, action.patch);
  }
}

function readLocationHash(): { song: Song; notice: string | null } {
  const hash = window.location.hash.slice(1);
  if (!hash) return { song: defaultSong(), notice: null };
  const result = decodeSong(hash);
  if (result.ok) return { song: result.song, notice: null };
  return {
    song: defaultSong(),
    notice: `That link couldn't be read (${result.reason}), so Ringbeat opened its default pattern.`,
  };
}

export function App() {
  const [initial] = useState(readLocationHash);
  const [song, dispatch] = useReducer(reducer, initial.song);
  const [notice, setNotice] = useState<string | null>(initial.notice);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const [hubVisible, setHubVisible] = useState(true);
  const hubRef = useRef<HTMLButtonElement>(null);

  const songRef = useRef(song);
  songRef.current = song;
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine(() => songRef.current);
  const engine = engineRef.current;
  const getBeats = useCallback(() => engine.positionBeats(), [engine]);

  // Keep the address bar in step with the song, so the URL is always a shareable link.
  useEffect(() => {
    const id = setTimeout(() => {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${songToHash(song)}`);
    }, 150);
    return () => clearTimeout(id);
  }, [song]);

  // Pasting a different link into the address bar loads it without a refresh.
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (!hash || hash === songToHash(songRef.current)) return;
      const result = decodeSong(hash);
      if (result.ok) {
        dispatch({ type: 'load', song: result.song });
        setNotice(null);
      } else {
        setNotice(`That link couldn't be read (${result.reason}), so the pattern was left as it was.`);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => () => engine.dispose(), [engine]);

  // On a phone the Play button scrolls away with the dial; a floating copy covers that gap.
  useEffect(() => {
    const hub = hubRef.current;
    if (!hub || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setHubVisible(entry?.isIntersecting ?? true), { threshold: 0.6 });
    observer.observe(hub);
    return () => observer.disconnect();
  }, []);

  const togglePlay = useCallback(async () => {
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
      return;
    }
    try {
      await engine.start();
      setPlaying(true);
      setStatus('');
    } catch (err) {
      setPlaying(false);
      setStatus(err instanceof Error ? `Couldn't start audio: ${err.message}` : "Couldn't start audio.");
    }
  }, [engine]);

  // Space plays and stops, unless the person is using a control that already uses Space.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, button, a, [role="button"]')) return;
      e.preventDefault();
      void togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay]);

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${songToHash(song)}`;
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied.');
    } catch {
      setStatus("Couldn't copy automatically. The link is in your address bar.");
    }
  };

  const exportMidi = () => {
    downloadBytes(songToMidi(song, EXPORT_BARS), `ringbeat-${song.bpm}bpm.mid`, 'audio/midi');
    setStatus(`Downloaded ${EXPORT_BARS} bars as MIDI.`);
  };

  const exportWav = () => {
    const wav = encodeWav(renderSong(song, EXPORT_BARS, EXPORT_SAMPLE_RATE), EXPORT_SAMPLE_RATE);
    downloadBytes(wav, `ringbeat-${song.bpm}bpm.wav`, 'audio/wav');
    setStatus(`Downloaded ${EXPORT_BARS} bars as a seamless WAV loop.`);
  };

  return (
    <div className="app">
      <header className="masthead">
        <h1>Ringbeat</h1>
        <p>
          Pulses spread evenly around each ring. Every ring takes one bar, so rings of different sizes drift against each other.
        </p>
      </header>

      <main className="layout">
        <RingStage song={song} playing={playing} getBeats={getBeats} onToggle={() => void togglePlay()} hubRef={hubRef} />

        <div className="controls">
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button type="button" className="quiet" onClick={() => setNotice(null)}>Dismiss</button>
            </div>
          )}

          <section className="panel" aria-labelledby="tempo-h">
            <h2 id="tempo-h">Tempo and swing</h2>
            <div className="tempo">
              <output className="bpm" aria-live="off">{song.bpm}</output>
              <span className="unit">beats per minute</span>
            </div>
            <Slider label="Tempo" value={song.bpm} min={MIN_BPM} max={MAX_BPM} onChange={(bpm) => dispatch({ type: 'tempo', bpm })} />
            <Slider label="Swing" value={song.swing} min={0} max={MAX_SWING} onChange={(swing) => dispatch({ type: 'swing', swing })} />
            <div className="field">
              <label htmlFor="preset">Start from</label>
              <select
                id="preset"
                value=""
                onChange={(e) => {
                  const preset = findPreset(e.target.value);
                  if (preset) dispatch({ type: 'load', song: preset.song() });
                }}
              >
                <option value="" disabled>Choose a preset</option>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="panel" aria-labelledby="rings-h">
            <div className="panel-head">
              <h2 id="rings-h">Rings</h2>
              <button
                type="button"
                onClick={() => dispatch({ type: 'add' })}
                disabled={song.rings.length >= MAX_RINGS}
              >
                Add ring
              </button>
            </div>
            {song.rings.map((ring, i) => (
              <RingRow
                key={ring.id}
                ring={ring}
                index={i}
                canRemove={song.rings.length > 1}
                onChange={(patch) => dispatch({ type: 'ring', id: ring.id, patch })}
                onRemove={() => dispatch({ type: 'remove', id: ring.id })}
              />
            ))}
          </section>

          <section className="panel" aria-labelledby="share-h">
            <h2 id="share-h">Share and export</h2>
            <div className="actions">
              <button type="button" onClick={() => void copyLink()}>Copy link</button>
              <button type="button" onClick={exportMidi}>Download MIDI</button>
              <button type="button" onClick={exportWav}>Download WAV</button>
            </div>
            <p className="hint">
              The link holds the whole pattern, so nothing is stored anywhere else. Exports are {EXPORT_BARS} bars long; the WAV loops without a click.
            </p>
            <p className="status" role="status" aria-live="polite">{status}</p>
          </section>
        </div>
      </main>

      {!hubVisible && (
        <button type="button" className="fab" onClick={() => void togglePlay()} aria-label={playing ? 'Stop' : 'Play'}>
          <PlayStopIcon playing={playing} />
        </button>
      )}
    </div>
  );
}
