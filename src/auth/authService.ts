import { authRedirectUrl } from './authConfig.ts';
import { GameAuthError } from './authErrors.ts';
import type { AuthMetadata } from './authMetadata.ts';
import type { AuthReturn } from './authReturn.ts';
import type { GameAuthClient } from './supabaseClient.ts';
import type { AuthSessionState } from '../types/auth.ts';

const enumSafeCodes = new Set([
  'user_already_exists',
  'email_exists',
  'identity_already_exists',
  'user_not_found',
]);

interface AuthResultLike {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

const assertResult = <R extends AuthResultLike>(result: R): R['data'] => {
  if (result.error) throw result.error;
  return result.data;
};

// `redirectType` existe na resposta do PKCE em runtime, mas não está declarado
// nas tipagens do SDK; lido com validação para não confiar em formato externo.
function readRedirectType(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null;
  const value = (data as Record<string, unknown>).redirectType;
  return typeof value === 'string' ? value : null;
}

export interface AuthServiceOptions {
  client: GameAuthClient;
  metadata: AuthMetadata;
  origin: string;
  projectUrl: string;
  withCallbackLock?: <T>(operation: () => Promise<T>) => Promise<T>;
}

export interface AuthService {
  verifiedSession(expectedId?: string): Promise<AuthSessionState | null>;
  metadata: AuthMetadata;
  subscribe(callback: (event: string, userId: string | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthSessionState | null>;
  signUp(email: string, password: string): Promise<AuthSessionState | null>;
  googleUrl(): Promise<string>;
  requestRecovery(email: string): Promise<void>;
  finishReturn(value: AuthReturn): Promise<AuthSessionState & { recovery: boolean }>;
  updatePassword(expectedUserId: string | undefined, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export function createAuthService({
  client,
  metadata,
  origin,
  projectUrl,
  withCallbackLock = <T>(operation: () => Promise<T>): Promise<T> => operation(),
}: AuthServiceOptions): AuthService {
  const redirectTo = (): string => authRedirectUrl(origin);
  let returnPromise: Promise<AuthSessionState & { recovery: boolean }> | null = null;
  let returnStarted = false;

  async function verifiedSession(expectedId?: string): Promise<AuthSessionState | null> {
    const { session } = assertResult(await client.auth.getSession());
    if (!session) return null;
    const { user } = assertResult(await client.auth.getUser());
    if (!user || user.id !== session.user.id || (expectedId && user.id !== expectedId)) {
      throw new GameAuthError('account-changed', 'A conta mudou. Entre novamente para continuar com segurança.');
    }
    const { session: latest } = assertResult(await client.auth.getSession());
    if (!latest || latest.user.id !== user.id) {
      throw new GameAuthError('account-changed', 'A conta mudou. Entre novamente para continuar com segurança.');
    }
    return {
      user: {
        id: user.id,
        email: user.email ?? '',
        provider: user.app_metadata?.provider ?? '',
      },
      expiresAt: latest.expires_at,
    };
  }

  async function requireSignedOut(): Promise<void> {
    if (metadata.logoutPending()) {
      throw new GameAuthError('logout-pending', 'Conclua a saída da sessão anterior antes de entrar novamente.');
    }
    const { session } = assertResult(await client.auth.getSession());
    if (session) {
      throw new GameAuthError(
        'already-signed-in',
        'Já existe uma sessão neste navegador. Saia da conta e inicie novamente o acesso ou solicite um novo link.',
      );
    }
  }

  return {
    verifiedSession,
    metadata,
    subscribe(callback) {
      // Nunca executar APIs Auth dentro do callback do SDK/lock de sessão.
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const userId = session?.user?.id ?? null;
        client.onSessionBoundary?.(event, userId);
        const timer = setTimeout(() => {
          timers.delete(timer);
          callback(event, userId);
        }, 0);
        timers.add(timer);
      });
      return () => {
        data.subscription.unsubscribe();
        for (const timer of timers) clearTimeout(timer);
      };
    },
    async signIn(email, password) {
      await requireSignedOut();
      const { user } = assertResult(await client.auth.signInWithPassword({ email, password }));
      return verifiedSession(user?.id);
    },
    async signUp(email, password) {
      await requireSignedOut();
      const result = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
      if (result.error && !enumSafeCodes.has(result.error.code ?? '')) throw result.error;
      // Com confirmação habilitada session será null; nunca criar perfil de jogo.
      return result.data?.session ? verifiedSession(result.data.user?.id) : null;
    },
    async googleUrl() {
      await requireSignedOut();
      const { url } = assertResult(
        await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: redirectTo(), skipBrowserRedirect: true },
        }),
      );
      const target = new URL(String(url));
      if (target.origin !== new URL(projectUrl).origin || target.pathname !== '/auth/v1/authorize') {
        throw new GameAuthError('invalid-redirect', 'Não foi possível iniciar o acesso Google. Tente novamente.');
      }
      return target.href;
    },
    async requestRecovery(email) {
      await requireSignedOut();
      const result = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
      if (result.error && !enumSafeCodes.has(result.error.code ?? '')) throw result.error;
    },
    finishReturn(value) {
      // PKCE tem um único responsável: auto-detect do SDK está desligado.
      if (returnPromise) return returnPromise;
      if (returnStarted) {
        return Promise.reject(new GameAuthError('return-used', 'Este retorno já foi processado. Inicie um novo acesso.'));
      }
      returnStarted = true;
      returnPromise = withCallbackLock(async () => {
        if (value.invalid || !!value.code === !!value.tokenHash) throw new Error('invalid-auth-return');
        await requireSignedOut();
        let state: AuthSessionState | null;
        let recovery = false;
        if (value.code) {
          const options = value.flowId ? { flowId: value.flowId } : undefined;
          const data = assertResult(await client.auth.exchangeCodeForSession(value.code, options));
          recovery = readRedirectType(data) === 'recovery';
          state = await verifiedSession();
        } else {
          const type = value.type;
          if (type !== 'signup' && type !== 'email' && type !== 'recovery') throw new Error('invalid-auth-return');
          if (!value.tokenHash) throw new Error('invalid-auth-return');
          const data = assertResult(await client.auth.verifyOtp({ token_hash: value.tokenHash, type }));
          recovery = type === 'recovery';
          state = await verifiedSession(data.user?.id);
        }
        if (!state) throw new Error('missing-session');
        if (recovery) metadata.setRecovery(state.user.id);
        else metadata.clearRecovery();
        return { ...state, recovery };
      });
      const flight = returnPromise;
      // O latch impede replay, sem reter o usuário do callback após logout/troca.
      void flight.finally(() => { returnPromise = null; }).catch(() => {});
      return flight;
    },
    async updatePassword(expectedUserId, password) {
      if (!expectedUserId || metadata.recoveryUser() !== expectedUserId) {
        throw new GameAuthError('recovery-required', 'Reabra um link válido de recuperação para definir sua nova senha.');
      }
      if (!(await verifiedSession(expectedUserId))) {
        throw new GameAuthError('session-expired', 'Sua sessão terminou. Solicite um novo link de recuperação.');
      }
      const { user } = assertResult(await client.updatePassword(expectedUserId, password));
      if (user?.id !== expectedUserId) {
        throw new GameAuthError('account-changed', 'A conta mudou. Entre novamente.');
      }
      metadata.clearRecovery(expectedUserId);
    },
    async signOut() {
      metadata.setLogoutPending(true);
      metadata.clearRecovery();
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
      metadata.setLogoutPending(false);
    },
  };
}
