export const AUTH_ORIGINS: readonly string[] = Object.freeze([
  'http://localhost:5173',
  'https://project-regenesis-arcade.pages.dev',
]);

export interface JwtPayload {
  sub?: string;
  role?: string;
  [claim: string]: unknown;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))) as JwtPayload;
  } catch {
    return null;
  }
}

export interface AuthConfig {
  url: string;
  key: string;
  storageKey: string;
}

// Também utilizado pelo Vite ANTES de compilar: um segredo não pode chegar ao bundle.
export function readAuthConfig(env: Readonly<Record<string, string | undefined>>): AuthConfig | null {
  if (
    Object.keys(env).some(
      (name) => /^VITE_.*(?:SERVICE_ROLE|SECRET|SMTP|BREVO|PRIVATE_KEY)/i.test(name) && env[name],
    )
  ) {
    throw new Error('Credenciais privadas não podem usar o prefixo VITE_. Remova essa configuração do frontend.');
  }
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
  for (const candidate of [env.VITE_SUPABASE_PUBLISHABLE_KEY, env.VITE_SUPABASE_ANON_KEY]) {
    if (!candidate) continue;
    if (!candidate.startsWith('sb_publishable_') && decodeJwtPayload(candidate)?.role !== 'anon') {
      throw new Error('Use somente uma chave pública publishable ou anon nas variáveis VITE_SUPABASE_.');
    }
  }
  if (!url || !key) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('VITE_SUPABASE_URL não é uma URL válida.');
  }
  // O painel também oferece bases de APIs. Somente esses caminhos conhecidos,
  // no host oficial HTTPS do projeto, podem ser reduzidos à mesma origem.
  // URLs de callback, painel, sub-recursos ou caminhos arbitrários continuam inválidos.
  const isProjectApiBase =
    parsed.protocol === 'https:' &&
    !parsed.port &&
    /^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname) &&
    /^\/(?:auth|rest|storage|functions|realtime)\/v1\/?$/u.test(parsed.pathname);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && !isProjectApiBase) ||
    (parsed.protocol !== 'https:' &&
      !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)))
  ) {
    throw new Error(
      'VITE_SUPABASE_URL deve ser a URL HTTPS raiz do projeto Supabase, sem credenciais, parâmetros, fragmentos ou caminhos não reconhecidos.',
    );
  }
  return { url: parsed.origin, key, storageKey: `game-ia:auth:${parsed.host}:v1` };
}

export function authRedirectUrl(origin: string): string {
  if (!AUTH_ORIGINS.includes(origin)) {
    throw new Error('Abra o jogo em http://localhost:5173 ou no endereço oficial.');
  }
  return `${origin}/auth/callback`;
}
