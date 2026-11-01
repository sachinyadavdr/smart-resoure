import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiBaseUrl } from '../../frontend/app/lib/api-url.mjs';

// No application import, SQLite connection, account or real network request.
process.env.NEXT_PUBLIC_API_URL = 'https://backend.example.test';
const { API_BASE_URL, requestJson, resourceImageUrl } = await import('../../frontend/app/lib/api.ts');

test('production accepts an origin or /api base and emits exactly one /api', () => {
  for (const value of ['https://backend.example.test', 'https://backend.example.test/', 'https://backend.example.test/api', 'https://backend.example.test/api/', '  https://backend.example.test/api///  ']) {
    assert.equal(resolveApiBaseUrl(value, true), 'https://backend.example.test/api');
  }
  assert.equal(resolveApiBaseUrl('http://localhost:4000', true), 'http://localhost:4000/api');
});

test('only development can fall back to localhost; missing production configuration fails clearly', () => {
  for (const value of [undefined, '', '  ']) {
    assert.equal(resolveApiBaseUrl(value, false), 'http://localhost:4000/api');
    assert.throws(() => resolveApiBaseUrl(value, true), /before building/);
  }
});

test('ambiguous, relative and unsafe API base configurations are rejected', () => {
  for (const value of ['/api', 'backend.example.test', 'ftp://backend.example.test', 'https://backend.example.test/api/api', 'https://backend.example.test/auth', 'https://backend.example.test/api?x=1', 'https://backend.example.test/#fragment', 'https://user:example@backend.example.test']) {
    assert.throws(() => resolveApiBaseUrl(value, true), /NEXT_PUBLIC_API_URL/);
  }
});

test('login, registration and role workflows use the same absolute API mount without changing request options', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ ok: true }); };
  try {
    for (const path of ['/auth/login', '/auth/register', '/auth/me', '/dashboard/student', '/dashboard/owner', '/dashboard/admin', '/resources?search=Computer&availability=available', '/owner/bookings', '/bookings', '/notifications', '/incidents', '/audit', '/admin/audit', '/ai/resource-match']) {
      const options = { method: 'POST', headers: { Authorization: 'Bearer isolated-placeholder' }, body: '{}' };
      const result = await requestJson(path, options);
      assert.equal(result.response.status, 200);
      assert.equal(calls.at(-1).url, 'https://backend.example.test/api' + path);
      assert.equal(calls.at(-1).init, options);
    }
  } finally { globalThis.fetch = original; }
});

test('resource image references use the same backend mount and reject paths outside the image endpoint', () => {
  assert.equal(API_BASE_URL, 'https://backend.example.test/api');
  assert.equal(resourceImageUrl('/resource-images/abcdef12-3456-7890-abcd-123456789012.jpg'), API_BASE_URL + '/resource-images/abcdef12-3456-7890-abcd-123456789012.jpg');
  for (const value of [null, undefined, '/etc/passwd', 'https://unrelated.example/photo.jpg', '/resource-images/../../photo.jpg']) assert.equal(resourceImageUrl(value), '');
});

test('JSON API validation and authorization errors retain their response contracts', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [400, 401, 403, 429]) {
      globalThis.fetch = async () => Response.json({ error: 'Existing API error' }, { status });
      const result = await requestJson('/auth/login');
      assert.equal(result.response.status, status);
      assert.deepEqual(result.data, { error: 'Existing API error' });
    }
    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.equal((await requestJson('/auth/login')).data, null);
  } finally { globalThis.fetch = original; }
});

test('non-JSON 404 and unavailable backend produce safe errors without exposing server HTML', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<html>upstream routing error</html>', { status: 404 });
    await assert.rejects(requestJson('/auth/login'), /unexpected error \(404\)/);
    globalThis.fetch = async () => { throw new Error('internal transport details'); };
    await assert.rejects(requestJson('/auth/login'), /backend availability and allowed frontend origin/);
  } finally { globalThis.fetch = original; }
});
