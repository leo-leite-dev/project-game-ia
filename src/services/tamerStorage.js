import {
  TAMER_LEGACY_KEYS,
  TAMER_NAME,
  TAMER_STORAGE_KEY,
} from '../config/tamer.js';

const ALLOWED_NAME = /^[\p{L}\p{N} ._-]+$/u;

export function sanitizeTamerName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function validateTamerName(value) {
  const name = sanitizeTamerName(value);
  const length = Array.from(name).length;

  if (length === 0) {
    return {
      valid: false,
      name,
      error: 'Informe um nome para o Tamer.',
    };
  }

  if (length < TAMER_NAME.min || length > TAMER_NAME.max) {
    return {
      valid: false,
      name,
      error: `O nome deve ter entre ${TAMER_NAME.min} e ${TAMER_NAME.max} caracteres.`,
    };
  }

  if (!ALLOWED_NAME.test(name)) {
    return {
      valid: false,
      name,
      error:
        'Use apenas letras, números, espaços, ponto, hífen ou sublinhado.',
    };
  }

  return { valid: true, name, error: '' };
}

function readRecord(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }

    if (typeof parsed === 'string') {
      const result = validateTamerName(parsed);
      return result.valid ? { name: result.name } : null;
    }

    if (!parsed || typeof parsed !== 'object') return null;

    const result = validateTamerName(parsed.name);
    if (!result.valid) return null;

    return {
      name: result.name,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return null;
  }
}

export function loadTamer() {
  const current = readRecord(TAMER_STORAGE_KEY);
  if (current) return current;

  for (const key of TAMER_LEGACY_KEYS) {
    const legacy = readRecord(key);
    if (legacy) return legacy;
  }

  return null;
}

export function saveTamer(value) {
  const result = validateTamerName(value);

  if (!result.valid) {
    throw new Error(result.error);
  }

  const existing = loadTamer();
  const now = new Date().toISOString();
  const record = {
    version: 1,
    name: result.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  localStorage.setItem(TAMER_STORAGE_KEY, JSON.stringify(record));
  return record;
}
