// Captura uma vez e remove códigos/tokens da barra de endereço antes das chamadas assíncronas.

export interface AuthReturn {
  code: string | null;
  flowId: string | null;
  tokenHash: string | null;
  type: string | null;
  invalid: boolean;
}

export function captureAuthReturn(href: string, replaceUrl: (path: string) => void): AuthReturn | null {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const isCallback = ['/auth/callback', '/auth/callback.html', '/auth/callback/'].includes(url.pathname);
  const hasCredentials =
    ['code', 'token_hash', 'error', 'error_code'].some((key) => url.searchParams.has(key)) ||
    ['access_token', 'refresh_token', 'error', 'error_code'].some((key) => hash.has(key));
  if (!isCallback && !hasCredentials) return null;
  const result: AuthReturn = {
    code: url.searchParams.get('code'),
    flowId: url.searchParams.get('sb_flow_id'),
    tokenHash: url.searchParams.get('token_hash'),
    type: url.searchParams.get('type'),
    invalid:
      url.searchParams.has('error') ||
      url.searchParams.has('error_code') ||
      hash.has('error') ||
      hash.has('error_code') ||
      hash.has('access_token') ||
      hash.has('refresh_token'),
  };
  replaceUrl('/');
  return result;
}
