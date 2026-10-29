import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fakeAuthClient, fakeSession } from '../helpers/fakeAuth.ts';
import { createAuthService } from '../../src/auth/authService.ts';
import AuthController from '../../src/auth/AuthController.ts';
import type { CatalogService, GameEntry, NewGameInput } from '../../src/types/domain.ts';
import type { AuthViewState } from '../../src/types/auth.ts';

interface TestLike {
  after(fn: () => void): void;
}

function game(id: string, available: boolean, title = `Jogo ${id}`): GameEntry {
  return { id, slug: `jogo-${id}`, title, description: 'Resumo de teste', entry: `/jogos/jogo-${id}/`, available, sortOrder: 0 };
}

function fakeCatalog(initial: GameEntry[] = []): { service: CatalogService; games: GameEntry[] } {
  const games = [...initial];
  let seq = 0;
  const service: CatalogService = {
    async listFor(role) {
      return role === 'admin' ? [...games] : games.filter((entry) => entry.available);
    },
    async create(input: NewGameInput) {
      const created: GameEntry = { id: `novo-${++seq}`, ...input };
      games.push(created);
      return created;
    },
    async update(id, patch) {
      const target = games.find((entry) => entry.id === id);
      if (!target) throw new Error('jogo-inexistente');
      Object.assign(target, patch);
      return target;
    },
    async remove(id) {
      const index = games.findIndex((entry) => entry.id === id);
      if (index >= 0) games.splice(index, 1);
    },
  };
  return { service, games };
}

function setup(t: TestLike, { catalog, initial = [] }: { catalog?: CatalogService; initial?: GameEntry[] }) {
  const fake = fakeAuthClient();
  const view = {
    render(_state: AuthViewState) {},
    clearPasswords() {},
    clearIdentity() {},
    fieldError() {},
  };
  const prepared = fakeCatalog(initial);
  const service = createAuthService({ ...fake, origin: 'http://localhost:5173', projectUrl: 'https://example.supabase.co' });
  const controller = new AuthController({ service, view, catalog: catalog ?? prepared.service });
  t.after(() => controller.destroy());
  return { fake, controller, catalogStore: prepared.games };
}

test('usuário comum vê apenas jogos publicados e sem painel admin', async (t) => {
  const { fake, controller } = setup(t, { initial: [game('a', true), game('b', false)] });
  fake.setSession(fakeSession());
  await controller.start();
  await sleep(10);
  assert.equal(controller.state.mode, 'authenticated');
  assert.equal(controller.state.user?.role, 'member');
  assert.deepEqual(controller.state.games.map((entry) => entry.id), ['a']);
  assert.deepEqual(controller.state.adminGames, []);
});

test('admin vê todos os jogos no painel e o catálogo público filtrado', async (t) => {
  const { fake, controller } = setup(t, { initial: [game('a', true), game('b', false)] });
  fake.setSession(fakeSession('user-a', 'admin'));
  await controller.start();
  await sleep(10);
  assert.equal(controller.state.user?.role, 'admin');
  assert.deepEqual(controller.state.games.map((entry) => entry.id), ['a']);
  assert.deepEqual(controller.state.adminGames.map((entry) => entry.id), ['a', 'b']);
});

test('admin publica jogo e o catálogo é recarregado com feedback', async (t) => {
  const { fake, controller } = setup(t, { initial: [game('a', false)] });
  fake.setSession(fakeSession('user-a', 'admin'));
  await controller.start();
  await sleep(10);
  await controller.publishGame({ slug: 'novo-jogo', title: 'Novo Jogo', description: 'Descreve', entry: '/jogos/novo-jogo/', available: true });
  assert.equal(controller.state.catalogBusy, false);
  assert.match(controller.state.catalogMessage, /salvo/);
  assert.deepEqual(controller.state.games.map((entry) => entry.slug), ['novo-jogo']);
  assert.equal(controller.state.adminGames.length, 2);
});

test('membro não consegue executar ações de admin mesmo chamando o controller', async (t) => {
  const { fake, controller } = setup(t, { initial: [game('a', true)] });
  fake.setSession(fakeSession());
  await controller.start();
  await sleep(10);
  await controller.publishGame({ slug: 'bloqueado', title: 'Bloqueado', description: '', entry: '', available: true });
  assert.equal(controller.state.adminGames.length, 0);
  assert.equal(controller.state.catalogMessage, '');
  assert.deepEqual(controller.state.games.map((entry) => entry.id), ['a']);
});

test('falha do catálogo vira mensagem de erro sem derrubar a sessão', async (t) => {
  const broken: CatalogService = {
    async listFor() {
      throw new Error('rede-indisponivel');
    },
    async create() {
      throw new Error('rede-indisponivel');
    },
    async update() {
      throw new Error('rede-indisponivel');
    },
    async remove() {
      throw new Error('rede-indisponivel');
    },
  };
  const { fake, controller } = setup(t, { catalog: broken });
  fake.setSession(fakeSession('user-a', 'admin'));
  await controller.start();
  await sleep(10);
  assert.equal(controller.state.mode, 'authenticated');
  assert.match(controller.state.catalogMessage, /catálogo/);
});
