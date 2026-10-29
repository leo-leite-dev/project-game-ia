import { createClient } from '@supabase/supabase-js';
import type { AuthConfig } from './authConfig.ts';
import { decodeJwtPayload } from './authConfig.ts';
import { GameAuthError } from './authErrors.ts';

export interface GameAuthClientOptions {
  fetch?: typeof globalThis.fetch;
}

export function createGameAuthClient(config: AuthConfig, { fetch: fetcher = globalThis.fetch.bind(globalThis) }: GameAuthClientOptions = {}) {
  let mutationOwner: string | null = null;
  let sessionOwner: string | null = null;
  let sessionEpoch = 0;
  const pending = new Set<AbortController>();
  const projectOrigin = new URL(config.url).origin;
  const guardedFetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    // Checa o JWT que o SDK EFETIVAMENTE enviará, fechando a corrida entre validar A
    // e obter uma sessão B de outra aba antes de updateUser(). O servidor valida o JWT.
    if (request.method === 'PUT' && url.origin === projectOrigin && url.pathname === '/auth/v1/user') {
      const jwt = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
      if (!mutationOwner || decodeJwtPayload(jwt)?.sub !== mutationOwner) {
        throw new GameAuthError('account-changed', 'A conta mudou. Reabra a recuperação antes de alterar a senha.');
      }
    }
    if (url.origin !== projectOrigin || !url.pathname.startsWith('/auth/v1/')) return fetcher(request);
    const epoch = sessionEpoch;
    const abort = new AbortController();
    const relayAbort = () => abort.abort();
    if (request.signal.aborted) abort.abort();
    request.signal.addEventListener('abort', relayAbort, { once: true });
    pending.add(abort);
    try {
      const response = await fetcher(new Request(request, { signal: abort.signal }));
      // Também descarta respostas já recebidas, mas ainda não consumidas pelo SDK.
      const originalJson = response.json.bind(response);
      response.json = async () => {
        const result = await originalJson();
        if (epoch !== sessionEpoch) {
          throw new GameAuthError('account-changed', 'A sessão mudou durante a solicitação. Tente novamente.');
        }
        return result;
      };
      const originalText = response.text.bind(response);
      response.text = async () => {
        const result = await originalText();
        if (epoch !== sessionEpoch) {
          throw new GameAuthError('account-changed', 'A sessão mudou durante a solicitação. Tente novamente.');
        }
        return result;
      };
      return response;
    } finally {
      pending.delete(abort);
      request.signal.removeEventListener('abort', relayAbort);
    }
  };
  const client = createClient(config.url, config.key, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: config.storageKey,
      debug: false,
    },
    global: { fetch: guardedFetch },
  });
  return {
    auth: client.auth,
    onSessionBoundary(event: string, userId: string | null): void {
      if (event === 'INITIAL_SESSION') {
        sessionOwner = userId;
        return;
      }
      if (event === 'SIGNED_OUT' || (userId && userId !== sessionOwner)) {
        ++sessionEpoch;
        for (const request of pending) request.abort();
        pending.clear();
      }
      sessionOwner = userId;
    },
    async updatePassword(expectedUserId: string, password: string) {
      if (mutationOwner) throw new GameAuthError('busy', 'Aguarde a alteração em andamento.');
      mutationOwner = expectedUserId;
      try {
        return await client.auth.updateUser({ password });
      } finally {
        mutationOwner = null;
      }
    },
  };
}

export type GameAuthClient = ReturnType<typeof createGameAuthClient>;
