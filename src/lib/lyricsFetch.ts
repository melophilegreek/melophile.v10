// Feature (Auto-fetch lyrics): looks up lyrics for a song from LRCLIB
// (https://lrclib.net), a free, no-API-key-required, community-run lyrics
// database that covers both synced (LRC) and plain lyrics -- a good fit
// here since it directly returns `[mm:ss.xx]`-style timestamps compatible
// with this app's existing LRC parser (see lrc.ts), no extra conversion
// needed.
//
// Two-step lookup, mirroring how LRCLIB's own clients query it:
//  1. `/api/get` -- an exact-match lookup keyed on track/artist/album/
//     duration. Fast and precise when the tags are clean, but any small
//     mismatch (a slightly different album title, duration off by a
//     second from re-encoding, etc.) makes it return nothing.
//  2. `/api/search` -- a fuzzy text search fallback used only if `/get`
//     comes back empty, which is common for a large tag-imperfect library
//     like this one. Picks the closest duration match among the results
//     so a same-titled cover/remix doesn't get matched by mistake.
import { primaryArtist } from './artistParser';
import type { Song } from '../types';

export interface FetchedLyrics {
  text: string;
  synced: boolean;
}

interface LrcLibTrack {
  trackName: string;
  artistName: string;
  duration: number;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental?: boolean;
}

const BASE = 'https://lrclib.net/api';

function toResult(track: LrcLibTrack): FetchedLyrics | null {
  if (track.instrumental) return { text: '[Instrumental]', synced: false };
  if (track.syncedLyrics) return { text: track.syncedLyrics, synced: true };
  if (track.plainLyrics) return { text: track.plainLyrics, synced: false };
  return null;
}

/** Strips the parenthetical/bracketed "(From "Movie")" suffix this library's
 *  Tamil film titles are often tagged with -- LRCLIB indexes the bare song
 *  title, so leaving the suffix in place tends to prevent exact matches. */
function bareTitle(title: string): string {
  return title.replace(/\s*[[(][^)\]]*[)\]]\s*$/g, '').trim() || title;
}

export async function fetchOnlineLyrics(song: Song, signal?: AbortSignal): Promise<FetchedLyrics | null> {
  const artist = primaryArtist(song.artist) || song.artist;
  const title = bareTitle(song.title);

  const getParams = new URLSearchParams({ track_name: title, artist_name: artist });
  if (song.album) getParams.set('album_name', song.album);
  if (song.duration) getParams.set('duration', String(Math.round(song.duration)));

  try {
    const getRes = await fetch(`${BASE}/get?${getParams}`, { signal });
    if (getRes.ok) {
      const track: LrcLibTrack = await getRes.json();
      const result = toResult(track);
      if (result) return result;
    }
  } catch {
    // Falls through to the search-based lookup below; a network hiccup on
    // the exact-match request shouldn't stop the fuzzy fallback from trying.
  }

  const searchParams = new URLSearchParams({ track_name: title, artist_name: artist });
  try {
    const searchRes = await fetch(`${BASE}/search?${searchParams}`, { signal });
    if (!searchRes.ok) return null;
    const candidates: LrcLibTrack[] = await searchRes.json();
    if (!candidates.length) return null;

    // Prefer the candidate whose duration is closest to this song's -- among
    // same-titled results (a cover, a remix, a re-release) this is the
    // strongest signal for picking the right one without more UI back-and-forth.
    const withLyrics = candidates.filter((c) => c.syncedLyrics || c.plainLyrics);
    if (!withLyrics.length) return null;
    const target = song.duration || 0;
    withLyrics.sort((a, b) => Math.abs(a.duration - target) - Math.abs(b.duration - target));
    return toResult(withLyrics[0]);
  } catch {
    return null;
  }
}
