// Catálogo remoto da plataforma: tabela `public.games` no Supabase.
//
// Visibilidade (RLS no servidor, aqui só espelhamos):
//   - member: somente jogos publicados (available = true).
//   - admin: todos os registros (inclusive rascunhos) para o painel.
// Toda linha vind do banco é validada antes de virar GameEntry (regra de
// segurança: nunca confiar em formato externo).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogService, GameEntry, GameFieldError, GamePatch, NewGameInput } from '../types/domain.ts';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 280;
const MAX_ENTRY = 300;

/** Valida uma linha crua (Record vindo do PostgREST) para GameEntry. */
export function normalizeGameEntry(value: unknown): GameEntry | null {
  if (value === null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.slug !== 'string') return null;
  if (typeof raw.title !== 'string' || typeof raw.description !== 'string') return null;
  if (typeof raw.entry !== 'string' || typeof raw.available !== 'boolean') return null;
  const sortOrder = typeof raw.sort_order === 'number' ? raw.sort_order : 0;
  if (!SLUG_PATTERN.test(raw.slug)) return null;
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title.trim(),
    description: raw.description.trim(),
    entry: raw.entry.trim(),
    available: raw.available,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  };
}

function normalizeList(rows: unknown): GameEntry[] {
  if (!Array.isArray(rows)) return [];
  const entries: GameEntry[] = [];
  for (const row of rows) {
    const entry = normalizeGameEntry(row);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Valida o formulário de publicação/edição (create/patch parcial em update). */
export function validateGameInput(input: Partial<NewGameInput>, { requireAll = true }: { requireAll?: boolean } = {}): GameFieldError | null {
  if (input.slug !== undefined || requireAll) {
    const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
    if (slug === '' || !SLUG_PATTERN.test(slug)) {
      return { field: 'slug', message: 'Use apenas letras minúsculas, números e hífens (ex.: meu-jogo).' };
    }
  }
  if (input.title !== undefined || requireAll) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (title === '' || title.length > MAX_TITLE) {
      return { field: 'title', message: `Informe um título com até ${MAX_TITLE} caracteres.` };
    }
  }
  if (input.description !== undefined && input.description.trim().length > MAX_DESCRIPTION) {
    return { field: 'description', message: `O resumo pode ter no máximo ${MAX_DESCRIPTION} caracteres.` };
  }
  if (input.entry !== undefined) {
    const entry = input.entry.trim();
    if (entry !== '' && !entry.startsWith('/') && !/^https?:\/\//i.test(entry)) {
      return { field: 'entry', message: 'Use um caminho iniciado em "/" ou uma URL http(s).' };
    }
    if (entry.length > MAX_ENTRY) {
      return { field: 'entry', message: `O caminho pode ter no máximo ${MAX_ENTRY} caracteres.` };
    }
  }
  return null;
}

function toRow(input: Partial<NewGameInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.slug !== undefined) row.slug = input.slug.trim();
  if (input.title !== undefined) row.title = input.title.trim();
  if (input.description !== undefined) row.description = input.description.trim();
  if (input.entry !== undefined) row.entry = input.entry.trim();
  if (input.available !== undefined) row.available = input.available;
  if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
  return row;
}

interface ResultLike<T> {
  data: T;
  error: { message?: string } | null;
}

const assertResult = <R extends ResultLike<unknown>>(result: R): R['data'] => {
  if (result.error) throw new Error(result.error.message ?? 'Falha no catálogo.');
  return result.data;
};

export function createCatalogService(client: SupabaseClient): CatalogService {
  const table = () => client.from('games');
  return {
    async listFor(role): Promise<GameEntry[]> {
      let query = table().select('*').order('sort_order', { ascending: true });
      if (role !== 'admin') query = query.eq('available', true);
      return normalizeList(assertResult(await query));
    },
    async create(input): Promise<GameEntry> {
      const invalid = validateGameInput(input);
      if (invalid) throw new Error(invalid.message);
      const data = assertResult(await table().insert(toRow(input)).select().single());
      const entry = normalizeGameEntry(data);
      if (!entry) throw new Error('Resposta inesperada do catálogo.');
      return entry;
    },
    async update(id, patch: GamePatch): Promise<GameEntry> {
      const invalid = validateGameInput(patch, { requireAll: false });
      if (invalid) throw new Error(invalid.message);
      const row = { ...toRow(patch), updated_at: new Date().toISOString() };
      const data = assertResult(await table().update(row).eq('id', id).select().single());
      const entry = normalizeGameEntry(data);
      if (!entry) throw new Error('Resposta inesperada do catálogo.');
      return entry;
    },
    async remove(id): Promise<void> {
      assertResult(await table().delete().eq('id', id));
    },
  };
}
