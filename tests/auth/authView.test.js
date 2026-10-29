import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import AuthView from '../../src/ui/AuthView.ts';

const template = await readFile(new URL('../../src/ui/authScreen.html', import.meta.url), 'utf8');

function setup(t, options) {
  const window = new Window({ url: 'http://localhost:5173' });
  const root = window.document.createElement('div'); window.document.body.append(root);
  const view = new AuthView(root, { template, ...options });
  t.after(() => { view.destroy(); window.happyDOM.abort(); });
  return { view, nodes: view.nodes, window, root };
}

test('mesmo formulário alterna login/cadastro/recuperação com labels, required e autocomplete corretos', (t) => {
  const { view, nodes, root } = setup(t);
  view.render({ mode: 'signin' }); assert.equal(nodes['auth-confirm-field'].hidden, true);
  assert.equal(nodes['auth-password'].autocomplete, 'current-password');
  view.render({ mode: 'signup' }); assert.equal(nodes['auth-confirm-field'].hidden, false); assert.equal(nodes['auth-confirm'].required, true);
  assert.equal(nodes['auth-password'].autocomplete, 'new-password');
  assert.equal(nodes['auth-tab-signup'].getAttribute('aria-selected'), 'true');
  view.render({ mode: 'recovery' }); assert.equal(nodes['auth-password-field'].hidden, true); assert.equal(nodes['auth-password'].disabled, true);
  assert.equal(nodes['auth-google-section'].hidden, true);
  view.render({ mode: 'new-password', user: { email: 'a@example.test' } });
  assert.equal(nodes['auth-email-field'].hidden, true); assert.equal(nodes['auth-email'].disabled, true);
  assert.equal(nodes['auth-cancel-recovery'].hidden, false);
  assert.equal(root.querySelectorAll('#auth-form').length, 1);
});

test('inputs e abas chamam os casos de uso; setas permitem navegar por teclado', (t) => {
  const { view, nodes, window } = setup(t); const modes = []; let values;
  view.bind({ navigate: (mode) => modes.push(mode), submit: (fields) => { values = fields; } });
  view.render({ mode: 'signin' });
  nodes['auth-tab-signup'].click(); nodes['auth-forgot'].click();
  nodes['auth-tab-signin'].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.deepEqual(modes, ['signup', 'recovery', 'signup']);
  nodes['auth-email'].value = 'a@example.test'; nodes['auth-password'].value = 'not-logged';
  nodes['auth-form'].dispatchEvent(new window.Event('submit', { cancelable: true }));
  assert.equal(values.email, 'a@example.test');
});

test('loading impede ações e mudança de modo/conta elimina senhas e dados da identidade anterior', (t) => {
  const { view, nodes } = setup(t); view.render({ mode: 'signin' }); nodes['auth-password'].value = 'NEVER_STORE';
  nodes['auth-password-toggle'].click(); assert.equal(nodes['auth-password'].type, 'text');
  view.render({ mode: 'signup', busy: true });
  assert.equal(nodes['auth-password'].value, ''); assert.equal(nodes['auth-password'].type, 'password');
  assert.equal(nodes['auth-submit'].disabled, true); assert.equal(nodes['auth-tab-signin'].disabled, true);
  nodes['auth-email'].value = 'a@example.test'; view.render({ mode: 'authenticated', user: { email: 'a@example.test' } });
  view.clearIdentity(); assert.equal(nodes['auth-email'].value, ''); assert.equal(nodes['auth-user-email'].textContent, '');
});

test('erros acessíveis apontam o campo e mensagens/identidade não injetam HTML', (t) => {
  const { view, nodes, root } = setup(t); view.render({ mode: 'signup' });
  view.fieldError({ field: 'confirmPassword', message: '<img src=x onerror=alert(1)>' });
  assert.equal(nodes['auth-confirm'].getAttribute('aria-invalid'), 'true');
  assert.equal(nodes['auth-message'].getAttribute('role'), 'alert'); assert.equal(root.querySelector('img'), null);
  view.render({ mode: 'authenticated', user: { email: '<script>bad()</script>' } }); assert.equal(root.querySelector('script'), null);
});

test('configuração ausente é explícita, sem simular conexão; logout-error e recuperação ocultam painel adequado', (t) => {
  const { view, nodes, root } = setup(t, { configured: false }); view.render({ mode: 'signin' });
  assert.equal(nodes['auth-configuration'].hidden, false); assert.equal(nodes['auth-submit'].disabled, true); assert.equal(nodes['auth-google'].disabled, true);
  view.render({ mode: 'authenticated', user: { email: 'a@example.test' } }); assert.equal(nodes['auth-entry'].hidden, false); assert.equal(nodes['auth-form-panel'].hidden, true);
  view.render({ mode: 'logout-error' }); assert.equal(nodes['auth-retry-logout'].hidden, false); assert.equal(nodes['auth-form-panel'].hidden, true);
});
