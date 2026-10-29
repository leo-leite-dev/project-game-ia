import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createGameAuthClient } from '../../src/auth/supabaseClient.ts';
import { decodeJwtPayload } from '../../src/auth/authConfig.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// SDK oficial + HTTP SIMULADO. Estes testes NÃO acessam Supabase real.
test('SDK real usa updateUser e transporte impede troca A/B no instante da mutação', async (t) => {
  const ownerA = '00000000-0000-0000-0000-000000000001';
  const ownerB = '00000000-0000-0000-0000-000000000002';
  const calls = [];
  const token = (sub) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url')}.${Buffer.from('SIMULATED_SIGNATURE').toString('base64url')}`;
  const response = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  const client = createGameAuthClient({ url: 'https://transport-test.supabase.co', key: 'sb_publishable_TEST_ONLY', storageKey: `game-ia:test:${randomUUID()}` }, {
    fetch: async (request) => {
      const url = new URL(request.url); calls.push({ path: url.pathname, method: request.method });
      if (url.pathname.endsWith('/token')) return response({ access_token: token(ownerA), refresh_token: 'TEST_ONLY', expires_in: 3600, token_type: 'bearer', user: { id: ownerA, email: 'a@example.test' } });
      if (url.pathname.endsWith('/user')) return response({ id: decodeJwtPayload(request.headers.get('authorization').slice(7)).sub, email: 'a@example.test' });
      return response({});
    },
  });
  t.after(async () => { await client.auth.stopAutoRefresh(); await client.auth.signOut({ scope: 'local' }); });
  const signed = await client.auth.signInWithPassword({ email: 'a@example.test', password: 'TEST_ONLY' });
  assert.equal(signed.error, null);
  const updated = await client.updatePassword(ownerA, 'NEW_TEST_ONLY');
  assert.equal(updated.error, null); assert.equal(updated.data.user.id, ownerA);
  const mutations = calls.filter((call) => call.method === 'PUT').length;
  const switched = await client.auth.setSession({ access_token: token(ownerB), refresh_token: 'TEST_ONLY' });
  assert.equal(switched.error, null);
  // Supabase Auth internamente encapsula falhas do fetch; basta que não haja PUT a B.
  let blockedError;
  try { blockedError = (await client.updatePassword(ownerA, 'MUST_NOT_REACH_B')).error; } catch (error) { blockedError = error; }
  assert.ok(blockedError);
  assert.equal(calls.filter((call) => call.method === 'PUT').length, mutations);
});

test('resposta HTTP de login antigo é descartada antes de o SDK persistir sua sessão', async (t) => {
  const requested = deferred(); const incoming = deferred();
  const client = createGameAuthClient({ url: 'https://stale-test.supabase.co', key: 'sb_publishable_TEST_ONLY', storageKey: `game-ia:test:${randomUUID()}` }, {
    fetch: async (request) => {
      if (new URL(request.url).pathname.endsWith('/token')) { requested.resolve(); return incoming.promise; }
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    },
  });
  t.after(() => client.auth.stopAutoRefresh());
  const result = client.auth.signInWithPassword({ email: 'a@example.test', password: 'TEST_ONLY' });
  await requested.promise;
  client.onSessionBoundary('SIGNED_IN', 'user-b');
  incoming.resolve(new Response(JSON.stringify({ access_token: 'MUST_NOT_BE_STORED', refresh_token: 'TEST_ONLY', token_type: 'bearer', expires_in: 3600, user: { id: 'user-a' } }), { headers: { 'content-type': 'application/json' } }));
  assert.ok((await result).error);
  assert.equal((await client.auth.getSession()).data.session, null);
});
