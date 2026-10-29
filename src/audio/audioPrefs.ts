// Preferências de áudio da plataforma (puras, sem dependência de Web Audio).
// Toda leitura de `localStorage` é validada antes de ser utilizada.

import type { StorageLike } from '../types/domain.ts';

const PREFS_KEY = 'game-ia:audio-prefs:v1';

export interface AudioPrefs {
  /** volume da música 0..1 */
  musicVolume: number;
  /** volume dos efeitos 0..1 */
  sfxVolume: number;
  /** true quando tudo está mudo */
  muted: boolean;
}

export const DEFAULT_AUDIO_PREFS: AudioPrefs = Object.freeze({
  musicVolume: 0.7,
  sfxVolume: 0.8,
  muted: false,
});

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Normaliza dados externos (JSON desconhecido) para um AudioPrefs válido. */
export function normalizeAudioPrefs(value: unknown): AudioPrefs {
  if (value === null || typeof value !== 'object') return { ...DEFAULT_AUDIO_PREFS };
  const raw = value as Partial<Record<keyof AudioPrefs, unknown>>;
  return {
    musicVolume:
      typeof raw.musicVolume === 'number' ? clamp01(raw.musicVolume) : DEFAULT_AUDIO_PREFS.musicVolume,
    sfxVolume:
      typeof raw.sfxVolume === 'number' ? clamp01(raw.sfxVolume) : DEFAULT_AUDIO_PREFS.sfxVolume,
    muted: typeof raw.muted === 'boolean' ? raw.muted : DEFAULT_AUDIO_PREFS.muted,
  };
}

export function readAudioPrefs(storage: StorageLike): AudioPrefs {
  const raw = storage.getItem(PREFS_KEY);
  if (raw == null) return { ...DEFAULT_AUDIO_PREFS };
  try {
    return normalizeAudioPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AUDIO_PREFS };
  }
}

export function writeAudioPrefs(storage: StorageLike, prefs: AudioPrefs): void {
  storage.setItem(PREFS_KEY, JSON.stringify(normalizeAudioPrefs(prefs)));
}
