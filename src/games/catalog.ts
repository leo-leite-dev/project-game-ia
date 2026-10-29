// Catálogo de jogos publicados na plataforma ReGenesis Arcade.
//
// Cada jogo publicado é declarado aqui como um registro estável. A hub pós-login
// lê esta lista para exibir os jogos disponíveis para o usuário autenticado.
//
// Mantenha o catálogo como dados públicos versionados da plataforma. Não exige
// tabelas de perfil, conquistas ou inventário para listar um único jogo.

import type { GameEntry } from '../types/domain.ts';

export const GAMES: readonly GameEntry[] = Object.freeze([]);

export function listGames(): GameEntry[] {
  return GAMES.filter((game) => game.available);
}

export function getGame(id: string): GameEntry | null {
  return GAMES.find((game) => game.id === id) ?? null;
}
