// Segurança da capa em duas camadas, mesmo padrão da migração do catálogo:
//   1) CONTRATO DA MIGRAÇÃO: coluna, bucket e policies do SQL verificados
//      textualmente — a autoridade real é o banco (RLS + limites do bucket).
//   2) COMPORTAMENTO DO APP: verificado em tests/games/catalogService.test.ts
//      (validação de tipo/tamanho) e tests/supabase/catalogAccess.test.ts
//      (URL pública e limpeza de arquivo).
// Nenhum destes testes acessa Supabase remoto.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const sql = await readFile(new URL('../../supabase/migrations/20261029210000_game_covers.sql', import.meta.url), 'utf8');

function policyBlock(name: string): string {
  const match = sql.match(new RegExp(`create policy "${name}"[\\s\\S]*?;`));
  assert.ok(match, `policy "${name}" presente na migração`);
  return match[0];
}

test('coluna cover_path existe, é texto com default vazio e limite de tamanho', () => {
  assert.match(sql, /add column if not exists cover_path text not null default ''/);
  assert.match(sql, /check \(char_length\(cover_path\) <= 300\)/);
});

test('bucket game-covers é público para leitura com limite de 5 MB e MIMEs de imagem', () => {
  assert.match(sql, /insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\)/);
  assert.match(sql, /'game-covers'/);
  assert.match(sql, /5242880/, 'file_size_limit = 5 MB no servidor');
  for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']) {
    assert.ok(sql.includes(`'${mime}'`), `MIME permitido ${mime}`);
  }
  assert.equal(/'application\/pdf'/.test(sql), false, 'nenhum MIME de arquivo não-imagem');
});

test('leitura de capa é pública e restrita ao bucket', () => {
  const read = policyBlock('capas_leitura_publica');
  assert.match(read, /for select/);
  assert.match(read, /to anon, authenticated/);
  assert.match(read, /using \(bucket_id = 'game-covers'\)/);
  assert.equal(/using \(true\)/.test(read), false, 'sem USING (true) na policy de capa');
});

test('escrita de capa só de admin, só no bucket, só imagem (insert)', () => {
  const insert = policyBlock('somente_admin_envia_capa');
  assert.match(insert, /for insert/);
  assert.match(insert, /to authenticated/);
  assert.match(insert, /bucket_id = 'game-covers'/);
  assert.match(insert, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'\) = 'admin'/);
  assert.match(insert, /storage\.extension\(name\)/);
  assert.match(insert, /'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'/);
});

test('atualização e exclusão de capa também exigem admin (using + with check)', () => {
  const update = policyBlock('somente_admin_atualiza_capa');
  assert.match(update, /for update/);
  assert.match(update, /using \([\s\S]*bucket_id = 'game-covers'[\s\S]*'admin'[\s\S]*\)/);
  assert.match(update, /with check \([\s\S]*bucket_id = 'game-covers'[\s\S]*'admin'[\s\S]*\)/);
  const remove = policyBlock('somente_admin_apaga_capa');
  assert.match(remove, /for delete/);
  assert.match(remove, /'admin'/);
  assert.match(remove, /bucket_id = 'game-covers'/);
});

test('nenhuma policy de objetos com USING (true) e anon sem grant de escrita', () => {
  assert.equal(/using \(true\)/i.test(sql), false);
  assert.match(sql, /revoke all on storage\.objects from anon/);
  assert.match(sql, /grant select on storage\.objects to anon, authenticated/);
  assert.match(sql, /grant insert, update, delete on storage\.objects to authenticated/);
  assert.equal(/grant (insert|update|delete|truncate)[^;]*to anon/i.test(sql), false, 'anon sem grant de escrita');
});
