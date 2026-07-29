// Feature (10-band EQ + presets): band layout and preset gain curves live
// here so player.ts (audio graph), db.ts (persistence default/migration),
// and SettingsPanel.tsx (UI) all reference the same single source of truth
// instead of three independently-maintained copies.

/** Ten bands following the standard ISO graphic-EQ frequency spacing
 *  (31/62/125/250/500/1k/2k/4k/8k/16k Hz, one octave apart), giving finer
 *  control than a coarser 5-band split -- particularly useful for
 *  separating true sub-bass (31/62Hz) from low-mid warmth (125/250Hz), and
 *  presence (2k/4k) from air/sparkle (8k/16k). */
export const EQ_BANDS = [
  { key: 'band31', label: '31', freq: 31, type: 'lowshelf' as const },
  { key: 'band62', label: '62', freq: 62, type: 'peaking' as const },
  { key: 'band125', label: '125', freq: 125, type: 'peaking' as const },
  { key: 'band250', label: '250', freq: 250, type: 'peaking' as const },
  { key: 'band500', label: '500', freq: 500, type: 'peaking' as const },
  { key: 'band1k', label: '1k', freq: 1000, type: 'peaking' as const },
  { key: 'band2k', label: '2k', freq: 2000, type: 'peaking' as const },
  { key: 'band4k', label: '4k', freq: 4000, type: 'peaking' as const },
  { key: 'band8k', label: '8k', freq: 8000, type: 'peaking' as const },
  { key: 'band16k', label: '16k', freq: 16000, type: 'highshelf' as const },
] as const;

export type EQBandKey = typeof EQ_BANDS[number]['key'];
export type EQState = Record<EQBandKey, number>;

/** Widened from the old +/-12dB range so Bass Boost / Rock / Electronic
 *  presets below have real headroom to be felt, not just nudged. */
export const EQ_MIN_DB = -20;
export const EQ_MAX_DB = 20;

export const EQ_FLAT: EQState = {
  band31: 0, band62: 0, band125: 0, band250: 0, band500: 0,
  band1k: 0, band2k: 0, band4k: 0, band8k: 0, band16k: 0,
};

export function clampEQ(db: number): number {
  return Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, db));
}

export interface EQPreset {
  name: string;
  bands: EQState;
}

// Re-tuned for the finer 10-band spacing: each preset's overall character
// (from the old 5-band curves) is preserved, but now shaped across twice as
// many points so the transitions between, say, sub-bass and low-mid, or
// presence and air, are smoother and more deliberate rather than a single
// wide bump standing in for both.
export const EQ_PRESETS: EQPreset[] = [
  { name: 'Flat', bands: EQ_FLAT },
  { name: 'Bass Boost', bands: { band31: 9, band62: 9, band125: 6, band250: 3, band500: 1, band1k: 0, band2k: -1, band4k: -2, band8k: -2, band16k: -1 } },
  { name: 'Treble Boost', bands: { band31: -2, band62: -2, band125: -1, band250: -1, band500: 0, band1k: 1, band2k: 3, band4k: 5, band8k: 7, band16k: 8 } },
  { name: 'Vocal Boost', bands: { band31: -4, band62: -3, band125: -2, band250: -1, band500: 2, band1k: 5, band2k: 5, band4k: 4, band8k: 2, band16k: 1 } },
  { name: 'Rock', bands: { band31: 6, band62: 6, band125: 3, band250: 1, band500: -2, band1k: -3, band2k: -1, band4k: 2, band8k: 4, band16k: 5 } },
  { name: 'Pop', bands: { band31: -1, band62: -1, band125: 1, band250: 2, band500: 3, band1k: 3, band2k: 4, band4k: 3, band8k: 0, band16k: -1 } },
  { name: 'Jazz', bands: { band31: 4, band62: 4, band125: 3, band250: 2, band500: 0, band1k: -1, band2k: -1, band4k: 2, band8k: 3, band16k: 4 } },
  { name: 'Classical', bands: { band31: 4, band62: 4, band125: 3, band250: 3, band500: 1, band1k: -2, band2k: -2, band4k: 2, band8k: 4, band16k: 5 } },
  { name: 'Electronic', bands: { band31: 7, band62: 7, band125: 4, band250: 2, band500: 0, band1k: 0, band2k: 1, band4k: 2, band8k: 5, band16k: 6 } },
  { name: 'Acoustic', bands: { band31: 3, band62: 3, band125: 2, band250: 2, band500: 1, band1k: 1, band2k: 2, band4k: 3, band8k: 3, band16k: 3 } },
];

/** Finds the preset matching the current EQ state exactly, or null if the
 *  user has hand-tuned sliders away from any known preset ("Custom"). */
export function matchPreset(eq: EQState): string | null {
  for (const p of EQ_PRESETS) {
    if (EQ_BANDS.every((b) => p.bands[b.key] === eq[b.key])) return p.name;
  }
  return null;
}

// FIX (10-band EQ upgrade breaking existing saved settings): preferences
// saved before this upgrade only have the old 5 band keys (band60, band250,
// band1k, band4k, band12k). Loading one of those objects straight into the
// new 10-band engine would leave every new band's gain as `undefined` --
// silently breaking the whole EQ graph (BiquadFilterNode.gain.value set to
// undefined coerces to NaN), and would also just discard whatever curve the
// person had actually tuned. This maps each old band to its closest new one
// by frequency (three of the five keys are literally unchanged --
// band250/band1k/band4k slot in directly) and fills every other new band
// with 0, so a previous Bass Boost or hand-tuned curve still resembles
// itself afterwards instead of vanishing.
const LEGACY_BAND_MAP: Record<string, EQBandKey> = {
  band60: 'band62',
  band250: 'band250',
  band1k: 'band1k',
  band4k: 'band4k',
  band12k: 'band16k',
};

export function migrateEQ(saved: Record<string, number> | undefined | null): EQState {
  if (!saved) return { ...EQ_FLAT };
  // Already a full 10-band object (nothing to migrate) -- covers both a
  // fresh install and every save made after this upgrade shipped.
  if (EQ_BANDS.every((b) => typeof saved[b.key] === 'number')) return saved as EQState;

  const migrated: EQState = { ...EQ_FLAT };
  for (const [oldKey, newKey] of Object.entries(LEGACY_BAND_MAP)) {
    if (typeof saved[oldKey] === 'number') migrated[newKey] = clampEQ(saved[oldKey]);
  }
  return migrated;
}
