import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeGameEntry, validateGameInput } from '../../src/games/catalogService.ts';

test('linhas inválidas vindas do banco são descartadas antes do uso', () => {
  assert.equal(normalizeGameEntry(null), null);
  assert.equal(normalizeGameEntry('linha'), null);
  assert.equal(normalizeGameEntry({ id: 1, slug: 'ok', title: 't', description: '', entry: '', available: true }), null);
  assert.equal(normalizeGameEntry({ id: 'x', slug: 'Slug Inválido!', title: 't', description: '', entry: '', available: true }), null);
  assert.equal(normalizeGameEntry({ id: 'x', slug: 'ok', title: 't', description: '', entry: '', available: 'sim' }), null);
  assert.equal(normalizeGameEntry({ id: 'x', slug: 'ok', title: 't', description: '', entry: '' }), null);
});

test('linhas válidas viram GameEntry com trim e sort_order padrão', () => {
  assert.deepEqual(
    normalizeGameEntry({
      id: 'uuid-1',
      slug: 'meu-jogo',
      title: '  Meu Jogo ',
      description: ' resumo curto ',
      entry: '/jogos/meu-jogo/',
      available: true,
      sort_order: 3,
    }),
    { id: 'uuid-1', slug: 'meu-jogo', title: 'Meu Jogo', description: 'resumo curto', entry: '/jogos/meu-jogo/', available: true, sortOrder: 3 },
  );
  assert.equal(normalizeGameEntry({ id: 'uuid-2', slug: 'outro', title: 'Outro', description: '', entry: '', available: false })?.sortOrder, 0);
});

test('validação do formulário admin exige slug amigável e títulos dentro do limite', () => {
  assert.equal(validateGameInput({ slug: 'Meu Jogo!', title: 'Ok' })?.field, 'slug');
  assert.equal(validateGameInput({ slug: 'ok', title: '' })?.field, 'title');
  assert.equal(validateGameInput({ slug: 'ok', title: 'x'.repeat(81) })?.field, 'title');
  assert.equal(validateGameInput({ slug: 'ok', title: 'Ok', description: 'x'.repeat(281) })?.field, 'description');
  assert.equal(validateGameInput({ slug: 'ok', title: 'Ok', entry: 'javascript:alert(1)' })?.field, 'entry');
  assert.equal(validateGameInput({ slug: 'ok', title: 'Ok', entry: '/jogos/ok/' }), null);
  assert.equal(validateGameInput({ slug: 'ok', title: 'Ok', entry: 'https://jogos.example.com/ok/' }), null);
  assert.equal(validateGameInput({ slug: 'ok', title: 'Ok' }), null);
});

test('patch parcial (edição) só valida o que foi enviado', () => {
  const options = { requireAll: false };
  assert.equal(validateGameInput({ slug: '??' }, options)?.field, 'slug');
  assert.equal(validateGameInput({ title: 'Só o título' }, options), null);
  assert.equal(validateGameInput({}, options), null);
});
