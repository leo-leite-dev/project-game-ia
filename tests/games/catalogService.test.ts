import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCatalogService, MAX_COVER_BYTES, normalizeGameRecord, validateGameInput } from '../../src/games/catalogService.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

test('linhas inválidas vindas do banco são descartadas antes do uso', () => {
  assert.equal(normalizeGameRecord(null), null);
  assert.equal(normalizeGameRecord('linha'), null);
  assert.equal(normalizeGameRecord({ id: 1, slug: 'ok', title: 't', description: '', entry: '', available: true }), null);
  assert.equal(normalizeGameRecord({ id: 'x', slug: 'Slug Inválido!', title: 't', description: '', entry: '', available: true }), null);
  assert.equal(normalizeGameRecord({ id: 'x', slug: 'ok', title: 't', description: '', entry: '', available: 'sim' }), null);
  assert.equal(normalizeGameRecord({ id: 'x', slug: 'ok', title: 't', description: '', entry: '' }), null);
});

test('linhas válidas viram GameRecord com trim, sort_order e capa seguros', () => {
  assert.deepEqual(
    normalizeGameRecord({
      id: 'uuid-1',
      slug: 'meu-jogo',
      title: '  Meu Jogo ',
      description: ' resumo curto ',
      entry: '/jogos/meu-jogo/',
      available: true,
      sort_order: 3,
      cover_path: 'capa-uuid.png',
    }),
    {
      id: 'uuid-1',
      slug: 'meu-jogo',
      title: 'Meu Jogo',
      description: 'resumo curto',
      entry: '/jogos/meu-jogo/',
      available: true,
      sortOrder: 3,
      coverPath: 'capa-uuid.png',
    },
  );
  // Linha sem coluna de capa ou com valor não-string nunca vira caminho.
  assert.equal(normalizeGameRecord({ id: 'uuid-2', slug: 'outro', title: 'Outro', description: '', entry: '', available: false })?.coverPath, '');
  assert.equal(normalizeGameRecord({ id: 'uuid-3', slug: 'outro-2', title: 'Outro', description: '', entry: '', available: false, cover_path: 42 })?.coverPath, '');
  assert.equal(
    normalizeGameRecord({ id: 'uuid-4', slug: 'outro-3', title: 'Outro', description: '', entry: '', available: false, cover_path: 'x'.repeat(301) })?.coverPath,
    '',
  );
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

/** Duplo mínimo do cliente: só o sub-sistema de Storage é exercitado. */
function fakeStorageClient() {
  const uploads: { bucket: string; path: string; type: string }[] = [];
  const removes: string[][] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, file: File) {
            uploads.push({ bucket, path, type: file.type });
            return { data: { path }, error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` } };
          },
          async remove(paths: string[]) {
            removes.push(paths);
            return { data: paths, error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  return { client, uploads, removes };
}

test('upload de capa valida tipo e tamanho ANTES de tocar o Storage', async () => {
  const { client, uploads } = fakeStorageClient();
  const service = createCatalogService(client);
  await assert.rejects(service.uploadCover(new File(['x'], 'documento.pdf', { type: 'application/pdf' })), /PNG, JPEG, WebP, GIF ou AVIF/);
  await assert.rejects(
    service.uploadCover(new File([new Uint8Array(MAX_COVER_BYTES + 1)], 'capa.png', { type: 'image/png' })),
    /5 MB/,
  );
  assert.equal(uploads.length, 0, 'nenhuma chamada ao Storage em validação falha');
});

test('upload de capa aceita imagem válida e devolve caminho com extensão do MIME', async () => {
  const { client, uploads } = fakeStorageClient();
  const service = createCatalogService(client);
  const path = await service.uploadCover(new File([new Uint8Array(16)], 'capa.jpg', { type: 'image/jpeg' }));
  assert.match(path, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].bucket, 'game-covers');
  assert.equal(uploads[0].type, 'image/jpeg');
});

test('erro "Bucket not found" vira orientacao clara para rodar a migracao', async () => {
  const client = {
    storage: {
      from: () => ({
        async upload() {
          return { data: null, error: { message: 'Bucket not found' } };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x/${path}` } }),
        async remove() {
          return { data: null, error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const service = createCatalogService(client);
  await assert.rejects(
    service.uploadCover(new File(['x'], 'capa.png', { type: 'image/png' })),
    /20261029210000_game_covers\.sql/,
  );
});
