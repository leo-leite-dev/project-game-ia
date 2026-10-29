// Repositório de progresso de jogo atrelado à conta do usuário.
//
// Contrato preparado para a persistência remota por conta (etapa futura). Toda
// gravação é endereçada por projeto + usuário (UUID do auth.users) + jogo + versão,
// nunca por e-mail, nickname ou apenas espécie. A implementação atual é local
// (localStorage) e serve como stand-in: substituir por um transporte Supabase com
// RLS sem alterar esta interface.
//
// Regras que toda implementação futura deve respeitar:
//   - read/commit são assíncronos e idempotentes por (userId, gameId, version).
//   - nenhum dado é lido, migrado ou atribuído sem consentimento e validação da sessão.
//   - saves de origem diferente de authenticated user nunca são expostos a outro usuário.

import type {
  GameSaveRepository,
  GameSaveRepositoryOptions,
  StorageLike,
} from '../types/domain.ts';

const SAVE_VERSION = 1;

function storageKey(userId: string, gameId: string): string {
  return `game-ia:save:${userId}:${gameId}:v${SAVE_VERSION}`;
}

function parseStoredValue<T>(raw: string): T | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export function createGameSaveRepository<T>({
  userId,
  gameId,
  storage = globalThis.localStorage,
}: GameSaveRepositoryOptions): GameSaveRepository<T> {
  if (!userId) throw new Error('user-required');
  if (!gameId) throw new Error('game-required');
  const key = storageKey(userId, gameId);
  const store: StorageLike = storage;
  return {
    async read(): Promise<T | null> {
      const raw = store.getItem(key);
      if (raw == null) return null;
      return parseStoredValue<T>(raw);
    },
    async commit(value: T): Promise<T> {
      store.setItem(key, JSON.stringify(value));
      return value;
    },
    async clear(): Promise<void> {
      store.removeItem(key);
    },
  };
}
