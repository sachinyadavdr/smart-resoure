import test from 'node:test';
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

test('a valid student session receives verified Computer recommendations', async () => {
  const owner = account('owner');
  const created = await request(app).post('/api/resources').set('Authorization', `Bearer ${createToken(owner)}`).send({ title: 'Computer Laboratory', description: 'Computers for student coding projects.', category: 'Laboratory', location: 'Isolated Test Campus', eligibility: ['Active student account'] });
  assert.equal(created.status, 201);
  const token = createToken(account('student'));
  const response = await request(app).post('/api/ai/resource-match').set('Authorization', `Bearer ${token}`).send({ query: 'Computer' });
  assert.equal(response.status, 200);
  assert.equal(response.body.source, 'fallback');
  assert.ok(response.body.recommendations.some(item => item.id === created.body.resourceId));
  assert.ok(response.body.recommendations.every(item => item.availability === 'available'));
});

test('owner and admin sessions remain forbidden from student-only matching', async () => {
  for (const role of ['owner', 'admin']) {
    const response = await request(app).post('/api/ai/resource-match').set('Authorization', `Bearer ${createToken(account(role))}`).send({ query: 'Computer' });
    assert.equal(response.status, 403);
    assert.equal(response.body.error, 'Insufficient permissions.');
    assert.equal(response.body.recommendations, undefined);
  }
});

test('missing, invalid and expired sessions remain unauthorized', async () => {
  const expired = jwt.sign({ sub: account('student').id, role: 'student' }, process.env.JWT_SECRET, { expiresIn: -1 });
  for (const token of [null, 'invalid-test-token', expired]) {
    const pending = request(app).post('/api/ai/resource-match');
    if (token) pending.set('Authorization', `Bearer ${token}`);
    const response = await pending.send({ query: 'Computer' });
    assert.equal(response.status, 401);
    assert.equal(response.body.recommendations, undefined);
  }
});
