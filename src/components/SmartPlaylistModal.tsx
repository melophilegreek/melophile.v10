import { useMemo, useState, useEffect, useRef } from 'react';
import { Plus, X, Trash2, Sparkles } from 'lucide-react';
import type { Song, SmartPlaylistConfig, SmartRule, SmartRuleField } from '../types';
import { getContrastText } from '../lib/color';
import {
  defaultSmartConfig, defaultSmartRule, evaluateSmartPlaylist,
  SMART_FIELD_LABELS, operatorsForField, OPERATOR_LABELS,
} from '../lib/smartPlaylist';

interface Props {
  songs: Song[];
  likedIds: Set<string>;
  accentColor: string;
  /** Present when editing an existing smart playlist; absent when creating a new one. */
  initialName?: string;
  initialConfig?: SmartPlaylistConfig;
  onSave: (name: string, config: SmartPlaylistConfig) => void;
  onClose: () => void;
}

const inputClass = 'bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-white/25';

// Feature (Smart/rule-based playlists): the rule editor. Membership isn't
// stored -- name + rule config are all that's persisted (see Playlist.smart
// in types.ts); the actual matching song list is (re)computed each time the
// playlist is opened, via evaluateSmartPlaylist. This modal just builds
// that config and shows a live "N songs match" preview as you edit it.
export function SmartPlaylistModal({ songs, likedIds, accentColor, initialName, initialConfig, onSave, onClose }: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [config, setConfig] = useState<SmartPlaylistConfig>(initialConfig ?? defaultSmartConfig());
  const nameRef = useRef<HTMLInputElement>(null);
  const isEditing = initialConfig !== undefined;

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const genres = useMemo(() => Array.from(new Set(songs.map((s) => s.genre).filter((g): g is string => !!g))).sort(), [songs]);
  const artists = useMemo(() => Array.from(new Set(songs.map((s) => s.artist).filter(Boolean))).sort(), [songs]);
  const albums = useMemo(() => Array.from(new Set(songs.map((s) => s.album).filter((a): a is string => !!a))).sort(), [songs]);

  const matchCount = useMemo(() => evaluateSmartPlaylist(songs, config, likedIds).length, [songs, config, likedIds]);

  const updateRule = (id: string, patch: Partial<SmartRule>) => {
    setConfig((c) => ({
      ...c,
      rules: c.rules.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        // Changing field can invalidate the current operator (e.g. going
        // from "genre" to "liked" -- liked only supports 'is'), so snap it
        // back to that field's first valid operator whenever field changes.
        if (patch.field && !operatorsForField(next.field).includes(next.operator)) {
          next.operator = operatorsForField(next.field)[0];
        }
        if (patch.field === 'liked' && !['true', 'false'].includes(next.value)) next.value = 'true';
        return next;
      }),
    }));
  };
  const removeRule = (id: string) => setConfig((c) => ({ ...c, rules: c.rules.filter((r) => r.id !== id) }));
  const addRule = () => setConfig((c) => ({ ...c, rules: [...c.rules, defaultSmartRule()] }));

  const canSave = name.trim().length > 0;

  const datalistFor = (field: SmartRuleField): { id: string; options: string[] } | null => {
    if (field === 'genre') return { id: 'sp-genres', options: genres };
    if (field === 'artist') return { id: 'sp-artists', options: artists };
    if (field === 'album') return { id: 'sp-albums', options: albums };
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl shadow-2xl animate-slide-up"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 30%), rgba(20,20,23,0.96)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center gap-2 px-6 pt-6 pb-2 shrink-0">
          <Sparkles size={18} style={{ color: accentColor }} />
          <h3 className="text-white font-bold text-lg">{isEditing ? 'Edit smart playlist' : 'New smart playlist'}</h3>
          <button onClick={onClose} className="ml-auto btn-icon w-7 h-7 hover:bg-white/10 rounded-lg">
            <X size={15} className="text-white/50" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3 space-y-4">
          <input ref={nameRef} type="text" placeholder="Playlist name" value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/25" />

          {/* Match all/any */}
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span>Match</span>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {(['all', 'any'] as const).map((m) => (
                <button key={m} onClick={() => setConfig((c) => ({ ...c, match: m }))}
                  className="px-2.5 py-1 text-xs font-medium transition-colors"
                  style={m === config.match ? { background: accentColor, color: getContrastText(accentColor) } : { color: 'rgba(255,255,255,0.5)' }}>
                  {m === 'all' ? 'All' : 'Any'}
                </button>
              ))}
            </div>
            <span>of these rules:</span>
          </div>

          {/* Rules */}
          <div className="space-y-2">
            {config.rules.map((rule) => {
              const ops = operatorsForField(rule.field);
              const dl = datalistFor(rule.field);
              return (
                <div key={rule.id} className="flex items-center gap-1.5 flex-wrap">
                  <select value={rule.field} onChange={(e) => updateRule(rule.id, { field: e.target.value as SmartRuleField, value: '' })} className={inputClass}>
                    {Object.entries(SMART_FIELD_LABELS).map(([f, label]) => <option key={f} value={f}>{label}</option>)}
                  </select>

                  {rule.field === 'liked' ? (
                    <select value={rule.value} onChange={(e) => updateRule(rule.id, { value: e.target.value })} className={inputClass}>
                      <option value="true">is liked</option>
                      <option value="false">is not liked</option>
                    </select>
                  ) : (
                    <>
                      {ops.length > 1 && (
                        <select value={rule.operator} onChange={(e) => updateRule(rule.id, { operator: e.target.value as SmartRule['operator'] })} className={inputClass}>
                          {ops.map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
                        </select>
                      )}
                      {rule.field === 'addedWithinDays' ? (
                        <span className="text-xs text-white/40">last</span>
                      ) : null}
                      <input
                        type={['duration', 'playCount', 'addedWithinDays'].includes(rule.field) ? 'number' : 'text'}
                        min={0}
                        placeholder={rule.field === 'addedWithinDays' ? 'days' : rule.field === 'duration' ? 'minutes' : rule.field === 'playCount' ? 'plays' : 'value'}
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        list={dl?.id}
                        className={`${inputClass} w-28`}
                      />
                      {dl && (
                        <datalist id={dl.id}>{dl.options.map((o) => <option key={o} value={o} />)}</datalist>
                      )}
                      {rule.field === 'addedWithinDays' && <span className="text-xs text-white/40">days</span>}
                    </>
                  )}

                  <button onClick={() => removeRule(rule.id)} className="btn-icon w-6 h-6 hover:bg-red-500/15 rounded-md shrink-0" title="Remove rule">
                    <Trash2 size={12} className="text-white/30 hover:text-red-400" />
                  </button>
                </div>
              );
            })}
            {config.rules.length === 0 && <p className="text-white/30 text-xs">No rules -- this will match every song in your library.</p>}
            <button onClick={addRule} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors" style={{ color: accentColor }}>
              <Plus size={13} /> Add rule
            </button>
          </div>

          {/* Sort + limit */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/10">
            <span className="text-xs text-white/50">Sort by</span>
            <select value={config.sortBy} onChange={(e) => setConfig((c) => ({ ...c, sortBy: e.target.value as SmartPlaylistConfig['sortBy'] }))} className={inputClass}>
              <option value="addedAt">Date added</option>
              <option value="playCount">Play count</option>
              <option value="title">Title</option>
              <option value="artist">Artist</option>
              <option value="random">Random</option>
            </select>
            {config.sortBy !== 'random' && (
              <select value={config.sortDir} onChange={(e) => setConfig((c) => ({ ...c, sortDir: e.target.value as 'asc' | 'desc' }))} className={inputClass}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            )}
            <span className="text-xs text-white/50 ml-2">Limit</span>
            <input type="number" min={1} placeholder="No limit" value={config.limit ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, limit: e.target.value ? Math.max(1, Number(e.target.value)) : null }))}
              className={`${inputClass} w-24`} />
          </div>
        </div>

        <div className="px-6 py-4 shrink-0 border-t border-white/10 flex items-center gap-3">
          <span className="text-xs text-white/40">{matchCount} song{matchCount !== 1 ? 's' : ''} match right now</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm transition-colors">Cancel</button>
            <button onClick={() => canSave && onSave(name.trim(), config)} disabled={!canSave}
              className="px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: accentColor, color: getContrastText(accentColor), boxShadow: `0 6px 20px -6px ${accentColor}80` }}>
              {isEditing ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
