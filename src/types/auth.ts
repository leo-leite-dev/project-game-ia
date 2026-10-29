// Contratos de domínio do fluxo de autenticação compartilhados entre
// AuthController (estado), AuthView (renderização) e authErrors (validação).

import type { GameEntry } from './domain.ts';

export type AuthMode =
  | 'checking'
  | 'signin'
  | 'signup'
  | 'recovery'
  | 'new-password'
  | 'confirmation'
  | 'callback-error'
  | 'authenticated'
  | 'logout-error'
  | 'session-error';

export type AuthTone = 'info' | 'error' | 'success';

export type UserRole = 'admin' | 'member';

export interface AuthUser {
  id: string;
  email: string;
  provider: string;
  /**
   * Papel da conta. Vem de `app_metadata.role` no Supabase — inalterável
   * pelo próprio usuário (só via painel/service role). Ausência = member.
   */
  role: UserRole;
}

export interface AuthSessionState {
  user: AuthUser;
  /** expiração Unix em segundos, quando conhecida */
  expiresAt?: number | undefined;
}

export interface AuthViewState {
  mode: AuthMode;
  busy: boolean;
  user: AuthUser | null;
  message: string;
  tone: AuthTone;
  /** jogos publicados exibidos a qualquer usuário autenticado */
  games: GameEntry[];
  /** todos os jogos (inclusive rascunhos) — somente admin */
  adminGames: GameEntry[];
  /** feedback do painel admin (catálogo) */
  catalogMessage: string;
  /** operação de catálogo em andamento (admin) */
  catalogBusy: boolean;
}

export interface AuthFormValues {
  email?: string | undefined;
  password?: string | undefined;
  confirmPassword?: string | undefined;
}

export type AuthFieldName = 'email' | 'password' | 'confirmPassword';

export interface AuthFieldError {
  field: AuthFieldName;
  message: string;
}
