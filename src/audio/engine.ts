/**
 * Web Audio adapter around the pure scheduler. Drum voices are rendered once
 * into AudioBuffers by the same synth the WAV exporter uses, so what you hear
 * live is what you download.
 */
import { renderVoice } from '../core/synth';
import { VOICES, type Song, type VoiceId } from '../core/song';
import type { NoteEvent } from '../core/schedule';
import { Scheduler } from './scheduler';

const TICK_MS = 25;
/** Normal lookahead, in seconds. */
const LOOKAHEAD = 0.15;
/** Browsers throttle timers in hidden tabs to about one a second, so look further ahead there. */
const LOOKAHEAD_HIDDEN = 1.1;

type AudioContextCtor = typeof AudioContext;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private output: AudioNode | null = null;
  private readonly buffers = new Map<VoiceId, AudioBuffer>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly scheduler: Scheduler;

  constructor(getSong: () => Song) {
    this.scheduler = new Scheduler({
      getSong,
      now: () => this.ctx?.currentTime ?? 0,
      play: (event, at) => this.playNote(event, at),
      lookaheadSeconds: () => (typeof document !== 'undefined' && document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD),
    });
  }

  get playing(): boolean {
    return this.scheduler.isRunning;
  }

  /** Playhead position in beats from the start of the loop. */
  positionBeats(): number {
    return this.scheduler.positionBeats();
  }

  /** Must be called from a user gesture the first time, or the browser keeps audio suspended. */
  async start(): Promise<void> {
    if (!this.ctx) this.createContext();
    await this.ctx!.resume();
    if (this.timer !== null) clearInterval(this.timer);
    this.scheduler.start();
    this.timer = setInterval(() => this.scheduler.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.scheduler.stop();
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.buffers.clear();
  }

  private createContext(): void {
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) throw new Error('This browser does not support Web Audio.');
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.8;
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(ctx.destination);
    for (const voice of VOICES) {
      const data = renderVoice(voice, ctx.sampleRate);
      const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(voice, buffer);
    }
    this.ctx = ctx;
    this.output = master;
  }

  private playNote(event: NoteEvent, at: number): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(event.voice);
    if (!ctx || !buffer || !this.output) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = event.gain;
    source.connect(gain);
    gain.connect(this.output);
    source.start(Math.max(at, ctx.currentTime));
  }
}
