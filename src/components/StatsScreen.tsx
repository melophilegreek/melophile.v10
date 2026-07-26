import { useMemo, useState } from 'react';
import { TrendingUp, BarChart3, Clock, Music2, Disc3, Play, Trash2, ChevronRight, Sparkles, Library, Users, RotateCcw, Heart } from 'lucide-react';
import type { Song, HistoryEntry } from '../types';
import type { ListeningSession } from '../hooks/useListeningStats';
import { getArtUrl, useAlbumArtError } from './SongRow';
import { initialFor, placeholderBackground } from '../lib/artPlaceholder';
import { ListeningStats, type AggregatedListeningStats } from './ListeningStats';
import { TimeListenedDetail } from './TimeListenedDetail';
import { YearInMusicDetail } from './YearInMusicDetail';
import { splitArtists } from '../lib/artistParser';
import { computeLibraryOverview, computeForgottenFavorites } from '../lib/deepStats';

// Small wrapper so useAlbumArtError (a hook) can be used per-row inside a
// .map() — hooks can't be called directly inside a map callback, but a
// dedicated component instance per row is fine. See SongRow.tsx for why the
// error handling/fallback exists.
function StatArt({ song, accentColor, textSize }: { song: Song; accentColor: string; textSize: string }) {
  const artUrl = getArtUrl(song);
  const { showArt, onError } = useAlbumArtError(song, artUrl);
  return showArt
    ? <img src={artUrl!} alt="" className="w-full h-full object-cover" onError={onError} />
    : <span className={`${textSize} font-semibold`} style={{ color: accentColor }}>{initialFor(song)}</span>;
}

interface Props {
  songs: Song[];
  history: HistoryEntry[];
  accentColor: string;
  onClearHistory: () => void;
  onPlaySong: (song: Song) => void;
  listeningStats: AggregatedListeningStats;
  sessions: ListeningSession[];
  /** Feature (Forgotten Favorites): liked-song ids, used to find liked
   *  songs that haven't been played in a while. */
  likedIds: Set<string>;
}

// Gold / silver / bronze accents for the Top 10 panel's top 3 ranks;
// index 3+ falls back to a plain numeral badge (see RANK_MEDALS[i] usage).
const RANK_MEDALS = ['#FFD700', '#C0C0C0', '#CD7F32'];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatMinutes(mins: number): string {
  if (mins <= 0) return '0';
  return mins.toLocaleString();
}

function formatHoursMinutes(mins: number): string {
  if (mins <= 0) return '0 min';
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs === 0) return `${rem} min`;
  if (rem === 0) return `${hrs.toLocaleString()} hr${hrs !== 1 ? 's' : ''}`;
  return `${hrs.toLocaleString()} hr${hrs !== 1 ? 's' : ''} ${rem} min`;
}

function timeSince(ts: number): string {
  if (!ts) return 'Never played';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

export function StatsScreen({ songs, history, accentColor, onClearHistory, onPlaySong, listeningStats, sessions, likedIds }: Props) {
  const [showTimeDetail, setShowTimeDetail] = useState(false);
  const [showYearInMusic, setShowYearInMusic] = useState(false);
  const libraryOverview = useMemo(() => computeLibraryOverview(songs), [songs]);
  const forgottenFavorites = useMemo(() => computeForgottenFavorites(songs, likedIds), [songs, likedIds]);
  const stats = useMemo(() => {
    const played = songs.filter((s) => (s.playCount ?? 0) > 0);
    const totalPlays = played.reduce((sum, s) => sum + (s.playCount ?? 0), 0);

    // Top 10 by play count
    const top10 = [...played].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)).slice(0, 10);
    const maxCount = top10[0]?.playCount ?? 1;
    const topSong = top10[0] ?? null;

    // Most played artist. Also grabs that artist's own highest-played song,
    // used as a stand-in "artist photo" on the capsule card below — the
    // library only has embedded album art, not artist photos, so this is
    // the closest visual we can offer.
    // Feature (Split multi-artist credits): counts against each individually
    // credited name (see lib/artistParser), not the raw slash-joined field,
    // so a song credited "A/B/C" contributes to A's, B's, and C's totals
    // rather than being its own separate "A/B/C" bucket.
    const artistCounts = new Map<string, number>();
    played.forEach((s) => {
      for (const name of splitArtists(s.artist)) {
        artistCounts.set(name, (artistCounts.get(name) ?? 0) + (s.playCount ?? 0));
      }
    });
    let topArtist = '';
    let topArtistCount = 0;
    artistCounts.forEach((count, artist) => { if (count > topArtistCount) { topArtist = artist; topArtistCount = count; } });
    const topArtistSong = topArtist
      ? played.filter((s) => splitArtists(s.artist).includes(topArtist)).sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))[0] ?? null
      : null;

    // Most played album
    const albumCounts = new Map<string, number>();
    played.forEach((s) => { if (s.album) albumCounts.set(s.album, (albumCounts.get(s.album) ?? 0) + (s.playCount ?? 0)); });
    let topAlbum = '';
    let topAlbumCount = 0;
    albumCounts.forEach((count, album) => { if (count > topAlbumCount) { topAlbum = album; topAlbumCount = count; } });

    return { totalPlays, top10, maxCount, topSong, topArtist, topArtistCount, topArtistSong, topAlbum, topAlbumCount };
  }, [songs]);

  const songMap = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);

  if (stats.totalPlays === 0) {
    return (
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="px-4 pt-3">
          <button onClick={() => setShowTimeDetail(true)}
            className="w-full text-left rounded-2xl p-5 mb-3 transition-transform active:scale-[0.99]"
            style={{ background: `linear-gradient(160deg, ${accentColor}26, rgba(255,255,255,0.03))`, border: `1px solid ${accentColor}30` }}>
            <div className="flex items-center justify-between">
              <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">Time Listened</span>
              <ChevronRight size={16} className="text-white/30" />
            </div>
            <p className="mt-1 leading-none">
              <span className="text-5xl font-extrabold tabular-nums" style={{ color: accentColor }}>{formatMinutes(listeningStats.total)}</span>
              <span className="text-lg font-bold text-white/60 ml-2">minutes</span>
            </p>
            <p className="text-white/35 text-xs mt-2">All time · {formatMinutes(listeningStats.thisMonth)} min this month</p>
          </button>
        </div>
        <ListeningStats stats={listeningStats} accentColor={accentColor} />
        <div className="px-4">
          <button onClick={() => setShowYearInMusic(true)}
            className="w-full flex items-center justify-between gap-2 rounded-2xl p-4 mb-4 transition-colors hover:bg-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="flex items-center gap-2 text-white/70 text-sm font-medium">
              <Sparkles size={15} style={{ color: accentColor }} /> Year in Music
            </span>
            <ChevronRight size={16} className="text-white/30" />
          </button>
        </div>
        <LibraryOverviewSection overview={libraryOverview} accentColor={accentColor} />
        <ForgottenFavoritesSection songs={forgottenFavorites} accentColor={accentColor} onPlaySong={onPlaySong} />
        <div className="flex-1 flex flex-col items-center justify-center text-white/25 gap-2 py-20">
          <BarChart3 size={48} className="mb-2 text-white/15" />
          <p className="font-medium text-white/40">No plays counted yet</p>
          <p className="text-xs">A song counts once you've heard 75% of it</p>
        </div>
        {showTimeDetail && (
          <TimeListenedDetail sessions={sessions} accentColor={accentColor} onClose={() => setShowTimeDetail(false)} />
        )}
        {showYearInMusic && (
          <YearInMusicDetail songs={songs} sessions={sessions} accentColor={accentColor} onClose={() => setShowYearInMusic(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-6">
      <div className="px-4 pt-3">
        {/* ── Hero: Time Listened capsule ── */}
        <button onClick={() => setShowTimeDetail(true)}
          className="w-full text-left rounded-2xl p-5 mb-3 transition-transform active:scale-[0.99]"
          style={{ background: `linear-gradient(160deg, ${accentColor}26, rgba(255,255,255,0.03))`, border: `1px solid ${accentColor}30` }}>
          <div className="flex items-center justify-between">
            <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">Time Listened</span>
            <ChevronRight size={16} className="text-white/30" />
          </div>
          <p className="mt-1 leading-none">
            <span className="text-5xl font-extrabold tabular-nums" style={{ color: accentColor }}>{formatMinutes(listeningStats.total)}</span>
            <span className="text-lg font-bold text-white/60 ml-2">minutes</span>
          </p>
          <p className="text-white/35 text-xs mt-2">All time · {formatMinutes(listeningStats.thisMonth)} min this month</p>
        </button>

        {/* ── Top Artist / Top Song capsules ── */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <CapsuleCard label="Top Artist" title={stats.topArtist || '—'} accentColor={accentColor}>
            {stats.topArtistSong ? (
              <div className="relative aspect-square rounded-full overflow-hidden mt-3" style={{ background: placeholderBackground(accentColor) }}>
                <StatArt song={stats.topArtistSong} accentColor={accentColor} textSize="text-2xl" />
                {stats.topArtistCount > 0 && (
                  <span className="absolute bottom-1 right-1 rounded-full text-[10px] font-bold px-2 py-1 text-white" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
                    {stats.topArtistCount} plays
                  </span>
                )}
              </div>
            ) : <EmptyArt accentColor={accentColor} rounded="rounded-full" />}
          </CapsuleCard>

          <CapsuleCard label="Top Song" title={stats.topSong?.title || '—'} accentColor={accentColor}>
            {stats.topSong ? (
              <div className="relative aspect-square rounded-xl overflow-hidden mt-3" style={{ background: placeholderBackground(accentColor) }}>
                <StatArt song={stats.topSong} accentColor={accentColor} textSize="text-2xl" />
                <span className="absolute bottom-1 right-1 rounded-full text-[10px] font-bold px-2 py-1 text-white" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
                  {stats.topSong.playCount} play{stats.topSong.playCount === 1 ? '' : 's'}
                </span>
              </div>
            ) : <EmptyArt accentColor={accentColor} rounded="rounded-xl" />}
          </CapsuleCard>
        </div>

        {/* ── Secondary stat chips ── */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard icon={<Play size={18} />} label="Total Plays" value={stats.totalPlays.toString()} accentColor={accentColor} />
          <StatCard icon={<Music2 size={18} />} label="Songs Played" value={stats.top10.length > 0 ? songs.filter(s => (s.playCount ?? 0) > 0).length.toString() : '0'} accentColor={accentColor} />
          <StatCard icon={<Disc3 size={18} />} label="Top Album" value={stats.topAlbum || '—'} sub={stats.topAlbum ? `${stats.topAlbumCount} plays` : undefined} accentColor={accentColor} />
          <StatCard icon={<Clock size={18} />} label="This Year" value={formatMinutes(listeningStats.thisYear)} sub="minutes" accentColor={accentColor} />
        </div>

        {/* ── Year in Music (Feature: Deeper personal stats) ── */}
        <button onClick={() => setShowYearInMusic(true)}
          className="w-full flex items-center justify-between gap-2 rounded-2xl p-4 mb-4 transition-colors hover:bg-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="flex items-center gap-2 text-white/70 text-sm font-medium">
            <Sparkles size={15} style={{ color: accentColor }} /> Year in Music
          </span>
          <ChevronRight size={16} className="text-white/30" />
        </button>
      </div>

      <ListeningStats stats={listeningStats} accentColor={accentColor} />

      <LibraryOverviewSection overview={libraryOverview} accentColor={accentColor} />
      <ForgottenFavoritesSection songs={forgottenFavorites} accentColor={accentColor} onPlaySong={onPlaySong} />

      {/* ── Top 10, as a capsule panel ── */}
      <div className="px-4 mb-4">
        <div className="relative rounded-2xl p-4 overflow-hidden"
          style={{
            background: `linear-gradient(160deg, ${accentColor}14, rgba(255,255,255,0.03) 55%)`,
            border: `1px solid ${accentColor}25`,
            boxShadow: `0 8px 32px -12px ${accentColor}30, inset 0 1px 0 rgba(255,255,255,0.04)`,
          }}>
          {/* Soft accent glow in the top-right corner, purely decorative */}
          <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-25"
            style={{ background: accentColor }} />
          <h3 className="relative text-white/70 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg shrink-0"
              style={{ background: `${accentColor}22`, boxShadow: `0 0 0 1px ${accentColor}35 inset` }}>
              <TrendingUp size={13} style={{ color: accentColor }} />
            </span>
            Top 10 Most Played
          </h3>
          <div className="relative space-y-1">
            {stats.top10.map((song, i) => {
              const pct = ((song.playCount ?? 0) / stats.maxCount) * 100;
              const medal = RANK_MEDALS[i];
              return (
                <div key={song.id}
                  className="flex items-center gap-3 cursor-pointer group rounded-xl -mx-1.5 px-1.5 py-2 transition-all hover:bg-white/[0.06] active:scale-[0.99]"
                  onClick={() => onPlaySong(song)}>
                  {/* Rank badge: gold/silver/bronze medal for the top 3, plain numeral otherwise */}
                  <span className="relative text-[11px] font-extrabold w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={medal
                      ? { background: `radial-gradient(circle at 35% 30%, ${medal}, ${medal}99)`, color: '#1a1a1a', boxShadow: `0 2px 8px -1px ${medal}80, 0 0 0 1px ${medal}50` }
                      : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                    {i + 1}
                  </span>
                  {/* Album art with a subtle ring + lift shadow, slightly larger than before */}
                  <div className="relative w-11 h-11 rounded-xl shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-white/10 shadow-lg transition-transform group-hover:scale-[1.04]"
                    style={{ background: placeholderBackground(accentColor) }}>
                    <StatArt song={song} accentColor={accentColor} textSize="text-xs" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white/95 truncate">{song.title}</p>
                      <span className="flex items-center gap-1 text-[11px] font-bold tabular-nums shrink-0 px-2 py-0.5 rounded-full"
                        style={{ background: `${accentColor}1c`, color: accentColor }}>
                        {song.playCount} play{song.playCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 truncate mb-1.5">{song.artist}</p>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}cc)`, boxShadow: `0 0 6px ${accentColor}70` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Recently played, as a capsule panel ── */}
      <div className="px-4">
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <Clock size={14} style={{ color: accentColor }} /> Recently Played
            </h3>
            {history.length > 0 && (
              <button onClick={onClearHistory} className="text-xs text-white/30 hover:text-red-400 flex items-center gap-1 transition-colors">
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-white/25 text-xs py-4">No history yet</p>
          ) : (
            <div className="space-y-0.5">
              {history.slice(0, 30).map((entry) => {
                const song = songMap.get(entry.songId);
                if (!song) return null;
                return (
                  <div key={entry.id} className="flex items-center gap-3 py-1.5 group cursor-pointer rounded-lg -mx-1 px-1 transition-colors hover:bg-white/[0.05]" onClick={() => onPlaySong(song)}>
                    <div className="w-8 h-8 rounded-md shrink-0 overflow-hidden flex items-center justify-center" style={{ background: placeholderBackground(accentColor) }}>
                      <StatArt song={song} accentColor={accentColor} textSize="text-[10px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate leading-tight">{song.title}</p>
                      <p className="text-xs text-white/30 truncate leading-tight">{song.artist}</p>
                    </div>
                    <span className="text-xs text-white/25 shrink-0">{timeAgo(entry.playedAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showTimeDetail && (
        <TimeListenedDetail sessions={sessions} accentColor={accentColor} onClose={() => setShowTimeDetail(false)} />
      )}
      {showYearInMusic && (
        <YearInMusicDetail songs={songs} sessions={sessions} accentColor={accentColor} onClose={() => setShowYearInMusic(false)} />
      )}
    </div>
  );
}

/** Label + big colored title + arbitrary art content, used for the Top
 *  Artist / Top Song capsule cards (the Sound-Capsule-style layout). */
function CapsuleCard({ label, title, accentColor, children }: {
  label: string; title: string; accentColor: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span className="text-white/50 text-xs font-medium">{label}</span>
      <p className="text-base font-extrabold truncate mt-0.5" style={{ color: accentColor }}>{title}</p>
      {children}
    </div>
  );
}

function EmptyArt({ accentColor, rounded }: { accentColor: string; rounded: string }) {
  return (
    <div className={`aspect-square ${rounded} overflow-hidden mt-3 flex items-center justify-center`} style={{ background: placeholderBackground(accentColor) }}>
      <Music2 size={24} style={{ color: accentColor }} />
    </div>
  );
}

function StatCard({ icon, label, value, sub, accentColor }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accentColor: string;
}) {
  return (
    <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span style={{ color: accentColor }}>{icon}</span>
        <span className="text-white/40 text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-white text-sm font-bold truncate">{value}</p>
      {sub && <p className="text-white/35 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

// Feature (Library Overview stats): a composition-level summary -- how
// much music is in the library, not how much of it has been played.
// Rendered in both the empty-plays and normal StatsScreen states, since
// it doesn't depend on any play-count data.
function LibraryOverviewSection({ overview, accentColor }: { overview: import('../lib/deepStats').LibraryOverview; accentColor: string }) {
  if (overview.totalSongs === 0) return null;
  const maxFormatCount = overview.formatBreakdown[0]?.count ?? 1;
  return (
    <div className="px-4 mb-4">
      <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
        <Library size={14} style={{ color: accentColor }} /> Library Overview
      </h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <StatCard icon={<Music2 size={18} />} label="Total Songs" value={overview.totalSongs.toLocaleString()} accentColor={accentColor} />
        <StatCard icon={<Clock size={18} />} label="Total Length" value={formatHoursMinutes(overview.totalDurationMin)} accentColor={accentColor} />
        <StatCard icon={<Users size={18} />} label="Artists" value={overview.uniqueArtists.toLocaleString()} accentColor={accentColor} />
        <StatCard icon={<Disc3 size={18} />} label="Albums" value={overview.uniqueAlbums.toLocaleString()} accentColor={accentColor} />
      </div>
      {overview.formatBreakdown.length > 1 && (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-white/40 text-[11px] font-medium uppercase tracking-wider mb-3">File Formats</p>
          <div className="space-y-2">
            {overview.formatBreakdown.slice(0, 6).map(({ format, count }) => (
              <div key={format} className="flex items-center gap-3">
                <span className="text-xs text-white/50 uppercase w-12 shrink-0">{format}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(count / maxFormatCount) * 100}%`, background: accentColor }} />
                </div>
                <span className="text-xs text-white/30 tabular-nums w-8 text-right shrink-0">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Feature (Forgotten Favorites): liked songs that haven't been played in a
// while (or ever) -- a "rediscover your library" nudge, the deliberate
// opposite of every other panel here (which all surface what's already
// getting played the most).
function ForgottenFavoritesSection({ songs, accentColor, onPlaySong }: {
  songs: Song[]; accentColor: string; onPlaySong: (song: Song) => void;
}) {
  if (songs.length === 0) return null;
  return (
    <div className="px-4 mb-4">
      <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-2">
          <RotateCcw size={14} style={{ color: accentColor }} /> Forgotten Favorites
        </h3>
        <p className="text-white/30 text-xs mb-3">Songs you liked but haven't played in a while</p>
        <div className="space-y-0.5">
          {songs.map((song) => (
            <div key={song.id} className="flex items-center gap-3 py-1.5 group cursor-pointer rounded-lg -mx-1 px-1 transition-colors hover:bg-white/[0.05]" onClick={() => onPlaySong(song)}>
              <div className="w-9 h-9 rounded-md shrink-0 overflow-hidden flex items-center justify-center" style={{ background: placeholderBackground(accentColor) }}>
                <StatArt song={song} accentColor={accentColor} textSize="text-[11px]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/85 truncate leading-tight">{song.title}</p>
                <p className="text-xs text-white/35 truncate leading-tight mt-0.5">{song.artist}</p>
              </div>
              <span className="flex items-center gap-1 shrink-0">
                <Heart size={11} fill={accentColor} style={{ color: accentColor }} />
                <span className="text-xs text-white/25">{timeSince(song.lastPlayedAt)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
