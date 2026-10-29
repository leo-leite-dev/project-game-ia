// Duplo de teste do cliente Supabase: implementação estrutural (duck-typed)
// dos métodos usados pelo serviço de auth, sem rede real.

import { createAuthMetadata, type AuthMetadata } from '../../src/auth/authMetadata.ts';
import type { GameAuthClient } from '../../src/auth/supabaseClient.ts';
import type { StorageLike } from '../../src/types/domain.ts';

export interface FakeUser {
  id: string;
  email: string;
  app_metadata: { provider: string; role?: string };
}

export interface FakeSession {
  user: FakeUser;
  expires_at: number;
}

export const fakeUser = (id = 'user-a', role?: string): FakeUser => ({
  id,
  email: `${id}@example.test`,
  app_metadata: role ? { provider: 'email', role } : { provider: 'email' },
});

export const fakeSession = (id = 'user-a', role?: string): FakeSession => ({
  user: fakeUser(id, role),
  expires_at: Math.floor(Date.now() / 1000) + 3600,
});

export interface MemoryAuthStorage extends StorageLike {
  values: Map<string, string>;
}

export function memoryAuthStorage(): MemoryAuthStorage {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

export type FakeCall = [name: string, args: unknown];
export type FakeResponse = (args?: unknown) => unknown;

export interface FakeAuthHarness {
  client: GameAuthClient;
  calls: FakeCall[];
  responses: Record<string, FakeResponse | undefined>;
  storage: MemoryAuthStorage;
  metadata: AuthMetadata;
  setSession(value: FakeSession | null): void;
  emit(event: string, session?: FakeSession | null): void;
}

export function fakeAuthClient(): FakeAuthHarness {
  const calls: FakeCall[] = [];
  let current: FakeSession | null = null;
  let listener: ((event: string, session: FakeSession | null) => void) | undefined;
  const responses: Record<string, FakeResponse | undefined> = {};
  const invoke = async (name: string, args: unknown, fallback: () => unknown): Promise<unknown> => {
    calls.push([name, args]);
    const handler = responses[name];
    return handler ? handler(args) : fallback();
  };
  const duckClient = {
    auth: {
      getSession: () => invoke('getSession', null, () => ({ data: { session: current }, error: null })),
      getUser: () => invoke('getUser', null, () => ({ data: { user: current?.user ?? null }, error: null })),
      signInWithPassword: (args: unknown) =>
        invoke('signInWithPassword', args, () => {
          current = fakeSession();
          return { data: current, error: null };
        }),
      signUp: (args: unknown) => invoke('signUp', args, () => ({ data: { user: fakeUser(), session: null }, error: null })),
      signInWithOAuth: (args: unknown) =>
        invoke('signInWithOAuth', args, () => ({
          data: { url: 'https://example.supabase.co/auth/v1/authorize?provider=google' },
          error: null,
        })),
      resetPasswordForEmail: (...args: unknown[]) => invoke('resetPasswordForEmail', args, () => ({ data: {}, error: null })),
      exchangeCodeForSession: (...args: unknown[]) =>
        invoke('exchangeCodeForSession', args, () => {
          current = fakeSession();
          return { data: { session: current, user: current.user, redirectType: null }, error: null };
        }),
      verifyOtp: (args: unknown) =>
        invoke('verifyOtp', args, () => {
          current = fakeSession();
          return { data: { session: current, user: current.user }, error: null };
        }),
      signOut: (args: unknown) =>
        invoke('signOut', args, () => {
          current = null;
          return { error: null };
        }),
      onAuthStateChange(callback: (event: string, session: FakeSession | null) => void) {
        listener = callback;
        return { data: { subscription: { unsubscribe: () => { listener = undefined; } } } };
      },
    },
    updatePassword: (...args: unknown[]) =>
      invoke('updatePassword', args, () => ({ data: { user: current?.user }, error: null })),
  };
  const storage = memoryAuthStorage();
  return {
    // Único cast documentado do projeto de testes: o duplo cobre apenas os
    // membros consumidos pelo serviço; replicar o GoTrueClient inteiro seria
    // uma reescrita cega de tipos de terceiros.
    client: duckClient as unknown as GameAuthClient,
    calls,
    responses,
    storage,
    metadata: createAuthMetadata(storage, 'game-ia:auth:test'),
    setSession: (value) => {
      current = value;
    },
    emit: (event, session = current) => listener?.(event, session),
  };
}
