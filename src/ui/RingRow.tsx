import { useId } from 'react';
import { MAX_STEPS, MIN_STEPS } from '../core/euclid';
import { VOICES, VOICE_LABELS, type Ring, type VoiceId } from '../core/song';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, onChange }: SliderProps) {
  const id = useId();
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={Math.max(min, max)}
        step={1}
        value={value}
        disabled={max <= min}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output htmlFor={id}>{value}</output>
    </div>
  );
}

interface RowProps {
  ring: Ring;
  index: number;
  canRemove: boolean;
  onChange: (patch: Partial<Omit<Ring, 'id'>>) => void;
  onRemove: () => void;
}

export function RingRow({ ring, index, canRemove, onChange, onRemove }: RowProps) {
  const voiceId = useId();
  const n = index + 1;
  return (
    <section
      className={ring.muted ? 'ring-row is-muted' : 'ring-row'}
      style={{ '--accent': `var(--ring-${(index % 6) + 1})` } as React.CSSProperties}
      aria-label={`Ring ${n}`}
    >
      <div className="ring-head">
        <label htmlFor={voiceId} className="sr-only">{`Ring ${n} sound`}</label>
        <select id={voiceId} value={ring.voice} onChange={(e) => onChange({ voice: e.target.value as VoiceId })}>
          {VOICES.map((v) => (
            <option key={v} value={v}>{VOICE_LABELS[v]}</option>
          ))}
        </select>
        <button
          type="button"
          className="quiet"
          aria-pressed={ring.muted}
          onClick={() => onChange({ muted: !ring.muted })}
        >
          {ring.muted ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          className="quiet"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Remove ring ${n}`}
        >
          Remove
        </button>
      </div>
      <Slider label="Pulses" value={ring.pulses} min={0} max={ring.steps} onChange={(pulses) => onChange({ pulses })} />
      <Slider label="Steps" value={ring.steps} min={MIN_STEPS} max={MAX_STEPS} onChange={(steps) => onChange({ steps })} />
      <Slider label="Rotate" value={ring.rotation} min={0} max={ring.steps - 1} onChange={(rotation) => onChange({ rotation })} />
      <Slider label="Volume" value={ring.volume} min={0} max={100} onChange={(volume) => onChange({ volume })} />
    </section>
  );
}
