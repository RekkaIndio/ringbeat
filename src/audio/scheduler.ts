/**
 * Lookahead scheduler.
 *
 * Browser timers are too sloppy to trigger sounds directly, so the usual
 * technique is to wake up often, look a little way into the future, and hand
 * each upcoming note to the audio clock with an exact start time. This class
 * holds that logic with the clock and the "play a note" call injected, so it
 * can be tested without any audio hardware.
 */
import { eventsInRange, type NoteEvent } from '../core/schedule';
import { type Song } from '../core/song';

/** Work in sixteenth-note slices; 1/4 beat is exactly representable in binary. */
export const SLICE_BEATS = 0.25;

export interface SchedulerDeps {
  /** The current song. Read again on every slice, so edits take effect within the lookahead. */
  getSong: () => Song;
  /** Audio clock in seconds. */
  now: () => number;
  /** Start a note at an absolute audio-clock time. */
  play: (event: NoteEvent, atSeconds: number) => void;
  /** How far ahead to schedule, in seconds. May change between ticks. */
  lookaheadSeconds: () => number;
}

export class Scheduler {
  private running = false;
  private nextBeat = 0;
  private nextTime = 0;

  constructor(private readonly deps: SchedulerDeps) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Begin from beat 0, with the first downbeat `leadSeconds` from now. */
  start(leadSeconds = 0.06): void {
    this.running = true;
    this.nextBeat = 0;
    this.nextTime = this.deps.now() + leadSeconds;
    this.tick();
  }

  stop(): void {
    this.running = false;
  }

  /** Schedule everything that falls inside the lookahead window. Call this often. */
  tick(): void {
    if (!this.running) return;
    const horizon = this.deps.now() + this.deps.lookaheadSeconds();
    while (this.nextTime < horizon) {
      const song = this.deps.getSong();
      const secondsPerBeat = 60 / song.bpm;
      for (const event of eventsInRange(song, this.nextBeat, this.nextBeat + SLICE_BEATS)) {
        this.deps.play(event, this.nextTime + (event.time - this.nextBeat) * secondsPerBeat);
      }
      this.nextTime += SLICE_BEATS * secondsPerBeat;
      this.nextBeat += SLICE_BEATS;
    }
  }

  /**
   * Where the audible playhead is, in beats from the start of the loop.
   * Zero until the first downbeat has actually sounded.
   */
  positionBeats(): number {
    if (!this.running) return 0;
    const bpm = this.deps.getSong().bpm;
    return Math.max(0, this.nextBeat - ((this.nextTime - this.deps.now()) * bpm) / 60);
  }
}
