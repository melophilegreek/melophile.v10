export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  kbps: number | null;
  albumArtData?: ArrayBuffer;
  albumArtMime?: string;
  fileKey: string;
  addedAt: number;
  fileName: string;
  fileSize: number;
  playCount: number;
  lastPlayedAt: number;
  /** Feature (Lyrics): raw lyrics text, either a plain block or LRC-timed
   *  (`[mm:ss.xx]line`) format — see `lyricsFormat` to tell which. Sourced
   *  from an embedded ID3 USLT frame / Vorbis LYRICS comment, or a sibling
   *  `.lrc` file found next to the audio file at import time. */
  lyrics?: string;
  lyricsFormat?: 'lrc' | 'plain';
  /** Feature (Folder re-scan/auto-sync): the folder (relative to whatever
   *  root was selected) this file was imported from, e.g. "Artist/Album".
   *  Undefined for songs imported before this field existed. Used to safely
   *  scope "this song is missing now" detection on a rescan to only the
   *  folders actually covered by the reselected batch — never assumed for
   *  songs whose folder isn't part of what was just rescanned. */
  importFolder?: string;
  /** genre/trackNumber/year: extracted at import time from TCON/TYER/TDRC/
   *  TRCK (MP3), Vorbis comments (FLAC/OGG/Opus), or '\xa9gen'/'gnre'/
   *  '\xa9day'/'trkn' (M4A) when present in the file -- also editable
   *  after the fact via the "Edit tags" track-menu action, which always
   *  takes precedence over whatever was extracted. */
  genre?: string;
  trackNumber?: number;
  year?: number;
}

export interface Playlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
  /** Feature (Smart playlists): when present, this playlist's membership
   *  is computed on the fly from `rules` against the live library instead
   *  of being read from `songIds` (which stays [] and unused for smart
   *  playlists). Re-evaluated each time the playlist is opened, not kept
   *  live/auto-updating in the background. */
  smart?: SmartPlaylistConfig;
}

export type SmartRuleField = 'genre' | 'artist' | 'album' | 'liked' | 'duration' | 'playCount' | 'addedWithinDays';

export type SmartRuleOperator = 'is' | 'is_not' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte';

export interface SmartRule {
  id: string;
  field: SmartRuleField;
  operator: SmartRuleOperator;
  /** genre/artist/album: free text. liked: 'true' | 'false'.
   *  duration: minutes (converted to/from seconds at eval time).
   *  playCount: a count. addedWithinDays: a day count (operator ignored --
   *  always means "added in the last N days"). */
  value: string;
}

export interface SmartPlaylistConfig {
  match: 'all' | 'any';
  rules: SmartRule[];
  sortBy: 'addedAt' | 'playCount' | 'title' | 'artist' | 'random';
  sortDir: 'asc' | 'desc';
  limit: number | null;
}

export interface Preferences {
  accentColor: string;
  /** Feature (Gapless/Crossfade): seconds of overlap between the end of one
   *  track and the start of the next. 0 = off (gapless-only: the next track
   *  is still prefetched ahead of time so there's no IndexedDB-read gap, it
   *  just doesn't overlap in playback). */
  crossfadeSeconds?: number;
  /** Feature (5-band EQ): gain in dB per band, roughly -20..+20. See
   *  lib/eqPresets.ts for the band layout and EQState type. */
  eq?: import('./lib/eqPresets').EQState;
  /** Feature (Sort options): persisted so re-opening the app keeps your
   *  chosen library ordering. */
  sortBy?: SortKey;
  sortDir?: 'asc' | 'desc';
  /** Feature (Speed/pitch control): 0.5-2.0, 1.0 = normal speed. */
  playbackRate?: number;
  /** Feature (Speed/pitch control): whether pitch stays natural as speed
   *  changes (true, the common case) or shifts with speed like a
   *  slowed-down/sped-up tape (false). */
  preservePitch?: boolean;
  /** Feature (Dynamic theming): when true, the accent color automatically
   *  follows the dominant color of whatever's currently playing album art
   *  instead of staying fixed at whatever was manually picked in Settings. */
  autoTheme?: boolean;
  /** Feature (OS notifications): whether background events (an auto-rescan
   *  finding new songs) should also raise a real OS notification, not just
   *  the in-app toast. Off by default -- opting in is what actually
   *  triggers the permission prompt (see SettingsPanel). */
  osNotifications?: boolean;
  /** Feature (Row size): controls how tall each song row is (and its
   *  thumbnail/text scale) across Library, playlists, artist/album views,
   *  search, etc. 'comfortable' matches the original fixed size. */
  rowSize?: RowSize;
}

export type RowSize = 'compact' | 'comfortable' | 'large';

export type SortKey = 'title' | 'artist' | 'dateAdded' | 'duration' | 'random';

export interface HistoryEntry {
  id: string;        // `${songId}-${timestamp}`
  songId: string;
  playedAt: number;
}

export type RepeatMode = 'off' | 'all' | 'one';
export type ShuffleMode = 'off' | 'view' | 'library';
// Feature (Browse by Artist/Album): 'artists'/'albums' are the top-level grid
// views (Sidebar nav items); { type: 'artist' }/{ type: 'album' } are the
// drill-down song-list views reached by tapping a card in those grids.
export type AppView = 'library' | 'liked' | 'most-played' | 'stats' | 'queue' | 'artists' | 'albums'
  | { type: 'playlist'; id: string }
  | { type: 'artist'; name: string }
  | { type: 'album'; album: string; artist: string };

// Format support: added Opus (Ogg container, same as .ogg) and AIFF/AIF.
// WMA and APE are deliberately NOT included -- no mainstream browser ships a
// decoder for either, so <audio>/Web Audio simply can't play them back. Real
// support would mean bundling a full transcoder (e.g. ffmpeg.wasm, ~25-30MB)
// just to unlock two formats, which is a much bigger call than a format-list
// change -- flagging this rather than quietly shipping files that import
// but won't play.
export const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav', '.ogg', '.opus', '.aac', '.m4a', '.aiff', '.aif'];
// Sapphire blue, matching the app icon -- previously Spotify green
// ('#1DB954'), which is kept as a selectable preset in Settings but is no
// longer the default. Deliberately reuses the exact value of the existing
// "Sapphire" premium preset (see SettingsPanel.tsx's PREMIUM_PRESETS)
// rather than a new hex, so the default is a color that's already
// selectable/tested elsewhere in the app.
export const DEFAULT_ACCENT = '#2C5FCC';
// Feature (Row size): row height (and, in SongRow, thumbnail/text scale)
// now varies by the user's chosen density instead of a single fixed value.
// ROW_HEIGHT is kept as the 'comfortable' value for any caller that still
// wants the original default (e.g. VirtualList's fallback when no
// getItemHeight is passed).
export const ROW_HEIGHTS: Record<RowSize, number> = { compact: 44, comfortable: 56, large: 72 };
export const ROW_HEIGHT = ROW_HEIGHTS.comfortable;
// Height of the "Pinned" section header row inserted above pinned songs in
// the Library/Playlist views (Feature: Pin/Unpin). Deliberately shorter than
// ROW_HEIGHT since it's a label, not a song row.
export const PINNED_HEADER_HEIGHT = 32;

// A row rendered by VirtualList in views that support pinned-song grouping
// (Library, Playlist). `displayIndex` is the song's 0-based position within
// the pinned-then-unpinned ordering, used for the row's numbered index label
// -- kept separate from the row's raw position in this array so inserting
// the header doesn't shift the numbers shown to the user.
export type LibraryRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'song'; song: Song; displayIndex: number };
