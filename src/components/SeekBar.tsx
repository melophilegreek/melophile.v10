import { useCallback, useState } from 'react';
import type { Song } from '../types';

interface Props {
  song?: Song | null;
  progress: number; // 0-100
  duration: number;
  accentColor: string;
  onSeek: (t: number) => void;
  className?: string;
}

// Plain-line seek bar: a thin rounded track with a played-fill segment and
// a small round thumb, replacing the waveform bar visualization. Keeps the
// same click / drag / touch / keyboard interaction model as before.
export function SeekBar({ progress, duration, accentColor, onSeek, className }: Props) {
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState(false);

  const pct = drag ?? progress;

  const calcPct = useCallback((clientX: number, el: HTMLDivElement) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag(calcPct(e.clientX, e.currentTarget));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    setDrag(calcPct(e.clientX, e.currentTarget));
  };
  const commitDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const p = calcPct(e.clientX, e.currentTarget);
    onSeek((p / 100) * duration);
    setDrag(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!duration) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); onSeek(Math.min(duration, (progress / 100) * duration + duration * 0.02)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onSeek(Math.max(0, (progress / 100) * duration - duration * 0.02)); }
    else if (e.key === 'Home') { e.preventDefault(); onSeek(0); }
    else if (e.key === 'End') { e.preventDefault(); onSeek(duration); }
  };

  const showThumb = hover || drag !== null;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={(progress / 100) * (duration || 0)}
      className={`relative flex-1 h-8 flex items-center cursor-pointer select-none group ${className ?? ''}`}
      style={{ touchAction: 'none' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={commitDrag}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={onKeyDown}
    >
      {/* Track */}
      <div className="relative w-full h-1 rounded-full bg-white/15 overflow-visible">
        {/* Played fill */}
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: accentColor,
            transition: drag !== null ? 'none' : 'width 150ms ease',
          }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 rounded-full bg-white shadow"
          style={{
            left: `${pct}%`,
            width: showThumb ? 12 : 8,
            height: showThumb ? 12 : 8,
            transform: 'translate(-50%, -50%)',
            opacity: showThumb ? 1 : 0,
            transition: drag !== null ? 'none' : 'opacity 150ms ease, width 150ms ease, height 150ms ease, left 150ms ease',
          }}
        />
      </div>
    </div>
  );
}
