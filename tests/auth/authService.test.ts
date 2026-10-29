import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { readAuthConfig, authRedirectUrl, decodeJwtPayload } from '../../src/auth/authConfig.ts';
import { captureAuthReturn } from '../../src/auth/authReturn.ts';
import { createAuthService } from '../../src/auth/authService.ts';
import { authErrorMessage, CONFIRMATION_MESSAGE, RECOVERY_MESSAGE, validateAuthFields } from '../../src/auth/authErrors.ts';
import { createAuthMetadata } from '../../src/auth/authMetadata.ts';
import { fakeAuthClient, fakeSession, memoryAuthStorage } from '../helpers/fakeAuth.ts';
import type { AuthReturn } from '../../src/auth/authReturn.ts';

function setup() {
  const fake = fakeAuthClient();
  return { ...fake, service: createAuthService({ ...fake, origin: 'http://localhost:5173', projectUrl: 'https://example.supabase.co' }) };
}
const jwt = (role: string): string => `test.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.test`;

test('configuração aceita apenas URL segura e chave pública; não exige credencial privada', () => {
  assert.equal(readAuthConfig({}), null);
  assert.equal(readAuthConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: jwt('anon') })?.storageKey, 'game-ia:auth:example.supabase.co:v1');
  for (const key of ['sb_secret_EXEMPLO', jwt('service_role'), 'private-invalid']) {
    assert.throws(() => readAuthConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key }), /chave pública/);
  }
  assert.throws(() => readAuthConfig({ VITE_SUPABASE_SERVICE_ROLE: 'EXEMPLO' }), /privadas/);
  assert.throws(() => readAuthConfig({ VITE_SUPABASE_URL: 'https://user:password@example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST' }));
  assert.throws(() => readAuthConfig({ VITE_SUPABASE_URL: 'http://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST' }));
  assert.equal(decodeJwtPayload('invalid'), null);
  assert.equal(authRedirectUrl('http://localhost:5173'), 'http://localhost:5173/auth/callback');
  assert.equal(authRedirectUrl('https://project-game-ia.pages.dev'), 'https://project-game-ia.pages.dev/auth/callback');
  assert.throws(() => authRedirectUrl('http://127.0.0.1:5173'));
  assert.throws(() => authRedirectUrl('https://attacker.example'));
});

test('bases oficiais das APIs Supabase são normalizadas à origem sem alterar o ambiente recebido', () => {
  for (const api of ['auth', 'rest', 'storage', 'functions', 'realtime']) {
    for (const suffix of ['', '/']) {
      const url = `https://example.supabase.co/${api}/v1${suffix}`;
      const env = { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST_ONLY' };
      const config = readAuthConfig(env);
      assert.ok(config);
      assert.equal(config.url, 'https://example.supabase.co');
      assert.equal(config.storageKey, 'game-ia:auth:example.supabase.co:v1');
      assert.equal(config.key, env.VITE_SUPABASE_PUBLISHABLE_KEY);
      assert.equal(env.VITE_SUPABASE_URL, url);
    }
  }
});

test('normalização não aceita credenciais, parâmetros, fragmentos, hosts indevidos ou caminhos arbitrários', () => {
  for (const url of [
    'https://user:PASSWORD_SENTINEL@example.supabase.co/auth/v1',
    'https://example.supabase.co/rest/v1?apikey=PRIVATE_SENTINEL',
    'https://example.supabase.co/auth/v1#PRIVATE_SENTINEL',
    'https://example.supabase.co/auth/v1/admin',
    'https://example.supabase.co/auth/v1/callback',
    'https://example.supabase.co/rest/v1/players',
    'https://example.supabase.co/arbitrary',
    'https://example.supabase.co/rest%2Fv1',
    'https://example.supabase.co//rest/v1',
    'https://supabase.com/dashboard/project/example',
    'https://example.supabase.co.attacker.test/rest/v1',
    'https://custom.example.test/rest/v1',
    'https://example.supabase.co:8443/rest/v1',
    'http://example.supabase.co/rest/v1',
    'http://localhost:54321/auth/v1',
  ]) {
    assert.throws(() => readAuthConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST_ONLY' }), (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.equal(message.includes(url), false);
      assert.equal(message.includes('SENTINEL'), false);
      return /URL HTTPS/.test(message);
    });
  }
});

test('URLs raiz existentes continuam válidas, incluindo domínio customizado e Supabase local', () => {
  for (const [url, origin] of [
    ['https://example.supabase.co', 'https://example.supabase.co'],
    [' https://example.supabase.co/ ', 'https://example.supabase.co'],
    ['https://custom.example.test/', 'https://custom.example.test'],
    ['http://localhost:54321/', 'http://localhost:54321'],
    ['http://127.0.0.1:54321', 'http://127.0.0.1:54321'],
  ]) assert.equal(readAuthConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST_ONLY' })?.url, origin);
});

test('callback remove parâmetros sensíveis e preserva sb_flow_id do SDK para PKCE', () => {
  const replacements: string[] = [];
  const value = captureAuthReturn('http://localhost:5173/auth/callback?code=FAKE&sb_flow_id=flow_123456&next=https://attacker.example', (path) => replacements.push(path));
  assert.equal(value?.code, 'FAKE'); assert.equal(value?.flowId, 'flow_123456');
  assert.deepEqual(replacements, ['/']);
  assert.equal(captureAuthReturn('http://localhost:5173/', () => assert.fail()), null);
  assert.equal(captureAuthReturn('http://localhost:5173/auth/callback#access_token=FAKE', () => {})?.invalid, true);
  assert.equal(captureAuthReturn('http://localhost:5173/auth/callback?error_description=SECRET&error=access_denied', () => {})?.invalid, true);
});

test('validação distingue cadastro, login, confirmação e recuperação sem normalizar senha', () => {
  assert.equal(validateAuthFields('signup', { email: 'x', password: '12345678', confirmPassword: '12345678' })?.field, 'email');
  assert.equal(validateAuthFields('signup', { email: 'a@example.test', password: 'short', confirmPassword: 'short' })?.field, 'password');
  assert.equal(validateAuthFields('signup', { email: 'a@example.test', password: '12345678', confirmPassword: 'different' })?.field, 'confirmPassword');
  assert.equal(validateAuthFields('signin', { email: 'a@example.test', password: 'short' }), null);
  assert.equal(validateAuthFields('recovery', { email: 'a@example.test' }), null);
  assert.equal(validateAuthFields('new-password', { password: ' 12345678 ', confirmPassword: ' 12345678 ' }), null);
});

test('cadastro usa signUp e emailRedirectTo exato; não cria perfil, nickname ou Tamer', async () => {
  const { service, calls } = setup();
  assert.equal(await service.signUp('a@example.test', '12345678'), null);
  assert.deepEqual(calls.find(([name]) => name === 'signUp')![1], { email: 'a@example.test', password: '12345678', options: { emailRedirectTo: 'http://localhost:5173/auth/callback' } });
  assert.ok(calls.every(([name]) => ['getSession', 'signUp'].includes(name)));
});

test('login usa signInWithPassword e verifica usuário por getSession + getUser', async () => {
  const { service, calls } = setup();
  const state = await service.signIn('a@example.test', 'password');
  assert.equal(state?.user.id, 'user-a');
  assert.ok(calls.some(([name]) => name === 'getUser'));
  assert.equal(JSON.stringify(state).includes('access_token'), false);
});

test('sessão cacheada não é suficiente: falha de getUser e divergência A/B bloqueiam acesso', async () => {
  const { service, setSession, responses } = setup();
  setSession(fakeSession());
  responses.getUser = () => ({ data: { user: fakeSession('user-b').user }, error: null });
  await assert.rejects(service.verifiedSession(), { code: 'account-changed' });
  responses.getUser = () => ({ data: {}, error: { code: 'bad_jwt', message: 'PRIVATE_DETAIL' } });
  await assert.rejects(service.verifiedSession());
  assert.equal(authErrorMessage({ message: 'PRIVATE_DETAIL' }).includes('PRIVATE_DETAIL'), false);
});

test('getUser de A que termina após a sessão trocar para B não restaura A', async () => {
  const { service, setSession, responses } = setup();
  setSession(fakeSession());
  responses.getUser = () => {
    setSession(fakeSession('user-b'));
    return { data: { user: fakeSession().user }, error: null };
  };
  await assert.rejects(service.verifiedSession(), { code: 'account-changed' });
});

test('cadastro e recuperação neutralizam resposta de conta existente/inexistente', async () => {
  const { service, responses } = setup();
  responses.signUp = () => ({ data: {}, error: { code: 'user_already_exists', message: 'EXISTS' } });
  assert.equal(await service.signUp('a@example.test', 'password'), null);
  responses.resetPasswordForEmail = () => ({ data: {}, error: { code: 'user_not_found', message: 'ABSENT' } });
  await service.requestRecovery('a@example.test');
  assert.ok(CONFIRMATION_MESSAGE.startsWith('Se ')); assert.ok(RECOVERY_MESSAGE.startsWith('Se '));
  assert.match(authErrorMessage({ code: 'invalid_credentials' }), /Confira o e-mail e a senha/);
  assert.match(authErrorMessage({ status: 429 }), /Aguarde/);
});

test('OAuth e recuperação usam callback permitido; URL externa inesperada é recusada', async () => {
  const { service, calls, responses } = setup();
  assert.match(await service.googleUrl(), /^https:\/\/example.supabase.co\/auth\/v1\/authorize/);
  assert.deepEqual(calls.find(([name]) => name === 'signInWithOAuth')![1], { provider: 'google', options: { redirectTo: 'http://localhost:5173/auth/callback', skipBrowserRedirect: true } });
  await service.requestRecovery('a@example.test');
  assert.deepEqual(calls.find(([name]) => name === 'resetPasswordForEmail')![1], ['a@example.test', { redirectTo: 'http://localhost:5173/auth/callback' }]);
  responses.signInWithOAuth = () => ({ data: { url: 'https://attacker.example/' }, error: null });
  await assert.rejects(service.googleUrl(), { code: 'invalid-redirect' });
});

test('um único responsável troca código PKCE, inclusive chamadas simultâneas e sb_flow_id', async () => {
  const { service, calls } = setup();
  const value: AuthReturn = { code: 'FAKE', flowId: 'flow_123456', tokenHash: null, type: null, invalid: false };
  const [a, b] = await Promise.all([service.finishReturn(value), service.finishReturn(value)]);
  assert.deepEqual(a, b);
  assert.equal(calls.filter(([name]) => name === 'exchangeCodeForSession').length, 1);
  assert.deepEqual(calls.find(([name]) => name === 'exchangeCodeForSession')![1], ['FAKE', { flowId: 'flow_123456' }]);
  await assert.rejects(service.finishReturn(value), { code: 'return-used' });
});

test('lock compartilhado entre callbacks impede uma segunda troca em outra instância/aba', async () => {
  const fake = fakeAuthClient();
  let queue: Promise<unknown> = Promise.resolve();
  const withCallbackLock = <T,>(operation: () => Promise<T>): Promise<T> => {
    const pending = queue.then(operation); queue = pending.catch(() => {}); return pending;
  };
  const options = { ...fake, origin: 'http://localhost:5173', projectUrl: 'https://example.supabase.co', withCallbackLock };
  const first = createAuthService(options); const second = createAuthService(options);
  const results = await Promise.allSettled([first.finishReturn({ code: 'FAKE', flowId: null, tokenHash: null, type: null, invalid: false }), second.finishReturn({ code: 'FAKE', flowId: null, tokenHash: null, type: null, invalid: false })]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(fake.calls.filter(([name]) => name === 'exchangeCodeForSession').length, 1);
});

test('callback não substitui uma sessão já existente, nem aceita tipo de OTP arbitrário', async () => {
  const active = setup(); active.setSession(fakeSession());
  await assert.rejects(active.service.finishReturn({ code: 'FAKE', flowId: null, tokenHash: null, type: null, invalid: false }), { code: 'already-signed-in' });
  assert.equal(active.calls.some(([name]) => name === 'exchangeCodeForSession'), false);
  const invalid = setup();
  await assert.rejects(invalid.service.finishReturn({ code: null, flowId: null, tokenHash: 'FAKE', type: 'invite', invalid: false }));
  assert.equal(invalid.calls.some(([name]) => name === 'verifyOtp'), false);
});

test('recuperação exige retorno validado e usuário correspondente antes de updateUser', async () => {
  const { service, calls, responses, setSession, metadata } = setup();
  await assert.rejects(service.updatePassword('user-a', 'new-password'), { code: 'recovery-required' });
  responses.exchangeCodeForSession = () => {
    const session = fakeSession(); setSession(session);
    return { data: { session, user: session.user, redirectType: 'recovery' }, error: null };
  };
  const returned = await service.finishReturn({ code: 'FAKE', flowId: null, tokenHash: null, type: null, invalid: false });
  assert.equal(returned.recovery, true);
  assert.equal(metadata.recoveryUser(), 'user-a');
  setSession(fakeSession('user-b'));
  await assert.rejects(service.updatePassword('user-a', 'new-password'), { code: 'account-changed' });
  assert.equal(calls.some(([name]) => name === 'updatePassword'), false);
  setSession(fakeSession());
  await service.updatePassword('user-a', 'new-password');
  assert.deepEqual(calls.find(([name]) => name === 'updatePassword')![1], ['user-a', 'new-password']);
  assert.equal(metadata.recoveryUser(), null);
});

test('token_hash de recovery é verificado oficialmente; links inválidos não criam sessão', async () => {
  const { service, calls } = setup();
  const result = await service.finishReturn({ code: null, flowId: null, tokenHash: 'FAKE', type: 'recovery', invalid: false });
  assert.equal(result.recovery, true);
  assert.deepEqual(calls.find(([name]) => name === 'verifyOtp')![1], { token_hash: 'FAKE', type: 'recovery' });
  const other = setup();
  await assert.rejects(other.service.finishReturn({ code: null, flowId: null, tokenHash: null, type: null, invalid: true }));
  assert.equal(other.calls.length, 0);
});

test('logout local preserva saves e sinaliza falha sem limpar armazenamento inteiro', async () => {
  const { service, storage, responses, metadata, calls } = setup();
  storage.setItem('game-ia:tamer', 'SAVE_INTACTO');
  responses.signOut = () => ({ error: { status: 503 } });
  await assert.rejects(service.signOut());
  assert.equal(metadata.logoutPending(), true);
  delete responses.signOut;
  await service.signOut();
  assert.equal(metadata.logoutPending(), false);
  assert.equal(storage.getItem('game-ia:tamer'), 'SAVE_INTACTO');
  assert.deepEqual(calls.find(([name]) => name === 'signOut')![1], { scope: 'local' });
});

test('metadados não contêm tokens/senhas; autorização de recuperação expira', () => {
  let now = 1000;
  const storage = memoryAuthStorage();
  const metadata = createAuthMetadata(storage, 'game-ia:auth:test', () => now);
  metadata.setRecovery('user-a'); assert.equal(metadata.recoveryUser(), 'user-a');
  now += 15 * 60 * 1000 + 1; assert.equal(metadata.recoveryUser(), null);
  assert.equal([...storage.values.values()].join().includes('token'), false);
});

test('listener é leve, adia trabalho e remove inscrição/timers ao encerrar', async () => {
  const { service, emit } = setup(); const events: Array<[string, string | null]> = [];
  const unsubscribe = service.subscribe((event, userId) => events.push([event, userId]));
  emit('SIGNED_IN', fakeSession()); assert.deepEqual(events, []);
  await sleep(10); assert.deepEqual(events, [['SIGNED_IN', 'user-a']]);
  emit('SIGNED_OUT', null); unsubscribe(); await sleep(10);
  assert.equal(events.length, 1);
});
