// Segurança do catálogo em duas camadas:
//   1) CONTRATO DA MIGRAÇÃO: as policies/grants/trigger do SQL são
//      verificados textualmente — autoridade real é o banco (RLS).
//   2) CENÁRIOS DE ACESSO: o serviço real roda contra um duplo do
//      PostgREST que SIMULA o RLS (leitura de rascunho bloqueada,
//      escrita de não-admin recusada) — valida o comportamento do app.
// Nenhum destes testes acessa Supabase remoto.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createCatalogService } from '../../src/games/catalogService.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const sql = await readFile(new URL('../../supabase/migrations/20261029130000_catalog_games.sql', import.meta.url), 'utf8');

function policyBlock(name: string): string {
  const match = sql.match(new RegExp(`create policy "${name}"[\\s\\S]*?;`));
  assert.ok(match, `policy "${name}" presente na migração`);
  return match[0];
}

// ---------------------------------------------------------------------
// Contrato da migração

test('RLS habilitado e leitura pública restrita a jogos publicados', () => {
  assert.match(sql, /alter table public\.games enable row level security/);
  const publicRead = policyBlock('catalogo_leitura_publica');
  assert.match(publicRead, /for select/);
  assert.match(publicRead, /to anon, authenticated/);
  assert.match(publicRead, /using \(available = true\)/);
  assert.equal(/using \(true\)/.test(sql), false, 'nenhuma policy com USING (true)');
});

test('admin autenticado lê todos os jogos (inclusive rascunhos)', () => {
  const adminRead = policyBlock('admin_leitura_completa');
  assert.match(adminRead, /for select/);
  assert.match(adminRead, /to authenticated/);
  assert.match(adminRead, /using \(\(auth\.jwt\(\) -> 'app_metadata' ->> 'role'\) = 'admin'\)/);
});

test('escrita exclusiva de admin, verificada no JWT assinado (using + with check)', () => {
  const write = policyBlock('somente_admin_escreve');
  assert.match(write, /for all/);
  assert.match(write, /to authenticated/);
  assert.match(write, /using \(\(auth\.jwt\(\) -> 'app_metadata' ->> 'role'\) = 'admin'\)/);
  assert.match(write, /with check \(\(auth\.jwt\(\) -> 'app_metadata' ->> 'role'\) = 'admin'\)/);
});

test('grants: anon só lê; escrita concedida apenas a authenticated (efetiva só via RLS admin)', () => {
  assert.match(sql, /revoke all on table public\.games from anon, authenticated/);
  assert.match(sql, /grant select on table public\.games to anon, authenticated/);
  assert.match(sql, /grant insert, update, delete on table public\.games to authenticated/);
  assert.equal(/grant (insert|update|delete|truncate)[^;]*to anon/i.test(sql), false, 'anon sem grant de escrita');
});

test('updated_at é atualizado por trigger no servidor, não pelo cliente', () => {
  assert.match(sql, /create trigger games_touch_updated_at/);
  assert.match(sql, /before update on public\.games/);
  assert.match(sql, /for each row/);
  assert.match(sql, /new\.updated_at := now\(\)/);
});

test('bootstrap concede admin somente à conta pretendida e é idempotente', () => {
  assert.match(sql, /update auth\.users/);
  assert.match(sql, /where email = lower\('SEU_EMAIL_AQUI'\)/);
  assert.match(sql, /and aud = 'authenticated'/);
  assert.match(sql, /coalesce\(raw_app_meta_data, '\{\}'::jsonb\)/);
  assert.match(sql, /\|\| '\{"role": "admin"\}'::jsonb/);
});

// ---------------------------------------------------------------------
// Cenários de acesso (RLS simulada no duplo; autoridade real = banco)

interface Row {
  id: string;
  slug: string;
  title: string;
  description: string;
  entry: string;
  available: boolean;
  sort_order: number;
}

const published: Row = { id: 'id-1', slug: 'publicado', title: 'Publicado', description: '', entry: '/jogos/publicado/', available: true, sort_order: 0 };
const draft: Row = { id: 'id-2', slug: 'rascunho', title: 'Rascunho', description: '', entry: '', available: false, sort_order: 1 };

/** Duplo do PostgREST que aplica o mesmo RLS da migração. */
function createFakeClient(rows: Row[], { admin }: { admin: boolean }): SupabaseClient {
  const state = { rows: [...rows] };
  const visible = (row: Row): boolean => admin || row.available;
  const ok = (data: unknown) => ({ data, error: null });
  const rlsDenied = () => ({ data: null, error: { message: 'new row violates row-level security policy (simulado)' } });

  function builder() {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    const filters: Array<(row: Row) => boolean> = [];
    let payload: Record<string, unknown> = {};
    let wantSingle = false;
    const run = (): { data: unknown; error: { message: string } | null } => {
      if (op === 'select') {
        const out = state.rows.filter(visible).filter((row) => filters.every((matches) => matches(row)));
        if (wantSingle) return out[0] ? ok(out[0]) : { data: null, error: { message: 'not found' } };
        return ok(out);
      }
      if (!admin) return rlsDenied();
      if (op === 'insert') {
        const created = { description: '', entry: '', sort_order: 0, ...payload } as unknown as Row;
        state.rows.push(created);
        return ok(created);
      }
      if (op === 'update') {
        const targets = state.rows.filter((row) => filters.every((matches) => matches(row)));
        for (const target of targets) Object.assign(target, payload);
        return ok(targets);
      }
      state.rows = state.rows.filter((row) => !filters.every((matches) => matches(row)));
      return ok(null);
    };
    const chain = {
      select: () => chain,
      order: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push((row) => (row as unknown as Record<string, unknown>)[column] === value);
        return chain;
      },
      insert: (row: Record<string, unknown>) => { op = 'insert'; payload = row; return chain; },
      update: (row: Record<string, unknown>) => { op = 'update'; payload = row; return chain; },
      delete: () => { op = 'delete'; return chain; },
      single: () => { wantSingle = true; return chain; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
    };
    return chain;
  }

  // O serviço só usa a cadeia from('games') → select/insert/update/delete.
  return { from: () => builder() } as unknown as SupabaseClient;
}

test('cenário público/comum: listagem do membro nunca devolve rascunhos', async () => {
  const service = createCatalogService(createFakeClient([published, draft], { admin: false }));
  const games = await service.listFor('member');
  assert.deepEqual(games.map((entry) => entry.slug), ['publicado']);
  assert.equal(games.some((entry) => !entry.available), false);
});

test('cenário admin: painel enxerga publicados e rascunhos', async () => {
  const service = createCatalogService(createFakeClient([published, draft], { admin: true }));
  const all = await service.listFor('admin');
  assert.deepEqual(all.map((entry) => entry.slug), ['publicado', 'rascunho']);
});

test('tentativa de escrita sem papel admin é recusada com o erro do RLS', async () => {
  const service = createCatalogService(createFakeClient([published], { admin: false }));
  await assert.rejects(
    service.create({ slug: 'invasor', title: 'Invasor', description: '', entry: '', available: true, sortOrder: 0 }),
    /row-level security/,
  );
  await assert.rejects(service.update('id-1', { title: 'Alterado' }), /row-level security/);
  await assert.rejects(service.remove('id-1'), /row-level security/);
});
