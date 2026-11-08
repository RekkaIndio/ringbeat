import { useEffect, useMemo, useRef, type Ref } from 'react';
import { ringPattern } from '../core/euclid';
import { VOICE_LABELS, type Song } from '../core/song';
import { PlayStopIcon } from './icons';
import {
  beatsToPhase, CENTER, hitPulse, pointOnRing, pulseRadius, ringRadii, ringSpacing, stepPhase, VIEW,
} from './geometry';

interface Props {
  song: Song;
  playing: boolean;
  /** Current playhead position in beats; read on every animation frame. */
  getBeats: () => number;
  onToggle: () => void;
  /** Lets the page notice when the Play button has scrolled out of view. */
  hubRef?: Ref<HTMLButtonElement>;
}

const RING_COUNT_CLASSES = 6;
const ringVar = (i: number) => `var(--ring-${(i % RING_COUNT_CLASSES) + 1})`;

export function describeSong(song: Song): string {
  return song.rings
    .map((r, i) => `Ring ${i + 1}, ${VOICE_LABELS[r.voice].toLowerCase()}: ${r.pulses} pulses in ${r.steps} steps${r.rotation ? `, rotated ${r.rotation}` : ''}${r.muted ? ', muted' : ''}`)
    .join('. ');
}

export function RingStage({ song, playing, getBeats, onToggle, hubRef }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const playheadRef = useRef<SVGGElement>(null);
  const radii = useMemo(() => ringRadii(song.rings.length), [song.rings.length]);
  const spacing = ringSpacing(song.rings.length);

  // Animate the playhead and the hit pops by writing straight to the DOM, so React
  // does not re-render sixty times a second.
  useEffect(() => {
    const svg = svgRef.current;
    const head = playheadRef.current;
    if (!svg || !head) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const discs = Array.from(svg.querySelectorAll<SVGCircleElement>('[data-pulse]')).map((el) => ({
      el,
      base: Number(el.dataset.baseR),
      phase: Number(el.dataset.phase),
      muted: el.dataset.muted === 'true',
    }));
    let frame = 0;
    const draw = () => {
      const phase = playing ? beatsToPhase(getBeats()) : 0;
      head.setAttribute('transform', `rotate(${phase * 360} ${CENTER} ${CENTER})`);
      head.style.opacity = playing ? '1' : '0.35';
      for (const d of discs) {
        const pop = playing && !d.muted ? hitPulse(phase, d.phase) : 0;
        if (reduceMotion) {
          d.el.style.opacity = d.muted ? '' : String(1 - 0.55 * (1 - pop) * (playing ? 1 : 0));
          d.el.setAttribute('r', String(d.base));
        } else {
          d.el.setAttribute('r', String(d.base * (1 + 0.75 * pop)));
        }
      }
      if (playing) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [playing, getBeats, song]);

  return (
    <div className="stage">
      <svg
        ref={svgRef}
        className="dial"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="img"
        aria-label={`Rhythm dial. ${describeSong(song)}`}
      >
        <circle className="plate" cx={CENTER} cy={CENTER} r={49.5} />
        {song.rings.map((ring, i) => {
          const radius = radii[i]!;
          const colour = ringVar(i);
          const pattern = ringPattern(ring.pulses, ring.steps, ring.rotation);
          const hits = pattern.flatMap((on, step) => (on ? [step] : []));
          const discR = pulseRadius(radius, ring.steps, spacing);
          const points = hits.map((s) => pointOnRing(radius, s / ring.steps));
          return (
            <g key={ring.id} className={ring.muted ? 'ring is-muted' : 'ring'} style={{ color: colour }}>
              <circle className="track" cx={CENTER} cy={CENTER} r={radius} />
              {hits.length > 1 && (
                <polygon className="shape" points={points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')} />
              )}
              {pattern.map((on, step) => {
                if (on) return null;
                const p = pointOnRing(radius, step / ring.steps);
                return <circle key={`rest-${step}`} className="rest" cx={p.x} cy={p.y} r={0.5} />;
              })}
              {hits.map((step) => {
                const p = pointOnRing(radius, step / ring.steps);
                return (
                  <circle
                    key={`hit-${step}`}
                    className="pulse"
                    cx={p.x}
                    cy={p.y}
                    r={discR}
                    data-pulse=""
                    data-base-r={discR}
                    data-phase={stepPhase(ring.steps, step, song.swing)}
                    data-muted={ring.muted}
                  />
                );
              })}
            </g>
          );
        })}
        <g ref={playheadRef} className="playhead" aria-hidden="true">
          <line x1={CENTER} y1={CENTER - 13} x2={CENTER} y2={CENTER - 49} />
        </g>
      </svg>
      <button
        ref={hubRef}
        type="button"
        className="hub"
        onClick={onToggle}
        aria-label={playing ? 'Stop' : 'Play'}
        aria-keyshortcuts="Space"
      >
        <PlayStopIcon playing={playing} />
      </button>
    </div>
  );
}
