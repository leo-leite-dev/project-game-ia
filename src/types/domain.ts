// Contratos de domínio compartilhados entre os módulos da plataforma.
// Regra: cada contrato entre módulos (catálogo, repositórios de save, auth)
// é declarado aqui como tipo, nunca replicado com estruturas ad hoc.

export interface GameEntry {
  /** identificador estável (slug) */
  id: string;
  /** nome exibido na plataforma */
  title: string;
  /** resumo curto exibido no catálogo */
  description: string;
  /** caminho interno permitido do artefato do jogo */
  entry: string;
  /** só true após artefato e sessão integrados */
  available: boolean;
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
