// Contratos de domínio do fluxo de autenticação compartilhados entre
// AuthController (estado), AuthView (renderização) e authErrors (validação).

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

export interface AuthUser {
  id: string;
  email: string;
  provider: string;
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
