import test from 'node:test';
import assert from 'node:assert/strict';
import { completeAuthentication } from '../app/lib/auth-session.mjs';

function createStorage() {
  const values = new Map();
  return {
    values,
    setItem(key, value) { values.set(key, value); },
    getItem(key) { return values.get(key) ?? null; },
  };
}

test('successful student registration persists the token before redirecting to the student dashboard', () => {
  const storage = createStorage();
  const destinations = [];
  const result = completeAuthentication(
    { ok: true, status: 201 },
    { token: 'student-jwt', user: { name: 'Student', role: 'student' } },
    { storage, redirect: (destination) => destinations.push(destination) },
  );

  assert.deepEqual(result, { kind: 'authenticated', destination: '/dashboard/student' });
  assert.equal(storage.getItem('resourcebridge_token'), 'student-jwt');
  assert.deepEqual(destinations, ['/dashboard/student']);
});

test('successful owner registration redirects to the owner dashboard', () => {
  const destinations = [];
  const result = completeAuthentication(
    { ok: true, status: 201 },
    { token: 'owner-jwt', user: { name: 'Owner', role: 'owner' } },
    { storage: createStorage(), redirect: (destination) => destinations.push(destination) },
  );

  assert.deepEqual(result, { kind: 'authenticated', destination: '/dashboard/owner' });
  assert.deepEqual(destinations, ['/dashboard/owner']);
});

test('admin authentication uses the existing admin dashboard route', () => {
  const destinations = [];
  completeAuthentication(
    { ok: true, status: 200 },
    { token: 'admin-jwt', user: { name: 'Admin', role: 'admin' } },
    { storage: createStorage(), redirect: (destination) => destinations.push(destination) },
  );

  assert.deepEqual(destinations, ['/dashboard/admin']);
});

test('a duplicate-email response does not persist authentication or redirect', () => {
  const storage = createStorage();
  const destinations = [];
  const result = completeAuthentication(
    { ok: false, status: 409 },
    { code: 'EMAIL_ALREADY_EXISTS', error: 'This email is already registered.' },
    { storage, redirect: (destination) => destinations.push(destination) },
  );

  assert.deepEqual(result, { kind: 'duplicate', message: 'This email is already registered.' });
  assert.equal(storage.getItem('resourcebridge_token'), null);
  assert.deepEqual(destinations, []);
});

test('a failed registration does not persist authentication or redirect', () => {
  const storage = createStorage();
  const destinations = [];
  const result = completeAuthentication(
    { ok: false, status: 400 },
    { error: 'Invalid registration details.' },
    {
      storage,
      redirect: (destination) => destinations.push(destination),
      fallbackMessage: 'Registration failed.',
    },
  );

  assert.deepEqual(result, { kind: 'error', message: 'Invalid registration details.' });
  assert.equal(storage.getItem('resourcebridge_token'), null);
  assert.deepEqual(destinations, []);
});

test('missing session data does not redirect and persisted authentication survives a page refresh', () => {
  const storage = createStorage();
  const destinations = [];
  const incomplete = completeAuthentication(
    { ok: true, status: 201 },
    { user: { name: 'Student', role: 'student' } },
    { storage, redirect: (destination) => destinations.push(destination) },
  );

  assert.deepEqual(incomplete, { kind: 'incomplete' });
  assert.equal(storage.getItem('resourcebridge_token'), null);
  assert.deepEqual(destinations, []);

  completeAuthentication(
    { ok: true, status: 201 },
    { token: 'persisted-jwt', user: { name: 'Student', role: 'student' } },
    { storage, redirect: (destination) => destinations.push(destination) },
  );
  const refreshedPageToken = storage.getItem('resourcebridge_token');
  assert.equal(refreshedPageToken, 'persisted-jwt');
});
