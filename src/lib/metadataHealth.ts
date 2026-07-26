import type { Song } from '../types';
import { splitArtists, primaryArtist } from './artistParser';

// Feature (Metadata health check): a scan over the whole library that
// surfaces four common kinds of messy metadata -- missing album art,
// missing year, missing genre, and inconsistently-spelled artist names
// (e.g. "A.R. Rahman" vs "AR Rahman" vs "A R Rahman" showing up as separate
// artists in the Artists grid because they don't string-match exactly) --
// so they can be fixed in one batch pass instead of hunting song by song.

export interface ArtistVariant {
  /** The exact credited name as it appears in one or more songs' Artist tags. */
  name: string;
  /** How many songs carry this exact spelling (post split-credit). */
  count: number;
  songIds: string[];
}

export interface ArtistVariantGroup {
  /** The normalized form shared by every variant in the group (not shown to
   *  the user directly -- just the clustering key). */
  normalized: string;
  variants: ArtistVariant[];
}

export interface DuplicateGroup {
  /** The shared normalized title+artist key (not shown directly -- just the
   *  clustering key), used only for a stable React key. */
  key: string;
  songs: Song[];
}

export interface MetadataHealthReport {
  missingArt: Song[];
  missingYear: Song[];
  missingGenre: Song[];
  artistVariantGroups: ArtistVariantGroup[];
  duplicateGroups: DuplicateGroup[];
}

/** Normalizes a title/artist pair for duplicate-detection: lowercase,
 *  whitespace collapsed. Deliberately looser than exact string equality —
 *  a song re-imported from a slightly different rip commonly differs in
 *  trailing whitespace or casing ("Ninaivirukka " vs "ninaivirukka") while
 *  still being the same track. Artist here is the *primary* artist (see
 *  primaryArtist() in artistParser) rather than the full raw field, so two
 *  copies of the same song tagged with different featured-singer credits
 *  still cluster as duplicates instead of being missed. */
function dupKey(title: string, artist: string): string {
  return `${title.toLowerCase().trim().replace(/\s+/g, ' ')}::${artist.toLowerCase().trim().replace(/\s+/g, ' ')}`;
}

/** Normalizes an artist name for fuzzy-matching purposes: lowercase, periods
 *  and other punctuation stripped, whitespace collapsed. "A.R. Rahman",
 *  "AR Rahman", and "A R Rahman" all normalize to "ar rahman" and cluster
 *  together; genuinely different artists (different letters, not just
 *  different punctuation/spacing) don't. */
export function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Two songs within this many seconds of each other in duration are treated
 *  as the same recording for duplicate-detection purposes; small gaps come
 *  from re-encoding/re-ripping the same track, not a different version. */
const DURATION_TOLERANCE_SECONDS = 10;

/** Splits a list of same-title/artist songs into sub-groups by duration
 *  proximity, so a reprise/remix/live version sharing a title with the
 *  original doesn't get lumped in as a "duplicate" of it. Sorts by
 *  duration then greedily chains adjacent songs whose gap is within
 *  DURATION_TOLERANCE_SECONDS -- this keeps a run of near-identical rips
 *  together even if their durations drift slightly across the run, while
 *  still separating out anything that's meaningfully longer or shorter. */
function clusterByDuration(songs: Song[]): Song[][] {
  const sorted = [...songs].sort((a, b) => a.duration - b.duration);
  const clusters: Song[][] = [];
  for (const s of sorted) {
    const current = clusters[clusters.length - 1];
    const prev = current?.[current.length - 1];
    if (current && prev && Math.abs(s.duration - prev.duration) <= DURATION_TOLERANCE_SECONDS) {
      current.push(s);
    } else {
      clusters.push([s]);
    }
  }
  return clusters;
}

/** Runs the full health scan over the library. */
export function scanMetadataHealth(songs: Song[]): MetadataHealthReport {
  const missingArt: Song[] = [];
  const missingYear: Song[] = [];
  const missingGenre: Song[] = [];

  // name -> variant accumulator, keyed by exact spelling
  const byExactName = new Map<string, { count: number; songIds: string[] }>();
  // dupKey -> songs sharing that (normalized title, primary artist) pair
  const byDupKey = new Map<string, Song[]>();

  for (const s of songs) {
    if (!s.albumArtData) missingArt.push(s);
    if (s.year == null) missingYear.push(s);
    if (!s.genre?.trim()) missingGenre.push(s);

    if (s.title.trim()) {
      const key = dupKey(s.title, primaryArtist(s.artist));
      const list = byDupKey.get(key);
      if (list) list.push(s); else byDupKey.set(key, [s]);
    }

    for (const name of splitArtists(s.artist)) {
      if (name === 'Unknown Artist') continue; // not a real spelling to flag
      const existing = byExactName.get(name);
      if (existing) { existing.count++; existing.songIds.push(s.id); }
      else byExactName.set(name, { count: 1, songIds: [s.id] });
    }
  }

  // Feature (Duplicate songs): only clusters of 2+ actually count as a
  // duplicate -- most songs will be alone in their bucket. Sorted with the
  // largest clusters (most re-imported copies) first, so those get fixed
  // before scrolling past a long tail of 2-copy ones.
  //
  // A shared (title, primary artist) key alone isn't enough: reprise,
  // remix, and "unplugged" versions are frequently tagged with the exact
  // same Title/Artist as the original (only the filename hints otherwise),
  // but they're a genuinely different recording with a different runtime.
  // So within each title+artist bucket we additionally cluster by duration
  // -- songs whose lengths land within DURATION_TOLERANCE_SECONDS of each
  // other are treated as re-imported copies of the same recording; songs
  // that land outside that window (e.g. a 4:12 reprise vs. a 5:52 original)
  // are split into their own group instead of being flagged as duplicates.
  const duplicateGroups: DuplicateGroup[] = [];
  byDupKey.forEach((group, key) => {
    if (group.length < 2) {
      return;
    }
    const durationClusters = clusterByDuration(group);
    durationClusters.forEach((cluster, i) => {
      if (cluster.length < 2) return;
      duplicateGroups.push({ key: durationClusters.length > 1 ? `${key}::${i}` : key, songs: cluster });
    });
  });
  duplicateGroups.sort((a, b) => b.songs.length - a.songs.length);

  // Cluster exact spellings by their normalized form; only keep clusters
  // with 2+ distinct spellings -- a single spelling, however it's written,
  // isn't an inconsistency.
  const byNormalized = new Map<string, ArtistVariant[]>();
  byExactName.forEach((data, name) => {
    const norm = normalizeArtistName(name);
    if (!norm) return;
    const variant: ArtistVariant = { name, count: data.count, songIds: data.songIds };
    const list = byNormalized.get(norm);
    if (list) list.push(variant); else byNormalized.set(norm, [variant]);
  });

  const artistVariantGroups: ArtistVariantGroup[] = [];
  byNormalized.forEach((variants, normalized) => {
    if (variants.length < 2) return;
    variants.sort((a, b) => b.count - a.count); // most common spelling first (good merge default)
    artistVariantGroups.push({ normalized, variants });
  });
  artistVariantGroups.sort((a, b) => b.variants.reduce((n, v) => n + v.count, 0) - a.variants.reduce((n, v) => n + v.count, 0));

  return { missingArt, missingYear, missingGenre, artistVariantGroups, duplicateGroups };
}

/** Rewrites one credited-name segment of a (possibly slash-joined) raw
 *  Artist tag, leaving every other credited name in the field untouched --
 *  e.g. replaceArtistCredit("Sai Abhyankkar/ Sai Smriti", "Sai Smriti", "Sai
 *  Smrithi") -> "Sai Abhyankkar/ Sai Smrithi". Re-joins with "/ " regardless
 *  of the original spacing around slashes, which also quietly normalizes any
 *  inconsistent "/"-spacing in the field as a side effect. If `oldName`
 *  isn't actually one of the credited segments, the field is returned
 *  unchanged. */
export function replaceArtistCredit(rawArtist: string, oldName: string, newName: string): string {
  const parts = splitArtists(rawArtist);
  if (!parts.includes(oldName)) return rawArtist;
  return parts.map((p) => (p === oldName ? newName : p)).join('/ ');
}
