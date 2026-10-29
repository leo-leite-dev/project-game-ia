import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Window, type HTMLElement as HappyElement } from 'happy-dom';
import AuthView, { type AuthViewOptions } from '../../src/ui/AuthView.ts';

const template = await readFile(new URL('../../src/ui/authScreen.html', import.meta.url), 'utf8');

interface TestLike {
  after(fn: () => void): void;
}

// O happy-dom fornece o DOM do teste; os elementos são convertidos para os
// tipos da lib DOM apenas na leitura de propriedades.
function node(root: HappyElement, id: string): HappyElement {
  const found = root.ownerDocument.getElementById(id);
  assert.ok(found, `elemento #${id} presente no template`);
  return found as HappyElement;
}

const el = (root: HappyElement, id: string): HTMLElement => node(root, id) as unknown as HTMLElement;
const input = (root: HappyElement, id: string): HTMLInputElement => node(root, id) as unknown as HTMLInputElement;
const button = (root: HappyElement, id: string): HTMLButtonElement => node(root, id) as unknown as HTMLButtonElement;

function setup(t: TestLike, options?: Partial<Omit<AuthViewOptions, 'template'>>) {
  const window = new Window({ url: 'http://localhost:5173' });
  const root = window.document.createElement('div');
  window.document.body.append(root);
  const view = new AuthView(root as unknown as HTMLElement, { template, ...options });
  t.after(() => {
    view.destroy();
    window.happyDOM.abort();
  });
  return { view, window, root };
}

test('mesmo formulário alterna login/cadastro/recuperação com labels, required e autocomplete corretos', (t) => {
  const { view, root } = setup(t);
  view.render({ mode: 'signin' }); assert.equal(el(root, 'auth-confirm-field').hidden, true);
  assert.equal(input(root, 'auth-password').autocomplete, 'current-password');
  view.render({ mode: 'signup' }); assert.equal(el(root, 'auth-confirm-field').hidden, false); assert.equal(input(root, 'auth-confirm').required, true);
  assert.equal(input(root, 'auth-password').autocomplete, 'new-password');
  assert.equal(button(root, 'auth-tab-signup').getAttribute('aria-selected'), 'true');
  view.render({ mode: 'recovery' }); assert.equal(el(root, 'auth-password-field').hidden, true); assert.equal(input(root, 'auth-password').disabled, true);
  assert.equal(el(root, 'auth-google-section').hidden, true);
  view.render({ mode: 'new-password', user: { id: 'user-a', email: 'a@example.test', provider: 'email', role: 'member' } });
  assert.equal(el(root, 'auth-email-field').hidden, true); assert.equal(input(root, 'auth-email').disabled, true);
  assert.equal(el(root, 'auth-cancel-recovery').hidden, false);
  assert.equal(root.querySelectorAll('#auth-form').length, 1);
});

test('inputs e abas chamam os casos de uso; setas permitem navegar por teclado', (t) => {
  const { view, root, window } = setup(t); const modes: string[] = []; let values: { email?: string } | undefined;
  view.bind({ navigate: (mode) => modes.push(mode), submit: (fields) => { values = fields; } });
  view.render({ mode: 'signin' });
  node(root, 'auth-tab-signup').click(); node(root, 'auth-forgot').click();
  node(root, 'auth-tab-signin').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.deepEqual(modes, ['signup', 'recovery', 'signup']);
  input(root, 'auth-email').value = 'a@example.test'; input(root, 'auth-password').value = 'not-logged';
  node(root, 'auth-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  assert.equal(values?.email, 'a@example.test');
});

test('loading impede ações e mudança de modo/conta elimina senhas e dados da identidade anterior', (t) => {
  const { view, root } = setup(t); view.render({ mode: 'signin' }); input(root, 'auth-password').value = 'NEVER_STORE';
  node(root, 'auth-password-toggle').click(); assert.equal(input(root, 'auth-password').type, 'text');
  view.render({ mode: 'signup', busy: true });
  assert.equal(input(root, 'auth-password').value, ''); assert.equal(input(root, 'auth-password').type, 'password');
  assert.equal(button(root, 'auth-submit').disabled, true); assert.equal(button(root, 'auth-tab-signin').disabled, true);
  input(root, 'auth-email').value = 'a@example.test'; view.render({ mode: 'authenticated', user: { id: 'user-a', email: 'a@example.test', provider: 'email', role: 'member' } });
  view.clearIdentity(); assert.equal(input(root, 'auth-email').value, ''); assert.equal(el(root, 'auth-user-email').textContent, '');
});

test('erros acessíveis apontam o campo e mensagens/identidade não injetam HTML', (t) => {
  const { view, root } = setup(t); view.render({ mode: 'signup' });
  view.fieldError({ field: 'confirmPassword', message: '<img src=x onerror=alert(1)>' });
  assert.equal(input(root, 'auth-confirm').getAttribute('aria-invalid'), 'true');
  assert.equal(el(root, 'auth-message').getAttribute('role'), 'alert'); assert.equal(root.querySelector('img'), null);
  view.render({ mode: 'authenticated', user: { id: 'user-a', email: '<script>bad()</script>', provider: 'email', role: 'member' } }); assert.equal(root.querySelector('script'), null);
});

test('configuração ausente é explícita, sem simular conexão; logout-error e recuperação ocultam painel adequado', (t) => {
  const { view, root } = setup(t, { configured: false }); view.render({ mode: 'signin' });
  assert.equal(el(root, 'auth-configuration').hidden, false); assert.equal(button(root, 'auth-submit').disabled, true); assert.equal(button(root, 'auth-google').disabled, true);
  view.render({ mode: 'authenticated', user: { id: 'user-a', email: 'a@example.test', provider: 'email', role: 'member' } }); assert.equal(el(root, 'auth-entry').hidden, false); assert.equal(el(root, 'auth-form-panel').hidden, true);
  view.render({ mode: 'logout-error' }); assert.equal(el(root, 'auth-retry-logout').hidden, false); assert.equal(el(root, 'auth-form-panel').hidden, true);
});

test('painel admin só aparece para conta com papel admin e lista os jogos', (t) => {
  const { view, root } = setup(t);
  view.render({
    mode: 'authenticated',
    user: { id: 'user-a', email: 'a@example.test', provider: 'email', role: 'member' },
    games: [{ id: 'g1', slug: 'jogo-um', title: 'Jogo Um', description: '', entry: '/jogos/jogo-um/', available: true, sortOrder: 0 }],
    adminGames: [{ id: 'g1', slug: 'jogo-um', title: 'Jogo Um', description: '', entry: '/jogos/jogo-um/', available: true, sortOrder: 0 }],
  });
  // Membro: o painel admin NEM FICA no DOM (removido da árvore) e a cópia é de jogador.
  assert.equal(root.querySelector('#auth-admin'), null);
  assert.equal(el(root, 'auth-games-list').children.length, 1);
  assert.equal(el(root, 'auth-role-badge').textContent, 'PAPEL: MEMBRO');
  assert.equal(el(root, 'auth-progress-title').textContent, 'Sua coleção está esquentando.');
  assert.match(el(root, 'auth-progress-copy').textContent ?? '', /progresso fica salvo na sua conta/);
  view.render({
    mode: 'authenticated',
    user: { id: 'user-a', email: 'a@example.test', provider: 'email', role: 'admin' },
    games: [{ id: 'g1', slug: 'jogo-um', title: 'Jogo Um', description: '', entry: '/jogos/jogo-um/', available: true, sortOrder: 0 }],
    adminGames: [
      { id: 'g1', slug: 'jogo-um', title: 'Jogo Um', description: '', entry: '/jogos/jogo-um/', available: true, sortOrder: 0 },
      { id: 'g2', slug: 'rascunho', title: 'Rascunho', description: '', entry: '', available: false, sortOrder: 0 },
    ],
    catalogMessage: 'Jogo salvo no catálogo.',
  });
  assert.notEqual(root.querySelector('#auth-admin'), null);
  assert.equal(el(root, 'auth-admin-list').children.length, 2);
  assert.equal(el(root, 'auth-admin-message').textContent, 'Jogo salvo no catálogo.');
  assert.equal(el(root, 'auth-games-list').querySelector('a.auth-game-play')?.getAttribute('href'), '/jogos/jogo-um/');
  assert.equal(el(root, 'auth-role-badge').textContent, 'PAPEL: ADMIN');
  assert.equal(el(root, 'auth-progress-title').textContent, 'Seus jogos, em breve.');
  // Volta a modo comum: o painel sai do DOM novamente.
  view.render({
    mode: 'signin',
    user: null,
  });
  assert.equal(root.querySelector('#auth-admin'), null);
  assert.equal(el(root, 'auth-role-badge').hidden, true);
});

test('dashboard renderiza apenas jogos publicados recebidos, busca e preserva o player ao trocar de tela', (t) => {
  const { view, root, window } = setup(t);
  const user = { id: 'user-a', email: 'jogador@example.test', provider: 'email', role: 'member' as const };
  view.render({
    mode: 'authenticated', user,
    games: [
      { id: 'g1', slug: 'rota-neon', title: 'Rota Neon', description: 'Jogo cadastrado', entry: '/jogos/rota-neon/', available: true, sortOrder: 0 },
      { id: 'g2', slug: 'rascunho', title: 'Rascunho', description: 'Não publicado', entry: '', available: false, sortOrder: 1 },
    ],
  });
  assert.equal(el(root, 'dashboard-feature-title').textContent, 'Rota Neon');
  assert.equal(el(root, 'dashboard-published-count').textContent, '1');
  assert.equal(el(root, 'auth-games-list').children.length, 1);
  const futureNav = root.querySelector('.dashboard-sidebar button.dashboard-nav-item') as unknown as HTMLButtonElement;
  assert.equal(futureNav.disabled, true);
  assert.equal(root.querySelector('#auth-admin'), null);
  assert.ok(node(root, 'dashboard-audio-slot').querySelector('#auth-audio-toggle'));
  input(root, 'dashboard-search').value = 'inexistente';
  node(root, 'dashboard-search').dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(el(root, 'auth-games-list').children.length, 0);
  assert.equal(el(root, 'auth-games-empty').textContent, 'Nenhum jogo corresponde à busca.');
  view.render({ mode: 'signin' });
  assert.ok(node(root, 'auth-footer-audio-slot').querySelector('#auth-audio-toggle'));
});
