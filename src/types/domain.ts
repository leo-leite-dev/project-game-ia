// Contratos de domínio compartilhados entre os módulos da plataforma.
// Regra: cada contrato entre módulos (catálogo, repositórios de save, auth)
// é declarado aqui como tipo, nunca replicado com estruturas ad hoc.

import type { UserRole } from './auth.ts';

export interface GameEntry {
  /** uuid estável do registro remoto */
  id: string;
  /** identificador curto amigável (slug) */
  slug: string;
  /** nome exibido na plataforma */
  title: string;
  /** resumo curto exibido no catálogo */
  description: string;
  /** caminho/URL do artefato do jogo; vazio = ainda sem entrada */
  entry: string;
  /** true quando publicado para os usuários */
  available: boolean;
  /** ordem de exibição (menor primeiro) */
  sortOrder: number;
}

export type NewGameInput = Omit<GameEntry, 'id'>;

/** Valores brutos do formulário admin de publicação/edição. */
export interface GameFormValues {
  slug: string;
  title: string;
  description: string;
  entry: string;
  available: boolean;
}

export interface GamePatch {
  slug?: string;
  title?: string;
  description?: string;
  entry?: string;
  available?: boolean;
  sortOrder?: number;
}

export interface GameFieldError {
  field: 'slug' | 'title' | 'description' | 'entry';
  message: string;
}

/**
 * Contrato do catálogo remoto (tabela `games` no Supabase).
 * `listFor` aplica o filtro de visibilidade: member vê só publicados;
 * admin vê tudo (painel).
 */
export interface CatalogService {
  listFor(role: UserRole): Promise<GameEntry[]>;
  create(input: NewGameInput): Promise<GameEntry>;
  update(id: string, patch: GamePatch): Promise<GameEntry>;
  remove(id: string): Promise<void>;
}

/** Storage mínimo compatível com localStorage, aceito por repositórios. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Contrato de persistência de progresso por conta.
 * read/commit são assíncronos e idempotentes por (userId, gameId, version).
 */
export interface GameSaveRepository<T> {
  read(): Promise<T | null>;
  commit(value: T): Promise<T>;
  clear(): Promise<void>;
}

export interface GameSaveRepositoryOptions {
  userId: string;
  gameId: string;
  storage?: StorageLike;
}
