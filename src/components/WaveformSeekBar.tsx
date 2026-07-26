import { useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from '../types';
import { getWaveformPeaks } from '../lib/waveform';

interface Props {
  song: Song | null;
  progress: number; // 0-100
  duration: number;
  accentColor: string;
  onSeek: (t: number) => void;
  /** How many bars to render -- callers pass fewer on narrower layouts. */
  bars?: number;
  className?: string;
}

// Feature (Waveform seek bar): renders the song's actual amplitude shape
// instead of a plain line, with the played portion tinted in the accent
// color. Falls back to a flat bar (still fully draggable/clickable) while
// peaks are loading or if decoding fails, so it never blocks seeking.
//
// Interaction mirrors the existing SeekBar: click anywhere jumps there,
// drag-then-release commits the seek on release (not continuously, so
// scrubbing doesn't spam playback with seeks), touch works the same as
// mouse. Also keyboard-operable like Slider.tsx (arrow keys nudge by 2%,
// Home/End jump to start/end) since this replaces the only seek control
// in the player bar.
export function WaveformSeekBar({ song, progress, duration, accentColor, onSeek, bars = 56, className }: Props) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    if (!song) { setLoading(false); return; }
    setLoading(true);
    getWaveformPeaks(song).then((p) => {
      if (cancelled) return;
      setPeaks(p);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [song?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = drag ?? progress;

  const calcPct = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag(calcPct(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    setDrag(calcPct(e.clientX));
  };
  const commitDrag = (e: React.PointerEvent) => {
    if (drag === null) return;
    const p = calcPct(e.clientX);
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

  // Resample the stored peak buckets down to however many bars this
  // instance wants to render (mobile vs desktop pass different counts).
  const displayPeaks: number[] = peaks
    ? Array.from({ length: bars }, (_, i) => peaks[Math.min(peaks.length - 1, Math.floor((i / bars) * peaks.length))])
    : new Array(bars).fill(0.32); // flat placeholder while loading / on decode failure

  const showThumb = hover || drag !== null;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={(progress / 100) * (duration || 0)}
      className={`relative flex-1 h-8 flex items-center gap-[2px] cursor-pointer select-none ${className ?? ''}`}
      style={{ touchAction: 'none' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={commitDrag}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={onKeyDown}
    >
      {displayPeaks.map((peak, i) => {
        const barPct = (i / bars) * 100;
        const played = barPct <= pct;
        const heightPct = Math.max(12, peak * 100);
        return (
          <div
            key={i}
            className="flex-1 min-w-0 rounded-full"
            style={{
              height: `${heightPct}%`,
              background: played ? accentColor : 'rgba(255,255,255,0.18)',
              opacity: loading ? 0.5 : 1,
              transition: drag !== null ? 'none' : 'background-color 120ms ease, opacity 300ms ease',
            }}
          />
        );
      })}
      {/* Thin playhead line, shown on hover/drag for a precise position cue
          the same way the old SeekBar's thumb worked. */}
      {showThumb && (
        <div
          className="absolute top-0 bottom-0 w-0.5 rounded-full bg-white/90 pointer-events-none"
          style={{ left: `${pct}%`, transition: drag !== null ? 'none' : 'left 150ms ease' }}
        />
      )}
    </div>
  );
}
