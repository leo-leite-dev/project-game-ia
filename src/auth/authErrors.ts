import type { AuthFieldError, AuthFormValues } from '../types/auth.ts';

export class GameAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GameAuthError';
    this.code = code;
  }
}

export const CONFIRMATION_MESSAGE =
  'Se o endereço estiver apto para cadastro, você receberá um e-mail de confirmação. Confira também o spam e abra o link neste navegador.';
export const RECOVERY_MESSAGE =
  'Se houver uma conta apta para esse endereço, você receberá instruções de recuperação. Confira também o spam e abra o link neste navegador.';

// 'signin', 'callback' e 'signout' têm mensagens próprias; demais ações caem
// no aviso genérico (compatível com o comportamento original em JS).
export type AuthErrorMessageAction = 'signin' | 'callback' | 'signout' | (string & {});

/** Extrai campos de erro de um valor externo desconhecido (erro Supabase etc.). */
function serverErrorOf(error: unknown): { status?: number; code?: string } {
  if (error !== null && typeof error === 'object') return error as { status?: number; code?: string };
  return {};
}

/** Código de erro legível quando existir; nunca lança. */
export function authErrorCode(error: unknown): string | null {
  const code = serverErrorOf(error).code;
  return typeof code === 'string' ? code : null;
}

export function authErrorMessage(error: unknown, action: AuthErrorMessageAction = 'signin'): string {
  if (error instanceof GameAuthError) return error.message;
  const { status, code } = serverErrorOf(error);
  if (status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(code ?? '')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar. Confira sua caixa de entrada e o spam.';
  if (['weak_password', 'same_password'].includes(code ?? '')) {
    return 'A senha não atende aos requisitos do serviço. Escolha uma senha nova, mais longa e variada.';
  }
  if (action === 'signin' && code === 'invalid_credentials') return 'Não foi possível entrar. Confira o e-mail e a senha.';
  if (action === 'callback') return 'Link inválido, expirado ou já utilizado. Abra o link no navegador em que iniciou o acesso ou solicite um novo.';
  if (action === 'signout') return 'O acesso ao jogo foi encerrado neste dispositivo, mas não foi possível confirmar a saída no serviço. Tente sair novamente.';
  return 'Não foi possível concluir a solicitação. Verifique sua conexão e tente novamente.';
}

export function validateAuthFields(mode: string, values: AuthFormValues): AuthFieldError | null {
  const email = String(values.email ?? '').trim();
  const password = String(values.password ?? '');
  if (mode !== 'new-password' && (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { field: 'email', message: 'Informe um e-mail válido.' };
  }
  if (mode !== 'recovery' && !password) return { field: 'password', message: 'Informe sua senha.' };
  if (['signup', 'new-password'].includes(mode)) {
    if (Array.from(password).length < 8) return { field: 'password', message: 'Use uma senha com pelo menos 8 caracteres.' };
    if (password !== values.confirmPassword) return { field: 'confirmPassword', message: 'As senhas não coincidem.' };
  }
  return null;
}
