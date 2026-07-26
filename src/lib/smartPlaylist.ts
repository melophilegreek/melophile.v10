// Feature (Smart/rule-based playlists): evaluates a SmartPlaylistConfig
// against the live library. Deliberately *not* live/auto-updating in the
// background -- callers (App.tsx's getViewSongs) call this once whenever
// the playlist view is opened/re-rendered, which naturally re-runs it
// against whatever the library looks like at that moment without needing
// any separate subscription/recompute machinery.

import type { Song, SmartPlaylistConfig, SmartRule } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Self-contained Fisher-Yates shuffle (mirrors App.tsx's shuffleSeeded,
// duplicated locally rather than imported since that one is a private
// helper inside App.tsx and this module has no other reason to depend on
// App.tsx). Only used for the 'random' smart-playlist sort option.
function shuffleRandom<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function matchesRule(song: Song, rule: SmartRule, likedIds: Set<string>): boolean {
  const text = (v: string | undefined) => (v ?? '').toLowerCase().trim();

  switch (rule.field) {
    case 'genre':
    case 'artist':
    case 'album': {
      const field = rule.field === 'genre' ? song.genre : rule.field === 'artist' ? song.artist : song.album;
      const a = text(field);
      const b = text(rule.value);
      if (!b) return true; // an empty rule value matches everything rather than nothing
      if (rule.operator === 'is') return a === b;
      if (rule.operator === 'is_not') return a !== b;
      return a.includes(b); // 'contains' (default fallback for this field group)
    }
    case 'liked': {
      const want = rule.value === 'true';
      return likedIds.has(song.id) === want;
    }
    case 'duration': {
      const minutes = Number(rule.value);
      if (!isFinite(minutes)) return true;
      const targetSeconds = minutes * 60;
      return compareNumber(song.duration, rule.operator, targetSeconds);
    }
    case 'playCount': {
      const n = Number(rule.value);
      if (!isFinite(n)) return true;
      return compareNumber(song.playCount, rule.operator, n);
    }
    case 'addedWithinDays': {
      const days = Number(rule.value);
      if (!isFinite(days) || days <= 0) return true;
      return song.addedAt >= Date.now() - days * DAY_MS;
    }
    default:
      return true;
  }
}

function compareNumber(actual: number, operator: SmartRule['operator'], target: number): boolean {
  switch (operator) {
    case 'gt': return actual > target;
    case 'gte': return actual >= target;
    case 'lt': return actual < target;
    case 'lte': return actual <= target;
    case 'is': return actual === target;
    case 'is_not': return actual !== target;
    default: return true;
  }
}

export function evaluateSmartPlaylist(songs: Song[], config: SmartPlaylistConfig, likedIds: Set<string>): Song[] {
  const activeRules = config.rules.filter((r) => r.value.trim() !== '' || r.field === 'liked');
  let result = activeRules.length === 0 ? songs.slice() : songs.filter((song) => {
    const results = activeRules.map((r) => matchesRule(song, r, likedIds));
    return config.match === 'all' ? results.every(Boolean) : results.some(Boolean);
  });

  if (config.sortBy === 'random') {
    // Reshuffles fresh on every open (this only re-evaluates when the
    // playlist view is opened, not continuously) -- arguably a feature
    // for a "smart shuffle" style playlist.
    result = shuffleRandom(result);
  } else {
    const cmp: Record<Exclude<SmartPlaylistConfig['sortBy'], 'random'>, (a: Song, b: Song) => number> = {
      addedAt: (a, b) => a.addedAt - b.addedAt,
      playCount: (a, b) => a.playCount - b.playCount,
      title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      artist: (a, b) => a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' }),
    };
    result = [...result].sort(cmp[config.sortBy]);
    if (config.sortDir === 'desc') result.reverse();
  }

  if (config.limit && config.limit > 0) result = result.slice(0, config.limit);
  return result;
}

export function defaultSmartRule(): SmartRule {
  return { id: `r-${Date.now()}-${Math.random().toString(36).slice(2)}`, field: 'genre', operator: 'is', value: '' };
}

export function defaultSmartConfig(): SmartPlaylistConfig {
  return { match: 'all', rules: [defaultSmartRule()], sortBy: 'addedAt', sortDir: 'desc', limit: null };
}

// Human-readable field/operator labels shared by the editor UI.
export const SMART_FIELD_LABELS: Record<SmartRule['field'], string> = {
  genre: 'Genre', artist: 'Artist', album: 'Album', liked: 'Liked',
  duration: 'Duration (min)', playCount: 'Play count', addedWithinDays: 'Added within (days)',
};

export function operatorsForField(field: SmartRule['field']): SmartRule['operator'][] {
  switch (field) {
    case 'genre': case 'artist': case 'album': return ['is', 'is_not', 'contains'];
    case 'duration': case 'playCount': return ['gt', 'gte', 'lt', 'lte', 'is'];
    case 'liked': case 'addedWithinDays': return ['is'];
    default: return ['is'];
  }
}

export const OPERATOR_LABELS: Record<SmartRule['operator'], string> = {
  is: 'is', is_not: 'is not', contains: 'contains',
  gt: '>', gte: '\u2265', lt: '<', lte: '\u2264',
};
