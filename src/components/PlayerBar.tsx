import { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Shuffle, Music, Library, ListMusic,
  Mic2, Moon, Check, MoreVertical, Gauge, Repeat, Repeat1,
} from 'lucide-react';
import type { ShuffleMode, Song, RepeatMode } from '../types';
import { initialFor, placeholderBackground } from '../lib/artPlaceholder';
import { getContrastText } from '../lib/color';
import { SeekBar } from './SeekBar';

function formatTime(s: number): string {
  if (!s || !isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function gradientFor(title: string): string {
  const h = (title.charCodeAt(0) * 37 + (title.charCodeAt(1) || 0) * 17) % 360;
  return `linear-gradient(135deg, hsl(${h},45%,22%), hsl(${(h+50)%360},35%,12%))`;
}

// FIX 3 (LONG SONG NAMES): replaces the plain `truncate` <p> for the song
// title. Measures whether the text actually overflows its container; if it
// doesn't, it renders perfectly static (no ellipsis, no animation). If it
// does, it scrolls right-to-left just far enough to reveal the clipped end,
// holds there for ~2s, then snaps back to the start and repeats — instead
// of the old behavior of silently cutting the title off with `truncate`.
function MarqueeText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);
  const animId = useId().replace(/[:]/g, '');

  useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const span = textRef.current;
      if (!container || !span) return;
      const diff = span.scrollWidth - container.clientWidth;
      setOverflowPx(diff > 1 ? diff : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);

    // BUG FIX: index.css loads Inter with `display=swap`, so on first paint
    // the title renders in the fallback font, gets measured, and THEN Inter
    // swaps in (wider, 600-weight). That swap changes the span's scrollWidth
    // but never resizes the container, so the ResizeObserver above never
    // fires and `overflowPx` stays stuck at the stale fallback-font value —
    // this is what produced the permanently clipped, never-scrolling title.
    // Re-measure once real fonts are ready to catch that swap.
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    return () => ro.disconnect();
  }, [text]);

  const overflowing = overflowPx > 0;

  // Constant scroll speed (~35px/s) so long titles don't rush by, plus a
  // fixed ~2s pause at the start before the loop restarts. Percent
  // breakpoints below are derived from these durations for THIS instance.
  const scrollSec = overflowing ? Math.max(overflowPx / 35, 1.5) : 0;
  const pauseSec = 2;
  const snapSec = 0.05; // near-instant reset back to the start
  const totalSec = scrollSec + pauseSec + snapSec;
  const scrollEndPct = (scrollSec / totalSec) * 100;
  const pauseEndPct = ((scrollSec + pauseSec) / totalSec) * 100;

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className ?? ''}`}>
      {overflowing && (
        <style>{`
          @keyframes ${animId} {
            0% { transform: translateX(0); }
            ${scrollEndPct}% { transform: translateX(-${overflowPx}px); }
            ${pauseEndPct}% { transform: translateX(-${overflowPx}px); }
            100% { transform: translateX(0); }
          }
        `}</style>
      )}
      <span
        ref={textRef}
        className="inline-block"
        style={overflowing ? { animation: `${animId} ${totalSec}s linear infinite` } : undefined}
      >
        {text}
      </span>
    </div>
  );
}

interface Props {
  currentSong: Song | null;
  artUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffleMode: ShuffleMode;
  accentColor: string;
  queueCount: number;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
  onMute: () => void;
  onShuffleToggle: () => void;
  onShuffleModeChange: (mode: ShuffleMode) => void;
  onOpenQueue: () => void;
  /** Feature (Lyrics): whether the current song has any lyrics to show. */
  hasLyrics: boolean;
  onOpenLyrics: () => void;
  /** Feature (Sleep timer) */
  sleepTimerEndsAt: number | null;
  sleepTimerEndOfTrack: boolean;
  onSetSleepTimer: (minutes: number | 'end-of-track' | null) => void;
  /** Feature (Repeat button) */
  repeat: RepeatMode;
  onRepeatChange: (mode: RepeatMode) => void;
  /** Feature (Speed/pitch control) */
  playbackRate: number;
  preservePitch: boolean;
  onSetPlaybackRate: (r: number) => void;
  onSetPreservePitch: (p: boolean) => void;
}

// Feature (Sleep timer): small popover menu shared by desktop/mobile layouts,
// mirroring the existing shuffle-mode popover's look and outside-click/Escape
// handling.
//
// BUGFIX: this used to be `position: absolute` inside the button's own
// wrapper, opening upward with `bottom-10`. On the mobile layout that button
// sits in the *top* row of the player card, and the card itself has
// `overflow-hidden` (see the outer `rounded-xl overflow-hidden` wrapper in
// PlayerBar) — so the menu had nowhere to open into and got clipped almost
// entirely, leaving just a sliver of its rounded border visible. Fixed by
// portaling the menu to `document.body` and positioning it with `fixed`
// coordinates computed from the trigger button's bounding rect, flipping
// between opening below/above depending on which has room.
function SleepTimerMenu({ accentColor, endsAt, endOfTrack, onSet, align }: {
  accentColor: string; endsAt: number | null; endOfTrack: boolean;
  onSet: (minutes: number | 'end-of-track' | null) => void;
  align: 'center' | 'left';
}) {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState('');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = endsAt !== null || endOfTrack;
  const MENU_WIDTH = 192; // w-48
  const MENU_HEIGHT_ESTIMATE = 230; // enough for all 6 rows + padding

  useEffect(() => {
    if (!endsAt) { setRemaining(''); return; }
    const tick = () => {
      const ms = endsAt - Date.now();
      if (ms <= 0) { setRemaining(''); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Recompute position whenever the menu opens, and keep it correct across
  // resizes/scrolls while it's open (fixed coordinates don't auto-follow the
  // button otherwise).
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const left = align === 'center'
        ? rect.left + rect.width / 2 - MENU_WIDTH / 2
        : rect.right - MENU_WIDTH;
      const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openBelow = spaceBelow >= MENU_HEIGHT_ESTIMATE || spaceBelow >= spaceAbove;
      const top = openBelow ? rect.bottom + 8 : Math.max(8, rect.top - MENU_HEIGHT_ESTIMATE - 8);
      setMenuPos({ top, left: clampedLeft });
    };
    reposition();
    window.addEventListener('resize', reposition);
    // FIX (menu stuck open while the song list scrolls behind it): see the
    // matching fix in PlayerOptionsMenu below — this button doesn't move
    // when the list scrolls, so close the menu instead of repositioning it.
    const scrollClose = () => setOpen(false);
    window.addEventListener('scroll', scrollClose, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', scrollClose, true);
    };
  }, [open, align]);

  const options: { label: string; value: number | 'end-of-track' }[] = [
    { label: '5 minutes', value: 5 }, { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 }, { label: '60 minutes', value: 60 },
    { label: 'End of track', value: 'end-of-track' },
  ];

  return (
    <div className="relative">
      <button ref={btnRef} onClick={() => setOpen((v) => !v)} className="btn-icon w-8 h-8 hover:bg-white/10 rounded-lg relative" title="Sleep timer">
        <Moon size={16} style={{ color: active ? accentColor : 'rgba(255,255,255,0.45)' }} />
        {active && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: accentColor }} />}
      </button>
      {open && menuPos && createPortal(
        <div ref={menuRef}
          className="fixed w-48 rounded-xl overflow-hidden shadow-2xl border border-white/10 z-50 animate-fade-in"
          style={{ top: menuPos.top, left: menuPos.left, background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 30%), rgba(22,22,25,0.96)', backdropFilter: 'blur(16px)' }}>
          <div className="p-1">
            {remaining && (
              <div className="px-3 py-1.5 text-xs text-white/40">Stops in {remaining}</div>
            )}
            {options.map((opt) => (
              <button key={String(opt.value)} onClick={() => { onSet(opt.value); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/10"
                style={{ color: (opt.value === 'end-of-track' ? endOfTrack : false) ? accentColor : 'rgba(255,255,255,0.75)' }}>
                {opt.label}
                {opt.value === 'end-of-track' && endOfTrack && <Check size={13} />}
              </button>
            ))}
            {active && (
              <button onClick={() => { onSet(null); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors mt-1">
                Turn off
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Feature (Speed/pitch control): mirrors SleepTimerMenu's popover pattern
// (same positioning logic, outside-click/Escape handling) so it fits
// visually with the other player-bar popovers. Presets cover the common
// range (0.5x-2x); "Preserve pitch" toggles whether the pitch shifts along
// with speed (off) or stays natural regardless of speed (on, the default).
function PlaybackSpeedMenu({ accentColor, rate, preservePitch, onSetRate, onSetPreservePitch, align }: {
  accentColor: string; rate: number; preservePitch: boolean;
  onSetRate: (r: number) => void; onSetPreservePitch: (p: boolean) => void;
  align: 'center' | 'left';
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = rate !== 1;
  const MENU_WIDTH = 176; // w-44
  const MENU_HEIGHT_ESTIMATE = 300;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const left = align === 'center'
        ? rect.left + rect.width / 2 - MENU_WIDTH / 2
        : rect.right - MENU_WIDTH;
      const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openBelow = spaceBelow >= MENU_HEIGHT_ESTIMATE || spaceBelow >= spaceAbove;
      const top = openBelow ? rect.bottom + 8 : Math.max(8, rect.top - MENU_HEIGHT_ESTIMATE - 8);
      setMenuPos({ top, left: clampedLeft });
    };
    reposition();
    window.addEventListener('resize', reposition);
    // FIX (menu stuck open while the song list scrolls behind it): see the
    // matching fix in PlayerOptionsMenu below — this button doesn't move
    // when the list scrolls, so close the menu instead of repositioning it.
    const scrollClose = () => setOpen(false);
    window.addEventListener('scroll', scrollClose, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', scrollClose, true);
    };
  }, [open, align]);

  const presets = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <div className="relative">
      <button ref={btnRef} onClick={() => setOpen((v) => !v)} className="btn-icon h-8 min-w-8 px-1.5 hover:bg-white/10 rounded-lg relative flex items-center justify-center" title="Playback speed">
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: active ? accentColor : 'rgba(255,255,255,0.45)' }}>{rate}&times;</span>
        {active && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: accentColor }} />}
      </button>
      {open && menuPos && createPortal(
        <div ref={menuRef}
          className="fixed w-44 rounded-xl overflow-hidden shadow-2xl border border-white/10 z-50 animate-fade-in"
          style={{ top: menuPos.top, left: menuPos.left, background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 30%), rgba(22,22,25,0.96)', backdropFilter: 'blur(16px)' }}>
          <div className="p-1">
            <div className="px-3 py-1.5 text-xs text-white/40">Playback speed</div>
            {presets.map((p) => (
              <button key={p} onClick={() => onSetRate(p)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/10"
                style={{ color: p === rate ? accentColor : 'rgba(255,255,255,0.75)' }}>
                {p}&times;{p === 1 && <span className="text-white/30 text-xs">Normal</span>}
                {p === rate && <Check size={13} />}
              </button>
            ))}
            <div className="h-px bg-white/10 my-1" />
            <button onClick={() => onSetPreservePitch(!preservePitch)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-white/75 hover:bg-white/10 transition-colors">
              Preserve pitch
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold tabular-nums" style={{ color: preservePitch ? accentColor : 'rgba(255,255,255,0.35)' }}>
                  {preservePitch ? 'On' : 'Off'}
                </span>
                <span className="w-8 h-4.5 rounded-full relative transition-colors shrink-0 border" style={{ background: preservePitch ? accentColor : 'rgba(255,255,255,0.08)', borderColor: preservePitch ? accentColor : 'rgba(255,255,255,0.25)' }}>
                  <span className="absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all" style={{ left: preservePitch ? 16 : 2, background: preservePitch ? '#fff' : 'rgba(255,255,255,0.85)' }} />
                </span>
              </span>
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Feature (Combined options button): merges the lyrics, playback-speed, and
// sleep-timer controls into a single trigger button + one popover, instead
// of three separate icons crowding the top-right corner of the mobile
// expanded player. Reuses the same portal/positioning pattern as the other
// popovers here.
function PlayerOptionsMenu({
  accentColor, hasLyrics, hasSong, onOpenLyrics,
  rate, preservePitch, onSetRate, onSetPreservePitch,
  sleepEndsAt, sleepEndOfTrack, onSetSleepTimer,
  repeat, onRepeatChange,
  align,
}: {
  accentColor: string; hasLyrics: boolean; hasSong: boolean; onOpenLyrics: () => void;
  rate: number; preservePitch: boolean;
  onSetRate: (r: number) => void; onSetPreservePitch: (p: boolean) => void;
  sleepEndsAt: number | null; sleepEndOfTrack: boolean;
  onSetSleepTimer: (minutes: number | 'end-of-track' | null) => void;
  repeat: RepeatMode; onRepeatChange: (mode: RepeatMode) => void;
  align: 'center' | 'left';
}) {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState('');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const speedActive = rate !== 1;
  const sleepActive = sleepEndsAt !== null || sleepEndOfTrack;
  // Feature (Repeat button): folded into "any option active" so the 3-dot
  // trigger's accent-colored dot (see the button below) also lights up when
  // repeat is on, same as it already does for speed/sleep -- a quick visual
  // reminder that *something* in this menu is set to non-default without
  // having to open it.
  const repeatActive = repeat !== 'off';
  const anyActive = speedActive || sleepActive || repeatActive;
  const MENU_WIDTH = 224; // w-56
  const MENU_HEIGHT_ESTIMATE = 420;

  useEffect(() => {
    if (!sleepEndsAt) { setRemaining(''); return; }
    const tick = () => {
      const ms = sleepEndsAt - Date.now();
      if (ms <= 0) { setRemaining(''); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleepEndsAt]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const left = align === 'center'
        ? rect.left + rect.width / 2 - MENU_WIDTH / 2
        : rect.right - MENU_WIDTH;
      const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openBelow = spaceBelow >= MENU_HEIGHT_ESTIMATE || spaceBelow >= spaceAbove;
      const top = openBelow ? rect.bottom + 8 : Math.max(8, rect.top - MENU_HEIGHT_ESTIMATE - 8);
      setMenuPos({ top, left: clampedLeft });
    };
    reposition();
    window.addEventListener('resize', reposition);
    // FIX (menu stuck open while the song list scrolls behind it): this
    // button lives in the Player Bar, which doesn't move when the
    // (virtualized) song list underneath is scrolled, so re-measuring the
    // button's position on scroll was a no-op — the menu just sat there
    // indefinitely, floating over whatever had scrolled into view. Scroll
    // events don't bubble to a plain document listener, so listen in the
    // capture phase (which does see scroll events from any descendant
    // scrollable container) and close the menu as soon as scrolling starts,
    // matching the fix already used for the track row's 3-dot menu.
    const scrollClose = () => setOpen(false);
    window.addEventListener('scroll', scrollClose, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', scrollClose, true);
    };
  }, [open, align]);

  const speedPresets = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const sleepOptions: { label: string; value: number | 'end-of-track' }[] = [
    { label: '5 minutes', value: 5 }, { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 }, { label: '60 minutes', value: 60 },
    { label: 'End of track', value: 'end-of-track' },
  ];

  return (
    <div className="relative">
      <button ref={btnRef} onClick={() => setOpen((v) => !v)}
        className="btn-icon w-8 h-8 hover:bg-white/10 rounded-lg relative" title="More options">
        <MoreVertical size={16} style={{ color: anyActive ? accentColor : 'rgba(255,255,255,0.6)' }} />
        {anyActive && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: accentColor }} />}
      </button>
      {open && menuPos && createPortal(
        <div ref={menuRef}
          className="fixed w-56 rounded-xl overflow-hidden shadow-2xl border border-white/10 z-50 animate-fade-in max-h-[80vh] overflow-y-auto"
          style={{ top: menuPos.top, left: menuPos.left, background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 30%), rgba(22,22,25,0.96)', backdropFilter: 'blur(16px)' }}>
          <div className="p-1">
            {/* Lyrics */}
            <button onClick={() => { onOpenLyrics(); setOpen(false); }} disabled={!hasSong}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/75 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
              <Mic2 size={14} />
              {hasLyrics ? 'Lyrics' : 'Import lyrics'}
            </button>

            <div className="h-px bg-white/10 my-1" />

            {/* Feature (Repeat button): the repeat engine (off/all/one,
                including the actual next/prev-track cycling logic) already
                existed in player.ts -- it just had no button anywhere to
                turn it on. Segmented 3-way control here mirrors the
                Playback speed row's style/pattern below for a consistent
                look, and is more discoverable in a text-labeled menu list
                than a single icon that silently cycles through states would
                be. */}
            <div className="px-3 pt-1.5 pb-1 flex items-center gap-1.5 text-xs text-white/40">
              <Repeat size={12} /> Repeat
            </div>
            <div className="grid grid-cols-3 gap-1 px-2 pb-1.5">
              <button onClick={() => onRepeatChange('off')}
                className="py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: repeat === 'off' ? accentColor : 'rgba(255,255,255,0.06)',
                  color: repeat === 'off' ? getContrastText(accentColor) : 'rgba(255,255,255,0.7)',
                }}>
                Off
              </button>
              <button onClick={() => onRepeatChange('all')}
                className="py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                style={{
                  background: repeat === 'all' ? accentColor : 'rgba(255,255,255,0.06)',
                  color: repeat === 'all' ? getContrastText(accentColor) : 'rgba(255,255,255,0.7)',
                }}>
                <Repeat size={12} /> All
              </button>
              <button onClick={() => onRepeatChange('one')}
                className="py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                style={{
                  background: repeat === 'one' ? accentColor : 'rgba(255,255,255,0.06)',
                  color: repeat === 'one' ? getContrastText(accentColor) : 'rgba(255,255,255,0.7)',
                }}>
                <Repeat1 size={12} /> One
              </button>
            </div>

            <div className="h-px bg-white/10 my-1" />

            {/* Playback speed */}
            <div className="px-3 pt-1.5 pb-1 flex items-center gap-1.5 text-xs text-white/40">
              <Gauge size={12} /> Playback speed
            </div>
            <div className="grid grid-cols-4 gap-1 px-2 pb-1.5">
              {speedPresets.map((p) => (
                <button key={p} onClick={() => onSetRate(p)}
                  className="py-1.5 rounded-lg text-xs font-semibold tabular-nums transition-colors"
                  style={{
                    background: p === rate ? accentColor : 'rgba(255,255,255,0.06)',
                    color: p === rate ? getContrastText(accentColor) : 'rgba(255,255,255,0.7)',
                  }}>
                  {p}&times;
                </button>
              ))}
            </div>
            <button onClick={() => onSetPreservePitch(!preservePitch)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-white/75 hover:bg-white/10 transition-colors">
              Preserve pitch
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold tabular-nums" style={{ color: preservePitch ? accentColor : 'rgba(255,255,255,0.35)' }}>
                  {preservePitch ? 'On' : 'Off'}
                </span>
                <span className="w-8 h-4.5 rounded-full relative transition-colors shrink-0 border" style={{ background: preservePitch ? accentColor : 'rgba(255,255,255,0.08)', borderColor: preservePitch ? accentColor : 'rgba(255,255,255,0.25)' }}>
                  <span className="absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all" style={{ left: preservePitch ? 16 : 2, background: preservePitch ? '#fff' : 'rgba(255,255,255,0.85)' }} />
                </span>
              </span>
            </button>

            <div className="h-px bg-white/10 my-1" />

            {/* Sleep timer */}
            <div className="px-3 pt-1.5 pb-1 flex items-center justify-between text-xs text-white/40">
              <span className="flex items-center gap-1.5"><Moon size={12} /> Sleep timer</span>
              {remaining && <span>{remaining}</span>}
            </div>
            {sleepOptions.map((opt) => (
              <button key={String(opt.value)} onClick={() => { onSetSleepTimer(opt.value); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/10"
                style={{ color: (opt.value === 'end-of-track' ? sleepEndOfTrack : false) ? accentColor : 'rgba(255,255,255,0.75)' }}>
                {opt.label}
                {opt.value === 'end-of-track' && sleepEndOfTrack && <Check size={13} />}
              </button>
            ))}
            {sleepActive && (
              <button onClick={() => { onSetSleepTimer(null); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors mt-1">
                Turn off sleep timer
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function PlayerBar({
  currentSong, artUrl, isPlaying, isLoading,
  currentTime, duration, volume, muted, shuffleMode, accentColor, queueCount,
  onPrev, onNext, onTogglePlay, onSeek, onVolume, onMute,
  onShuffleToggle, onShuffleModeChange, onOpenQueue,
  hasLyrics, onOpenLyrics, sleepTimerEndsAt, sleepTimerEndOfTrack, onSetSleepTimer,
  repeat, onRepeatChange,
  playbackRate, preservePitch, onSetPlaybackRate, onSetPreservePitch,
}: Props) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bg = currentSong ? gradientFor(currentSong.title) : 'linear-gradient(135deg,#1c1c21,#08080a)';
  const [showShuffleMenu, setShowShuffleMenu] = useState(false);
  const shuffleRef = useRef<HTMLDivElement>(null);
  // Play/pause icons and the queue-count badge sit on an accentColor
  // background -- pick black or white per the *current* accent instead of
  // assuming black works (it doesn't for darker accents like blue/purple).
  const onAccent = getContrastText(accentColor);

  // BUG FIX (broken album art): `artUrl` being non-null only means we *tried*
  // to build an object URL for the art — it doesn't guarantee the browser can
  // actually decode it (corrupt/truncated art bytes, an unsupported image
  // format, etc). Previously there was no <img onError>, so a bad artUrl just
  // rendered the browser's broken-image icon with nothing in the console to
  // explain why. Track failures per artUrl and fall back to the placeholder
  // note icon everywhere this art is shown (background blur + both
  // thumbnails), and log a descriptive warning so it's diagnosable.
  const [artFailed, setArtFailed] = useState(false);
  useEffect(() => { setArtFailed(false); }, [artUrl]);
  const showArt = !!artUrl && !artFailed;
  const handleArtError = () => {
    if (artFailed) return;
    console.warn(
      `[PlayerBar] Album art failed to load for "${currentSong?.title ?? 'unknown track'}"` +
      (currentSong?.artist ? ` by ${currentSong.artist}` : '') +
      ` (mime: ${currentSong?.albumArtMime ?? 'unknown'}). Falling back to placeholder icon.`,
      { songId: currentSong?.id, fileName: currentSong?.fileName, artUrl },
    );
    setArtFailed(true);
  };

  useEffect(() => {
    if (!showShuffleMenu) return;
    const handler = (e: MouseEvent) => {
      if (shuffleRef.current && !shuffleRef.current.contains(e.target as Node)) setShowShuffleMenu(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [showShuffleMenu]);

  const shuffleActive = shuffleMode !== 'off';

  return (
    <div className="relative h-full overflow-hidden rounded-2xl shadow-panel"
      style={{ boxShadow: `0 1px 0 rgba(255,255,255,0.07) inset, 0 20px 44px -18px rgba(0,0,0,0.75), 0 0 0 1px ${accentColor}1f` }}>
      {/* Blurred background */}
      <div className="absolute inset-0 transition-all duration-700" style={{ background: bg }}>
        {showArt && (
          <img src={artUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 scale-110 transition-all duration-700"
            style={{ filter: 'blur(24px)' }} onError={handleArtError} />
        )}
      </div>
      <div className="absolute inset-0 bg-black/55" />

      {/* ── MOBILE LAYOUT (<768px) ── */}
      {/* Taller 3-row "expanded" layout: art+title row, transport-controls
          row, and a full seek row with time labels — matches the target
          design. Requires the taller parent height set in App.tsx
          (h-[180px] md:h-[68px]) instead of the old fixed 68px on both
          breakpoints. */}
      <div className="md:hidden relative h-full flex flex-col justify-center gap-4 px-4 py-4">
        {/* NOTE: the transport row and seek row below share a tighter gap-2
            (see that row's `mt-2`, which overrides the gap-4 spacing from
            this parent) so the play button doesn't float far above the
            progress bar. */}
        {/* ALIGNMENT FIX: art + title/artist are left-aligned (not centered)
            — flex row starting at the container's left edge. */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-white/10 shadow-lift"
            style={{ background: currentSong ? placeholderBackground(accentColor) : '#1c1c21' }}>
            {showArt ? <img src={artUrl} alt="" className="w-full h-full object-cover" onError={handleArtError} />
              : currentSong ? <span className="text-sm font-semibold" style={{ color: accentColor }}>{initialFor(currentSong)}</span>
              : <Music size={18} className="text-white/20" />}
          </div>
          <div className="min-w-0 flex-1">
            {currentSong ? (
              <>
                {/* LONG SONG NAMES FIX: MarqueeText only animates when the
                    title actually overflows its box; otherwise it stays
                    static, no ellipsis, no clipping. */}
                <MarqueeText text={currentSong.title} className="text-white text-base font-semibold leading-tight" />
                <p className="text-white/50 text-sm truncate mt-0.5 leading-tight">{currentSong.artist}</p>
              </>
            ) : <p className="text-white/25 text-sm">Nothing playing</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Feature (Combined options button): lyrics + playback speed +
                sleep timer now live behind one "more options" button instead
                of three separate icons, matching the simplified top-right
                corner of the mobile expanded player. */}
            <PlayerOptionsMenu
              accentColor={accentColor} hasLyrics={hasLyrics} hasSong={!!currentSong} onOpenLyrics={onOpenLyrics}
              rate={playbackRate} preservePitch={preservePitch} onSetRate={onSetPlaybackRate} onSetPreservePitch={onSetPreservePitch}
              sleepEndsAt={sleepTimerEndsAt} sleepEndOfTrack={sleepTimerEndOfTrack} onSetSleepTimer={onSetSleepTimer}
              repeat={repeat} onRepeatChange={onRepeatChange}
              align="left"
            />
          </div>
        </div>

        {/* Transport controls — shuffle and queue are pinned to the row's
            outer edges, with prev/play/next centered as their own group
            in the middle, spread across the full width of the bar. */}
        <div className="flex items-center justify-between">
          <div ref={shuffleRef} className="relative">
            <button onClick={onShuffleToggle} onContextMenu={(e) => { e.preventDefault(); setShowShuffleMenu(true); }}
              className="w-9 h-9 flex items-center justify-center" title="Shuffle">
              <Shuffle size={19} style={{ color: shuffleActive ? accentColor : 'rgba(255,255,255,0.45)' }} />
            </button>
            {shuffleActive && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: accentColor }} />}
            {showShuffleMenu && (
              <div className="absolute bottom-10 left-0 w-44 rounded-xl overflow-hidden shadow-2xl border border-white/10 z-50 animate-fade-in"
                style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 30%), rgba(22,22,25,0.96)', backdropFilter: 'blur(16px)' }}>
                <div className="p-1">
                  {(['off', 'view', 'library'] as ShuffleMode[]).map((mode) => (
                    <button key={mode} onClick={() => { onShuffleModeChange(mode); setShowShuffleMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{ background: shuffleMode === mode ? 'rgba(255,255,255,0.1)' : 'transparent', color: shuffleMode === mode ? accentColor : 'rgba(255,255,255,0.75)' }}>
                      {mode === 'off' && <><Shuffle size={13} />Off</>}
                      {mode === 'view' && <><Shuffle size={13} />Shuffle view</>}
                      {mode === 'library' && <><Library size={13} />Shuffle library</>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button onClick={onPrev} className="w-9 h-9 flex items-center justify-center text-white/70 active:scale-90 transition-transform" title="Previous">
              <SkipBack size={22} fill="currentColor" />
            </button>
            <button onClick={onTogglePlay}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-[1.03]"
              style={{ background: accentColor, boxShadow: `0 4px 16px -2px ${accentColor}66, 0 0 0 1px rgba(255,255,255,0.08) inset` }} title="Play/Pause">
              {isLoading ? (
                <div className="w-4 h-4 border-2 rounded-full animate-spin"
                  style={{ borderColor: `${onAccent}33`, borderTopColor: onAccent }} />
              ) : isPlaying ? (
                <Pause size={20} fill={onAccent} style={{ color: onAccent }} />
              ) : (
                <Play size={20} fill={onAccent} className="ml-0.5" style={{ color: onAccent }} />
              )}
            </button>
            <button onClick={onNext} className="w-9 h-9 flex items-center justify-center text-white/70 active:scale-90 transition-transform" title="Next">
              <SkipForward size={22} fill="currentColor" />
            </button>
          </div>

          <button onClick={onOpenQueue} className="w-9 h-9 flex items-center justify-center relative" title="Queue">
            <ListMusic size={19} style={{ color: queueCount > 0 ? accentColor : 'rgba(255,255,255,0.45)' }} />
            {queueCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full"
                style={{ background: accentColor, color: onAccent }}>{queueCount > 9 ? '9+' : queueCount}</span>
            )}
          </button>
        </div>

        {/* Full seek row with time labels on both ends. `-mt-3` cuts the
            parent's gap-4 (16px) down to ~4px here specifically, so the
            progress bar sits close under the play button instead of
            floating with the same 16px gap used elsewhere in the card. */}
        <div className="flex items-center gap-2 -mt-3">
          <span className="text-xs text-white/40 tabular-nums w-9">{formatTime(currentTime)}</span>
          <SeekBar progress={progress} duration={duration} accentColor={accentColor} onSeek={onSeek} />
          <span className="text-xs text-white/40 tabular-nums w-9 text-right">{formatTime(duration)}</span>
        </div>
      </div>

      {/* ── DESKTOP LAYOUT (≥768px) ── */}
      {/* FIX (pause/play button off-center): this row had no
          justify-content, so its default packing (flex-start) let the
          three sections — left art/title (28%), center transport controls
          (flex-1, capped at max-w-520px), right utility icons (28%) — bunch
          together on the left whenever the window was wide enough that the
          center block hit its 520px cap. Any space left over past that
          point was stranded after the right icons instead of pushing them
          to the edge, which visually dragged the whole middle+right
          section (and therefore the play/pause button) left of true
          center. Since the left and right blocks are equal width (28%
          each), `justify-between` splits that leftover space evenly into
          the two gaps around the center block — which lands the transport
          controls exactly at the horizontal midpoint of the bar and pins
          the right-side icons flush to the right edge, matching how
          desktop music players are normally laid out. */}
      <div className="hidden md:flex relative h-full items-center justify-between px-4 gap-3">
        {/* FIX 1 (SIZE) + FIX 2 (ALIGNMENT): fixed 48x48 art, row stays
            items-center (vertically centered), title/artist bumped up to
            14px/12px (from 13px/11px) now that the row has the height to
            support it without feeling cramped. */}
        <div className="flex items-center gap-3 w-[28%] min-w-0 shrink-0">
          <div className="w-12 h-12 rounded-lg shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-white/10 shadow-lift"
            style={{ background: currentSong ? placeholderBackground(accentColor) : '#1c1c21' }}>
            {showArt ? <img src={artUrl} alt="" className="w-full h-full object-cover" onError={handleArtError} />
              : currentSong ? <span className="text-sm font-semibold" style={{ color: accentColor }}>{initialFor(currentSong)}</span>
              : <Music size={18} className="text-white/20" />}
          </div>
          <div className="min-w-0">
            {currentSong ? (
              <>
                {/* FIX 3 (LONG SONG NAMES): MarqueeText replaces the plain
                    truncating <p> — only animates when the title overflows. */}
                <MarqueeText text={currentSong.title} className="text-white text-sm font-semibold leading-tight" />
                <p className="text-white/45 text-xs truncate mt-0.5 leading-tight">{currentSong.artist}</p>
              </>
            ) : <p className="text-white/25 text-sm">Nothing playing</p>}
          </div>
        </div>

        {/* Center controls */}
        <div className="flex flex-col items-center justify-center gap-1 flex-1 max-w-[520px]">
          <div className="flex items-center justify-center gap-2">
            <div ref={shuffleRef} className="relative">
              <button onClick={onShuffleToggle} onContextMenu={(e) => { e.preventDefault(); setShowShuffleMenu(true); }}
                className="btn-icon w-7 h-7 hover:bg-white/10 rounded-lg" title="Shuffle">
                <Shuffle size={15} style={{ color: shuffleActive ? accentColor : 'rgba(255,255,255,0.45)' }} />
              </button>
              {shuffleActive && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: accentColor }} />}
              {showShuffleMenu && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-44 rounded-xl overflow-hidden shadow-2xl border border-white/10 z-50 animate-fade-in"
                  style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 30%), rgba(22,22,25,0.96)', backdropFilter: 'blur(16px)' }}>
                  <div className="p-1">
                    {(['off', 'view', 'library'] as ShuffleMode[]).map((mode) => (
                      <button key={mode} onClick={() => { onShuffleModeChange(mode); setShowShuffleMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                        style={{ background: shuffleMode === mode ? 'rgba(255,255,255,0.1)' : 'transparent', color: shuffleMode === mode ? accentColor : 'rgba(255,255,255,0.75)' }}>
                        {mode === 'off' && <><Shuffle size={13} />Off</>}
                        {mode === 'view' && <><Shuffle size={13} />Shuffle view</>}
                        {mode === 'library' && <><Library size={13} />Shuffle library</>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button onClick={onPrev} className="btn-icon w-8 h-8 text-white/65 hover:text-white" title="Previous">
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button onClick={onTogglePlay}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ background: accentColor, boxShadow: `0 3px 12px -2px ${accentColor}66, 0 0 0 1px rgba(255,255,255,0.08) inset` }} title="Play/Pause">
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                  style={{ borderColor: `${onAccent}33`, borderTopColor: onAccent }} />
              ) : isPlaying ? (
                <Pause size={18} fill={onAccent} style={{ color: onAccent }} />
              ) : (
                <Play size={18} fill={onAccent} className="ml-0.5" style={{ color: onAccent }} />
              )}
            </button>
            <button onClick={onNext} className="btn-icon w-8 h-8 text-white/65 hover:text-white" title="Next">
              <SkipForward size={18} fill="currentColor" />
            </button>
          </div>

          <div className="flex items-center gap-2 w-full max-w-md">
            <span className="text-[10px] text-white/35 tabular-nums w-8 text-right">{formatTime(currentTime)}</span>
            <SeekBar progress={progress} duration={duration} accentColor={accentColor} onSeek={onSeek} />
            <span className="text-[10px] text-white/35 tabular-nums w-8">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: lyrics + sleep timer + queue + volume */}
        <div className="flex items-center gap-2 w-[28%] justify-end shrink-0">
          {/* Feature (Lyrics import): same rationale as the mobile button
              above — enabled whenever a song is loaded so missing lyrics can
              be imported, not just viewed once present. */}
          <button onClick={onOpenLyrics} disabled={!currentSong}
            className="btn-icon w-8 h-8 hover:bg-white/10 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent" title={hasLyrics ? 'Lyrics' : 'Import lyrics'}>
            <Mic2 size={16} className="text-white/60" />
          </button>
          <PlaybackSpeedMenu accentColor={accentColor} rate={playbackRate} preservePitch={preservePitch} onSetRate={onSetPlaybackRate} onSetPreservePitch={onSetPreservePitch} align="center" />
          <SleepTimerMenu accentColor={accentColor} endsAt={sleepTimerEndsAt} endOfTrack={sleepTimerEndOfTrack} onSet={onSetSleepTimer} align="center" />
          <button onClick={onOpenQueue} className="btn-icon w-8 h-8 hover:bg-white/10 rounded-lg relative" title="Queue">
            <ListMusic size={17} style={{ color: queueCount > 0 ? accentColor : 'rgba(255,255,255,0.45)' }} />
            {queueCount > 0 && (
              <span className="absolute -top-1 -right-1 text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full"
                style={{ background: accentColor, color: onAccent }}>{queueCount > 9 ? '9+' : queueCount}</span>
            )}
          </button>
          <button onClick={onMute} className="btn-icon w-8 h-8 text-white/45 hover:text-white">
            {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <div className="relative w-24 h-1.5 rounded-full bg-white/15 cursor-pointer"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onVolume(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); }}>
            <div className="absolute h-full rounded-full transition-all" style={{ width: `${(muted ? 0 : volume) * 100}%`, background: accentColor }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Replaced by <WaveformSeekBar> (see ./WaveformSeekBar.tsx), which renders
// the song's actual amplitude shape and handles the same click/drag/touch
// interactions this used to.
