import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_AUDIO_PREFS,
  normalizeAudioPrefs,
  readAudioPrefs,
  writeAudioPrefs,
} from '../../src/audio/audioPrefs.ts';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

test('preferências ausentes retornam os valores padrão', () => {
  const storage = createMemoryStorage();
  assert.deepEqual(readAudioPrefs(storage), DEFAULT_AUDIO_PREFS);
});

test('JSON corrompido em localStorage cai nos padrões sem lançar', () => {
  const storage = createMemoryStorage({ 'game-ia:audio-prefs:v1': '{corrompido' });
  assert.deepEqual(readAudioPrefs(storage), DEFAULT_AUDIO_PREFS);
});

test('dados externos inválidos são normalizados antes do uso', () => {
  assert.deepEqual(normalizeAudioPrefs(null), DEFAULT_AUDIO_PREFS);
  assert.deepEqual(normalizeAudioPrefs('texto'), DEFAULT_AUDIO_PREFS);
  assert.deepEqual(
    normalizeAudioPrefs({ musicVolume: 2, sfxVolume: -1, muted: 'sim' }),
    { musicVolume: 1, sfxVolume: 0, muted: false },
  );
  assert.ok(Number.isFinite(normalizeAudioPrefs({ musicVolume: Number.NaN }).musicVolume));
});

test('gravar e reler preferências preserva os valores válidos', () => {
  const storage = createMemoryStorage();
  writeAudioPrefs(storage, { musicVolume: 0.25, sfxVolume: 0.5, muted: true });
  assert.deepEqual(readAudioPrefs(storage), { musicVolume: 0.25, sfxVolume: 0.5, muted: true });
  const stored = JSON.parse(storage.dump()['game-ia:audio-prefs:v1']);
  assert.deepEqual(Object.keys(stored).sort(), ['musicVolume', 'muted', 'sfxVolume']);
});
