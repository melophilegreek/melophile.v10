import type { Song } from '../types';

// Feature (Split multi-artist credits): Tamil film metadata (and plenty of
// other regional/film metadata) commonly crams composer + every singer on a
// track into one Artist tag, slash-separated -- e.g.
// "Sai Abhyankkar/ Sai Smriti/ Sathyan Ilanko". Stored/displayed as-is
// everywhere else in the app (SongRow, search, Edit Tags, etc.) -- this
// module only powers *browsing/filtering by individual credited artist* (the
// Artists grid + artist detail view), per product decision to leave the raw
// field untouched rather than rewrite anyone's tags.

/** Splits a raw Artist tag into its individual credited names. Handles the
 *  common "/" separator (with or without surrounding whitespace). A field
 *  with no "/" just returns itself as a single-element array, so every
 *  caller can treat every song uniformly instead of special-casing
 *  single-artist songs. Empty/whitespace-only segments (e.g. a stray
 *  trailing "/") are dropped. */
export function splitArtists(raw: string | undefined | null): string[] {
  const trimmed = raw?.trim();
  if (!trimmed) return ['Unknown Artist'];
  const parts = trimmed.split('/').map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : ['Unknown Artist'];
}

/** True if `name` is one of the individually-credited artists on `song`
 *  (case-sensitive exact match against each split segment, matching the
 *  case-sensitive equality the rest of the app already uses for artist
 *  identity -- see BrowseGrid's groupByArtist / App's getViewSongs). */
export function songHasArtist(song: Song, name: string): boolean {
  return splitArtists(song.artist).includes(name);
}

/** The one artist an album should be considered "by", for grouping/matching
 *  album tiles -- e.g. "A.R. Rahman" out of "A.R. Rahman, Shakthisree
 *  Gopalan" or "A.R. Rahman/A.R. Ameen". Unlike splitArtists() (which powers
 *  the Artists grid and intentionally treats every credited name as
 *  equally "the" artist of the song), this only takes the *first* credited
 *  name and is for a different job: film-soundtrack albums are commonly
 *  tagged with the composer plus that particular track's featured
 *  singer(s), which varies from song to song across the same album, using
 *  either "/" or ", " depending on the tagger -- keying/matching an album
 *  by the *entire* raw Artist field falls apart there, since every track
 *  can end up with a different resulting string and the "same" album
 *  splits into one tile per track. The composer/primary credit is normally
 *  listed first and is what's actually consistent across the album, so
 *  that's what's used to decide "is this the same album". */
export function primaryArtist(raw: string | undefined | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) return 'Unknown Artist';
  const first = trimmed.split(/[/,]/)[0].trim();
  return first || 'Unknown Artist';
}
