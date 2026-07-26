// Feature (Waveform seek bar): generates per-song amplitude peaks so the
// seek bar can render an actual waveform instead of a plain progress line.
//
// Peaks are derived by decoding the song's stored audio Blob with the Web
// Audio API's decodeAudioData, downmixing to mono, and reducing that down
// to a small fixed number of buckets (max absolute sample per bucket, then
// normalized 0..1). This is independent of the playback engine in
// player.ts (which uses two <audio> elements for crossfade/gapless), so it
// never touches the currently-playing audio graph.
//
// Decoding a full song is relatively cheap (tens-to-low-hundreds of ms for
// a typical track) but not free, so results are cached in memory per song
// id for the life of the tab. A small LRU-ish cap keeps memory bounded in
// long sessions with lots of skipping around.

import type { Song } from '../types';
import { getFile } from './db';

const BUCKET_COUNT = 200;
const MAX_CACHE_SONGS = 40;

const cache = new Map<string, number[]>();
const inFlight = new Map<string, Promise<number[] | null>>();

// A single AudioContext reused purely for offline decoding. Kept separate
// from the playback graph in player.ts. Created lazily (first use) since
// some browsers warn/throttle contexts created before any user gesture.
let decodeCtx: AudioContext | null = null;
function getDecodeCtx(): AudioContext {
  if (!decodeCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    decodeCtx = new Ctor();
  }
  return decodeCtx;
}

function touchCache(id: string, peaks: number[]) {
  cache.delete(id); // re-insert to mark as most-recently-used
  cache.set(id, peaks);
  if (cache.size > MAX_CACHE_SONGS) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function downsample(audioBuffer: AudioBuffer): number[] {
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const samplesPerBucket = Math.max(1, Math.floor(length / BUCKET_COUNT));
  const peaks: number[] = new Array(BUCKET_COUNT).fill(0);

  // Reuse one Float32Array per channel rather than calling
  // getChannelData repeatedly inside the loop.
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) channelData.push(audioBuffer.getChannelData(c));

  for (let bucket = 0; bucket < BUCKET_COUNT; bucket++) {
    const start = bucket * samplesPerBucket;
    const end = Math.min(length, start + samplesPerBucket);
    let max = 0;
    for (let i = start; i < end; i++) {
      let sample = 0;
      for (let c = 0; c < channels; c++) sample += Math.abs(channelData[c][i]);
      sample /= channels;
      if (sample > max) max = sample;
    }
    peaks[bucket] = max;
  }

  // Normalize so the loudest bucket reaches 1.0 -- otherwise quiet/
  // heavily-mastered tracks render as a nearly flat line.
  const globalMax = Math.max(...peaks, 0.0001);
  return peaks.map((p) => Math.min(1, p / globalMax));
}

/**
 * Returns amplitude peaks (0..1, length BUCKET_COUNT) for a song, decoding
 * and caching on first request. Returns null if the audio couldn't be
 * read or decoded (missing file, corrupt data, unsupported codec for
 * decodeAudioData) -- callers should fall back to a plain progress bar.
 */
export async function getWaveformPeaks(song: Song): Promise<number[] | null> {
  const cached = cache.get(song.id);
  if (cached) { touchCache(song.id, cached); return cached; }

  const pending = inFlight.get(song.id);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const blob = await getFile(song.fileKey);
      if (!blob) return null;
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await getDecodeCtx().decodeAudioData(arrayBuffer);
      const peaks = downsample(audioBuffer);
      touchCache(song.id, peaks);
      return peaks;
    } catch {
      return null;
    } finally {
      inFlight.delete(song.id);
    }
  })();

  inFlight.set(song.id, promise);
  return promise;
}
