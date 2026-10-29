import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeAuthClient, fakeSession } from '../helpers/fakeAuth.ts';
import { createAuthService } from '../../src/auth/authService.ts';
import AuthController from '../../src/auth/AuthController.ts';
import type { AuthFieldError, AuthViewState } from '../../src/types/auth.ts';

interface TestLike {
  after(fn: () => void): void;
}

interface FakeView {
  error?: AuthFieldError;
  redirect: string;
  render(state: AuthViewState): void;
  clearPasswords(): void;
  clearIdentity(): void;
  fieldError(error: AuthFieldError): void;
}

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createView(): FakeView {
  const view: FakeView = {
    redirect: '',
    render() {},
    clearPasswords() {},
    clearIdentity() {},
    fieldError(error) {
      view.error = error;
    },
  };
  return view;
}

function setup(t: TestLike) {
  const fake = fakeAuthClient();
  const view = createView();
  const service = createAuthService({ ...fake, origin: 'http://localhost:5173', projectUrl: 'https://example.supabase.co' });
  const controller = new AuthController({ service, view, navigateExternal: (url) => { view.redirect = url; } });
  t.after(() => controller.destroy());
  return { ...fake, controller, service, view };
}

test('estado sem sessão oferece login/cadastro/recuperação; não permite abrir nova senha pela navegação', async (t) => {
  const { controller } = setup(t); await controller.start();
  assert.equal(controller.state.mode, 'signin');
  controller.navigate('signup'); assert.equal(controller.state.mode, 'signup');
  controller.navigate('recovery'); assert.equal(controller.state.mode, 'recovery');
  controller.navigate('new-password'); assert.equal(controller.state.mode, 'recovery');
});

test('cadastro válido fica aguardando confirmação sem criar sessão', async (t) => {
  const { controller } = setup(t); await controller.start(); controller.navigate('signup');
  await controller.submit({ email: 'a@example.test', password: '12345678', confirmPassword: '12345678' });
  assert.equal(controller.state.mode, 'confirmation'); assert.equal(controller.state.user, null);
});

test('validação não chama SDK e loading bloqueia submissão duplicada', async (t) => {
  const { controller, calls, responses, view } = setup(t); await controller.start();
  await controller.submit({ email: 'invalid', password: '' }); assert.equal(view.error?.field, 'email');
  const pending = deferred();
  responses.signInWithPassword = () => pending.promise;
  const first = controller.submit({ email: 'a@example.test', password: '12345678' });
  await controller.submit({ email: 'a@example.test', password: '12345678' });
  pending.resolve({ data: {}, error: { code: 'invalid_credentials' } }); await first;
  assert.equal(calls.filter(([name]) => name === 'signInWithPassword').length, 1);
  assert.equal(controller.state.busy, false); assert.equal(controller.state.mode, 'signin');
});

test('sessão restaurada é validada e entra no estado autenticado', async (t) => {
  const { controller, setSession } = setup(t); setSession(fakeSession()); await controller.start();
  assert.equal(controller.state.mode, 'authenticated'); assert.equal(controller.state.user?.id, 'user-a');
});

test('logout e troca A/B descartam identidade anterior', async (t) => {
  const { controller, setSession } = setup(t); setSession(fakeSession()); await controller.start();
  setSession(fakeSession('user-b')); controller.onAuthEvent('SIGNED_IN', 'user-b');
  // Comparação solta para não estreitar o tipo de `state.user` via asserts do assert.equal.
  assert.equal(controller.state.user == null, true);
  await controller.refresh(); assert.equal(controller.state.user?.id, 'user-b');
  await controller.logout(); assert.equal(controller.state.mode, 'signin'); assert.equal(controller.state.user, null);
});

test('resposta iniciada para A não reconecta depois de SIGNED_OUT', async (t) => {
  const { controller, responses, setSession } = setup(t); setSession(fakeSession()); await controller.start();
  const pending = deferred(); responses.getUser = () => pending.promise;
  controller.onAuthEvent('SIGNED_OUT', null);
  pending.resolve({ data: { user: fakeSession().user }, error: null }); await pending.promise;
  assert.equal(controller.state.mode, 'signin'); assert.equal(controller.state.user, null);
});

test('recuperação tem prioridade sobre sessão restaurada e só libera nova senha para o dono', async (t) => {
  const { controller, setSession, metadata } = setup(t); setSession(fakeSession()); metadata.setRecovery('user-a');
  await controller.start(); assert.equal(controller.state.mode, 'new-password');
  await controller.submit({ password: 'new-password', confirmPassword: 'new-password' });
  assert.equal(controller.state.mode, 'signin'); assert.match(controller.state.message, /Senha atualizada/); assert.equal(metadata.recoveryUser(), null);
});

test('callback inválido não entra e erro bruto não aparece', async (t) => {
  const { controller, responses } = setup(t);
  responses.exchangeCodeForSession = () => ({ data: {}, error: { message: 'PASSWORD_TOKEN_PRIVATE', code: 'otp_expired' } });
  await controller.start({ code: 'FAKE', flowId: null, tokenHash: null, type: null, invalid: false });
  assert.equal(controller.state.mode, 'callback-error'); assert.equal(controller.state.user, null);
  assert.match(controller.state.message, /Link inválido/); assert.equal(controller.state.message.includes('PRIVATE'), false);
});

test('sessão cacheada sem validação pode ser recuperada ou encerrada sem bloquear o usuário no login', async (t) => {
  const { controller, setSession, responses } = setup(t); setSession(fakeSession());
  responses.getUser = () => ({ data: {}, error: { status: 503 } });
  await controller.start(); assert.equal(controller.state.mode, 'session-error'); assert.equal(controller.state.user, null);
  delete responses.getUser; await controller.refresh(); assert.equal(controller.state.mode, 'authenticated');
  responses.getUser = () => ({ data: {}, error: { status: 503 } });
  await controller.refresh(); await controller.logout(); assert.equal(controller.state.mode, 'signin');
});

test('falha de logout bloqueia entrada e oferece retry; reload pendente tenta sair antes de restaurar', async (t) => {
  const { controller, setSession, responses, metadata } = setup(t); setSession(fakeSession()); await controller.start();
  responses.signOut = () => ({ error: { status: 503 } }); await controller.logout();
  assert.equal(controller.state.mode, 'logout-error'); assert.equal(metadata.logoutPending(), true); assert.equal(controller.state.user, null);
  delete responses.signOut; await controller.logout(); assert.equal(controller.state.mode, 'signin');
  const other = setup(t); other.setSession(fakeSession()); other.metadata.setLogoutPending(true); await other.controller.start();
  assert.equal(other.controller.state.mode, 'signin'); assert.equal(other.controller.state.user, null);
});
