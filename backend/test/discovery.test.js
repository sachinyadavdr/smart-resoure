import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import request from 'supertest';
import { createDiscoveryFilter, isDiscoveryExcluded, publicResources } from '../src/discovery.js';

const { records } = JSON.parse(fs.readFileSync(new URL('../config/discovery-exclusions.json', import.meta.url), 'utf8'));
test('running discovery reloads exclusions and reversals without restarting or changing database records', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resourcebridge-exclusions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const manifestPath = path.join(directory, 'exclusions.json');
  const demo = records.find(record => record.id === 1);
  const genuine = { ...demo, id: 139, ownerId: 152 };
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }));
  const filter = createDiscoveryFilter(manifestPath);
  assert.deepEqual(filter.publicResources([demo, genuine]), [demo, genuine]);
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [demo] }));
  assert.deepEqual(filter.publicResources([demo, genuine]), [genuine]);
  assert.equal(filter.isDiscoveryExcluded(demo), true);
  fs.writeFileSync(manifestPath, '{');
  assert.throws(() => filter.publicResources([demo, genuine]), SyntaxError);
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }));
  assert.deepEqual(filter.publicResources([demo, genuine]), [demo, genuine]);
  assert.equal(filter.isDiscoveryExcluded(demo), false);
});
test('reviewed snapshots are excluded, while new IDs, edited records and real listings remain visible', () => {
  const fixture = records[0];
  assert.ok(fixture);
  assert.equal(isDiscoveryExcluded(fixture), true);
  assert.equal(isDiscoveryExcluded({ ...fixture, id: 999999 }), false);
  for (const key of ['title', 'description', 'category', 'location', 'ownerId']) {
    assert.equal(isDiscoveryExcluded({ ...fixture, [key]: key === 'ownerId' ? 999 : 'Owner edited value' }), false);
  }
  const real = [{ id:1, title:'Portable Projector Kit' }, { id:104, title:'Computer Lab' }, { id:999999, title:'Notification Fixture', description:'Legitimate owner-created equipment' }];
  assert.deepEqual(publicResources([...real, fixture]), real);
});

test('the exact legacy seed snapshot is excluded without filtering genuine same-title owner listings', () => {
  const demo = records.find(record => record.id === 1);
  assert.equal(demo.title, 'Portable Projector Kit');
  assert.equal(demo.ownerId, 2);
  assert.equal(isDiscoveryExcluded(demo), true);
  assert.equal(isDiscoveryExcluded({ ...demo, id: 139, ownerId: 152 }), false);
  assert.equal(isDiscoveryExcluded({ ...demo, ownerId: 152 }), false);
  assert.equal(isDiscoveryExcluded({ ...demo, description: 'An actual owner-created resource.' }), false);
});

test('normal development seeding never creates a demo resource, even in an empty database', () => {
  const env = { ...process.env, DATABASE_FILE: ':memory:', NODE_ENV: 'development' };
  delete env.NODE_TEST_CONTEXT;
  const script = `
    import assert from 'node:assert/strict';
    await import('./src/db/migrate.js');
    await import('./src/db/seed.js');
    const { db } = await import('./src/db/index.js');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM resources').get().count, 0);
    console.log('NORMAL_SEED_NO_RESOURCES');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /NORMAL_SEED_NO_RESOURCES/);
});

test('directory and AI exclude the demo while retaining owner access, booking history and a genuine same-title listing', async () => {
  process.env.DATABASE_FILE = ':memory:';
  process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'resourcebridge-discovery-'));
  process.env.GEMINI_API_KEY = '';
  const { default: app } = await import('../src/app.js');
  const { db } = await import('../src/db/index.js');
  await import('../src/db/seed.js');
  const demo = records.find(record => record.id === 1);
  db.prepare('UPDATE resources SET title=?,description=?,category=?,location=?,owner_id=? WHERE id=1').run(demo.title,demo.description,demo.category,demo.location,demo.ownerId);
  db.prepare('INSERT INTO booking_requests (resource_id,student_id,starts_at,ends_at) VALUES (1,1,?,?)').run('2035-01-01T10:00:00Z','2035-01-01T11:00:00Z');
  const owner = await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: 'DemoPass123!' });
  const student = await request(app).post('/api/auth/login').send({ email: 'student@example.test', password: 'DemoPass123!' });
  const genuineOwner = await request(app).post('/api/auth/register').send({ name: 'Actual Resource Owner', email: 'actual-owner@example.test', password: 'DemoPass123!', role: 'owner' });
  const genuine = await request(app).post('/api/resources').set('Authorization', `Bearer ${genuineOwner.body.token}`).send({ title: demo.title, description: demo.description, category: demo.category, location: demo.location, eligibility: ['Active student account'] });
  assert.equal(genuine.status, 201);
  for (const filters of [{}, { search: demo.title }, { category: demo.category }, { availability: 'available' }, { search: 'projector', category: demo.category, availability: 'available' }, {}]) {
    const listing = await request(app).get('/api/resources').query(filters);
    assert.equal(listing.status, 200);
    assert.equal(listing.body.resources.some(row => row.id === 1), false);
    assert.equal(listing.body.resources.some(row => row.id === genuine.body.resourceId), true);
  }
  const matches = await request(app).post('/api/ai/resource-match').set('Authorization', `Bearer ${student.body.token}`).send({ query: 'projector presentation Innovation Lab' });
  assert.equal(matches.status, 200);
  assert.equal(matches.body.recommendations.some(row => row.id === 1), false);
  assert.equal(matches.body.recommendations.some(row => row.id === genuine.body.resourceId), true);
  const management = await request(app).get('/api/owner/resources').set('Authorization', `Bearer ${owner.body.token}`);
  assert.equal(management.body.resources.find(row => row.id === 1).discoveryExcluded, true);
  assert.equal((await request(app).get('/api/resources/1')).status, 200);
  const history = await request(app).get('/api/owner/bookings').set('Authorization', `Bearer ${owner.body.token}`);
  assert.equal(history.status, 200); assert.ok(history.body.bookings.some(row => row.resourceId === 1));
  const dashboard = await request(app).get('/api/dashboard/student').set('Authorization', `Bearer ${student.body.token}`);
  assert.equal(dashboard.body.stats.availableResources, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM resources').get().count, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM booking_requests WHERE resource_id=1').get().count, 1);
});
