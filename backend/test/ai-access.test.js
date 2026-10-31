import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// Set isolation before importing any application module; never open the dev DB.
process.env.DATABASE_FILE = ':memory:';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'resourcebridge-ai-access-'));
process.env.GEMINI_API_KEY = '';
process.env.JWT_SECRET = 'isolated-ai-access-tests-only';
const { default: app } = await import('../src/app.js');
const { db } = await import('../src/db/index.js');
const { createToken } = await import('../src/auth.js');
await import('../src/db/seed.js');
const account = role => db.prepare('SELECT id, role, email FROM users WHERE role=?').get(role);
const roles = ['student', 'owner', 'admin'];
const authorization = role => `Bearer ${createToken(account(role))}`;
let laboratoryId;

test('student, owner and admin receive the same verified Computer recommendations', async () => {
  const owner = account('owner');
  const created = await request(app).post('/api/resources').set('Authorization', `Bearer ${createToken(owner)}`).send({ title: 'Computer Laboratory', description: 'Computers for student coding projects.', category: 'Laboratory', location: 'Isolated Test Campus', eligibility: ['Active student account'] });
  assert.equal(created.status, 201);
  laboratoryId = created.body.resourceId;
  let expected;
  for (const role of roles) {
    const response = await request(app).post('/api/ai/resource-match').set('Authorization', authorization(role)).send({ query: 'Computer' });
    assert.equal(response.status, 200, role);
    assert.equal(response.body.source, 'fallback');
    assert.ok(response.body.recommendations.some(item => item.id === laboratoryId));
    assert.ok(response.body.recommendations.every(item => item.availability === 'available'));
    for (const item of response.body.recommendations) {
      for (const privateField of ['email', 'password', 'password_hash', 'token', 'imagePath']) assert.equal(privateField in item, false);
    }
    const ids = response.body.recommendations.map(item => item.id);
    if (expected) assert.deepEqual(ids, expected); else expected = ids;
  }
});

test('discovery access does not grant owner or admin student booking privileges', async () => {
  const before = db.prepare('SELECT COUNT(*) AS count FROM booking_requests').get().count;
  for (const role of ['owner', 'admin']) {
    const response = await request(app).post(`/api/resources/${laboratoryId}/bookings`).set('Authorization', authorization(role)).send({ startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), purpose: 'Attempt a student-only booking.' });
    assert.equal(response.status, 403);
    assert.equal(response.body.error, 'Insufficient permissions.');
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM booking_requests').get().count, before);
});

test('missing, invalid and expired sessions remain unauthorized for all roles', async () => {
  const expired = roles.map(role => jwt.sign({ sub: account(role).id, role }, process.env.JWT_SECRET, { expiresIn: -1 }));
  for (const token of [null, 'invalid-test-token', ...expired]) {
    const pending = request(app).post('/api/ai/resource-match');
    if (token) pending.set('Authorization', `Bearer ${token}`);
    const response = await pending.send({ query: 'Computer' });
    assert.equal(response.status, 401);
    assert.equal(response.body.recommendations, undefined);
  }
  const unsupported = jwt.sign({ sub: account('student').id, role: 'unsupported' }, process.env.JWT_SECRET);
  assert.equal((await request(app).post('/api/ai/resource-match').set('Authorization', `Bearer ${unsupported}`).send({ query: 'Computer' })).status, 403);
});

test('student cannot gain resource-owner or admin privileges; admin and owner boundaries remain intact', async () => {
  const student = authorization('student');
  for (const url of ['/api/owner/resources', '/api/dashboard/owner', '/api/admin/audit', '/api/dashboard/admin']) assert.equal((await request(app).get(url).set('Authorization', student)).status, 403);
  assert.equal((await request(app).post('/api/resources').set('Authorization', student).send({})).status, 403);
  assert.equal((await request(app).patch(`/api/resources/${laboratoryId}`).set('Authorization', student).send({ title: 'Unauthorized change' })).status, 403);
  assert.equal((await request(app).get('/api/admin/audit').set('Authorization', authorization('owner'))).status, 403);
  assert.equal((await request(app).get('/api/admin/audit').set('Authorization', authorization('admin'))).status, 200);
  assert.equal((await request(app).get('/api/dashboard/admin').set('Authorization', authorization('admin'))).status, 200);
  const otherOwner = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES ('Other test owner','isolated-other-owner@example.test','unused-test-hash','owner')").run();
  const token = createToken({ id: otherOwner.lastInsertRowid, role: 'owner' });
  assert.equal((await request(app).patch(`/api/resources/${laboratoryId}`).set('Authorization', `Bearer ${token}`).send({ title: 'Unauthorized change' })).status, 403);
  assert.equal(db.prepare('SELECT title FROM resources WHERE id=?').get(laboratoryId).title, 'Computer Laboratory');
});

test('all roles retain demo exclusions, availability filters and the existing recommendation eligibility filter', async () => {
  const { records } = JSON.parse(fs.readFileSync(new URL('../config/discovery-exclusions.json', import.meta.url), 'utf8'));
  const hidden = records.find(item => item.id === 1);
  db.prepare('UPDATE resources SET title=?,description=?,category=?,location=?,owner_id=? WHERE id=1').run(hidden.title,hidden.description,hidden.category,hidden.location,hidden.ownerId);
  const insert = db.prepare('INSERT INTO resources(owner_id,title,description,category,location,availability) VALUES (?,?,?,?,?,?)');
  const blocked = ['unavailable', 'maintenance'].map(availability => insert.run(account('owner').id, 'Computer '+availability, 'Computer equipment for isolated tests.', 'Laboratory', 'Test Campus', availability).lastInsertRowid);
  const restricted = insert.run(account('owner').id, 'Computer Restricted', 'Computer equipment requiring certification.', 'Laboratory', 'Test Campus', 'available').lastInsertRowid;
  db.prepare('INSERT INTO eligibility_requirements(resource_id,requirement) VALUES (?,?)').run(restricted, 'Staff certification');
  for (const role of roles) {
    const response = await request(app).post('/api/ai/resource-match').set('Authorization', authorization(role)).send({ query: 'Computer projector' });
    assert.equal(response.status, 200);
    const ids = response.body.recommendations.map(item => item.id);
    assert.ok(ids.includes(laboratoryId));
    for (const id of [1, restricted, ...blocked]) assert.equal(ids.includes(id), false);
  }
  assert.ok(db.prepare('SELECT id FROM resources WHERE id=1').get());
  const listing = await request(app).get('/api/resources').query({ search: 'Computer', category: 'Laboratory', availability: 'available' });
  assert.equal(listing.status, 200);
  assert.ok(listing.body.resources.some(item => item.id === laboratoryId));
  assert.ok(listing.body.resources.every(item => item.title.includes('Computer') && item.category === 'Laboratory' && item.availability === 'available'));
  const studentBooking = await request(app).post(`/api/resources/${restricted}/bookings`).set('Authorization', authorization('student')).send({ startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), purpose: 'Restricted resource eligibility check.' });
  assert.equal(studentBooking.status, 403);
});

test('all roles retain query validation and Gemini failure falls back without a provider request', async t => {
  for (const role of roles) assert.equal((await request(app).post('/api/ai/resource-match').set('Authorization', authorization(role)).send({ query: 'a' })).status, 400);
  process.env.GEMINI_API_KEY = 'isolated-not-a-real-provider-key';
  const provider = mock.method(globalThis, 'fetch', async () => { throw new Error('Simulated Gemini outage'); });
  const warning = mock.method(console, 'warn', () => {});
  t.after(() => { provider.mock.restore(); warning.mock.restore(); process.env.GEMINI_API_KEY = ''; });
  for (const role of roles) {
    const response = await request(app).post('/api/ai/resource-match').set('Authorization', authorization(role)).send({ query: 'Computer' });
    assert.equal(response.status, 200);
    assert.equal(response.body.source, 'fallback');
    assert.ok(response.body.recommendations.some(item => item.id === laboratoryId));
  }
  assert.ok(provider.mock.callCount() > 0);
  assert.ok(warning.mock.callCount() > 0);
});
