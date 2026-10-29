// Somente sinalizadores de UX. Não guardam senha/token e nunca autorizam acesso.

import type { StorageLike } from '../types/domain.ts';

interface RecoveryFlag {
  userId: string;
  expiresAt: number;
}

export interface AuthMetadata {
  recoveryUser(): string | null;
  setRecovery(userId: string): void;
  clearRecovery(userId?: string): void;
  logoutPending(): boolean;
  setLogoutPending(value: boolean): void;
}

export function createAuthMetadata(storage: StorageLike, prefix: string, now: () => number = Date.now): AuthMetadata {
  function read(name: string): unknown {
    try {
      return JSON.parse(storage.getItem(`${prefix}:${name}`) ?? 'null') as unknown;
    } catch {
      return null;
    }
  }
  function readRecovery(): RecoveryFlag | null {
    const value = read('recovery');
    if (value === null || typeof value !== 'object') return null;
    const flag = value as Partial<RecoveryFlag>;
    return typeof flag.userId === 'string' && typeof flag.expiresAt === 'number'
      ? { userId: flag.userId, expiresAt: flag.expiresAt }
      : null;
  }
  function write(name: string, value: unknown): void {
    try {
      if (value === null) storage.removeItem(`${prefix}:${name}`);
      else storage.setItem(`${prefix}:${name}`, JSON.stringify(value));
    } catch {
      /* Sem metadados, recarregar exigirá um novo link de recuperação. */
    }
  }
  return {
    recoveryUser() {
      const value = readRecovery();
      return value && value.expiresAt > now() ? value.userId : null;
    },
    setRecovery(userId) {
      write('recovery', { userId, expiresAt: now() + 15 * 60 * 1000 });
    },
    clearRecovery(userId) {
      const storedUserId = readRecovery()?.userId;
      if (!userId || storedUserId === userId) write('recovery', null);
    },
    logoutPending: () => read('logout-pending') === true,
    setLogoutPending: (value) => write('logout-pending', value ? true : null),
  };
}
