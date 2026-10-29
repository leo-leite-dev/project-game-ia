import { createAuthMetadata } from '../../src/auth/authMetadata.ts';

export const fakeUser = (id = 'user-a') => ({ id, email: `${id}@example.test`, app_metadata: { provider: 'email' } });
export const fakeSession = (id = 'user-a') => ({ user: fakeUser(id), expires_at: Math.floor(Date.now() / 1000) + 3600 });

export function memoryAuthStorage() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

export function fakeAuthClient() {
  const calls = [];
  let current = null;
  let listener;
  const responses = {};
  const invoke = async (name, args, fallback) => {
    calls.push([name, args]);
    return responses[name] ? responses[name](args) : fallback();
  };
  const client = {
    auth: {
      getSession: () => invoke('getSession', null, () => ({ data: { session: current }, error: null })),
      getUser: () => invoke('getUser', null, () => ({ data: { user: current?.user ?? null }, error: null })),
      signInWithPassword: (args) => invoke('signInWithPassword', args, () => {
        current = fakeSession(); return { data: current, error: null };
      }),
      signUp: (args) => invoke('signUp', args, () => ({ data: { user: fakeUser(), session: null }, error: null })),
      signInWithOAuth: (args) => invoke('signInWithOAuth', args, () => ({ data: { url: 'https://example.supabase.co/auth/v1/authorize?provider=google' }, error: null })),
      resetPasswordForEmail: (...args) => invoke('resetPasswordForEmail', args, () => ({ data: {}, error: null })),
      exchangeCodeForSession: (...args) => invoke('exchangeCodeForSession', args, () => {
        current = fakeSession(); return { data: { session: current, user: current.user, redirectType: null }, error: null };
      }),
      verifyOtp: (args) => invoke('verifyOtp', args, () => {
        current = fakeSession(); return { data: { session: current, user: current.user }, error: null };
      }),
      signOut: (args) => invoke('signOut', args, () => { current = null; return { error: null }; }),
      onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe: () => { listener = null; } } } }; },
    },
    updatePassword: (...args) => invoke('updatePassword', args, () => ({ data: { user: current?.user }, error: null })),
  };
  const storage = memoryAuthStorage();
  return { client, calls, responses, storage, metadata: createAuthMetadata(storage, 'game-ia:auth:test'),
    setSession: (value) => { current = value; }, emit: (event, session = current) => listener?.(event, session) };
}
