// Catálogo remoto da plataforma: tabela `public.games` no Supabase.
//
// Visibilidade (RLS no servidor, aqui só espelhamos):
//   - member: somente jogos publicados (available = true).
//   - admin: todos os registros (inclusive rascunhos) para o painel.
// Toda linha vind do banco é validada antes de virar GameEntry (regra de
// segurança: nunca confiar em formato externo).
//
// Capa: arquivo enviado ao bucket `game-covers` (Supabase Storage).
// O banco guarda só o caminho (`cover_path`); a URL pública é derivada
// aqui, na fronteira do serviço — a UI nunca monta URL por conta própria.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogService, GameEntry, GameFieldError, GamePatch, NewGameInput } from '../types/domain.ts';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 280;
const MAX_ENTRY = 300;
const MAX_COVER_PATH = 300;

const COVER_BUCKET = 'game-covers';
const COVER_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const COVER_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
/** Limite do cliente; o bucket impõe o mesmo no servidor (`file_size_limit`). */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** Linha crua validada (PostgREST → domínio interno do serviço). */
export interface GameRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  entry: string;
  available: boolean;
  sortOrder: number;
  /** caminho bruto no bucket ('' = sem capa) */
  coverPath: string;
}

/** Valida uma linha crua (Record vindo do PostgREST) para GameRecord. */
export function normalizeGameRecord(value: unknown): GameRecord | null {
  if (value === null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.slug !== 'string') return null;
  if (typeof raw.title !== 'string' || typeof raw.description !== 'string') return null;
  if (typeof raw.entry !== 'string' || typeof raw.available !== 'boolean') return null;
  const sortOrder = typeof raw.sort_order === 'number' ? raw.sort_order : 0;
  if (!SLUG_PATTERN.test(raw.slug)) return null;
  // Capa auxiliar: valor inesperado vira '' (nunca derruba o registro).
  const coverPath = typeof raw.cover_path === 'string' && raw.cover_path.length <= MAX_COVER_PATH
    ? raw.cover_path
    : '';
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title.trim(),
    description: raw.description.trim(),
    entry: raw.entry.trim(),
    available: raw.available,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    coverPath,
  };
}

function normalizeRecords(rows: unknown): GameRecord[] {
  if (!Array.isArray(rows)) return [];
  const entries: GameRecord[] = [];
  for (const row of rows) {
    const entry = normalizeGameRecord(row);
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
  if (input.coverPath !== undefined) row.cover_path = input.coverPath;
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

  const toEntry = (record: GameRecord): GameEntry => ({
    id: record.id,
    slug: record.slug,
    title: record.title,
    description: record.description,
    entry: record.entry,
    available: record.available,
    sortOrder: record.sortOrder,
    coverUrl: record.coverPath
      ? client.storage.from(COVER_BUCKET).getPublicUrl(record.coverPath).data.publicUrl
      : '',
  });

  const toEntries = (rows: unknown): GameEntry[] => normalizeRecords(rows).map(toEntry);

  /** Caminho da capa atual (null = ausente/registro não encontrado). */
  const fetchCoverPath = async (id: string): Promise<string | null> => {
    try {
      const result = await table().select('cover_path').eq('id', id).single();
      if (result.error) return null;
      const path = (result.data as { cover_path?: unknown } | null)?.cover_path;
      return typeof path === 'string' && path !== '' ? path : null;
    } catch {
      return null;
    }
  };

  /** Apagar arquivo é melhor esforço: falha aqui não falha o catálogo. */
  const discardCover = async (path: string): Promise<void> => {
    try {
      await client.storage.from(COVER_BUCKET).remove([path]);
    } catch {
      // objeto órfão não interrompe o fluxo do painel
    }
  };

  return {
    async listFor(role): Promise<GameEntry[]> {
      let query = table().select('*').order('sort_order', { ascending: true });
      if (role !== 'admin') query = query.eq('available', true);
      return toEntries(assertResult(await query));
    },
    async create(input): Promise<GameEntry> {
      const invalid = validateGameInput(input);
      if (invalid) throw new Error(invalid.message);
      const data = assertResult(await table().insert(toRow(input)).select().single());
      const record = normalizeGameRecord(data);
      if (!record) throw new Error('Resposta inesperada do catálogo.');
      return toEntry(record);
    },
    async update(id, patch: GamePatch): Promise<GameEntry> {
      const invalid = validateGameInput(patch, { requireAll: false });
      if (invalid) throw new Error(invalid.message);
      // Só busca a capa antiga quando a patch mexe nela (troca ou limpeza).
      const previousPath = patch.coverPath !== undefined ? await fetchCoverPath(id) : null;
      const row = { ...toRow(patch), updated_at: new Date().toISOString() };
      const data = assertResult(await table().update(row).eq('id', id).select().single());
      const record = normalizeGameRecord(data);
      if (!record) throw new Error('Resposta inesperada do catálogo.');
      if (previousPath && previousPath !== record.coverPath) await discardCover(previousPath);
      return toEntry(record);
    },
    async remove(id): Promise<void> {
      const coverPath = await fetchCoverPath(id);
      assertResult(await table().delete().eq('id', id));
      if (coverPath) await discardCover(coverPath);
    },
    async uploadCover(file): Promise<string> {
      if (!COVER_MIME_TYPES.has(file.type)) {
        throw new Error('A capa deve ser uma imagem PNG, JPEG, WebP, GIF ou AVIF.');
      }
      if (file.size > MAX_COVER_BYTES) {
        throw new Error('A capa pode ter no máximo 5 MB.');
      }
      const path = `${crypto.randomUUID()}.${COVER_EXTENSIONS[file.type]}`;
      const result = await client.storage.from(COVER_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (result.error) {
        const raw = result.error.message ?? '';
        // Erro comum quando a migração do bucket ainda não rodou: traduzimos
        // para uma ação concreta em vez de expor o texto cru do SDK.
        if (/bucket not found/i.test(raw)) {
          throw new Error(
            'Bucket "game-covers" não existe no Supabase. Rode a migração 20261029210000_game_covers.sql no SQL Editor do painel.',
          );
        }
        throw new Error(raw || 'Não foi possível enviar a capa.');
      }
      return path;
    },
  };
}
