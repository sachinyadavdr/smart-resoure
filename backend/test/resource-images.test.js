import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import request from 'supertest';
import sharp from 'sharp';

process.env.DATABASE_FILE = ':memory:';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'resourcebridge-photos-'));
const { default: app } = await import('../src/app.js');
const { db } = await import('../src/db/index.js');
await import('../src/db/seed.js');
const photoDirectory = path.join(process.env.UPLOAD_DIR, 'resource-images');
const image = format => sharp({ create: { width: 96, height: 64, channels: 3, background: '#1763a2' } }).toFormat(format).toBuffer();
const jpeg = await image('jpeg'), png = await image('png'), webp = await image('webp');
const login = async email => (await request(app).post('/api/auth/login').send({ email, password:'DemoPass123!' })).body.token;
const owner = await login('owner@example.test'), student = await login('student@example.test'), admin = await login('admin@example.test');
const otherOwner = (await request(app).post('/api/auth/register').send({ name:'Other Photo Owner', email:'photo-owner@example.test', password:'DemoPass123!', role:'owner' })).body.token;
const payload = { title:'Camera equipment for photo tests', description:'A valid resource listing with a verified uploaded photograph.', category:'Media', location:'Studio', capacity:4, eligibility:['Active student account'] };
const apiImage = url => '/api' + url;
let id, currentUrl;

test('migration preserves existing resources and JSON clients without a photo', async () => {
  assert.equal(db.prepare('SELECT image_path FROM resources WHERE id=1').get().image_path, null);
  const response = await request(app).post('/api/resources').set('Authorization', `Bearer ${owner}`).send(payload);
  assert.equal(response.status, 201);
  assert.equal(response.body.resource.imageUrl, null);
  assert.equal((await request(app).patch(`/api/resources/${response.body.resourceId}`).set('Authorization', `Bearer ${owner}`).send({ capacity:8 })).status, 200);
  assert.equal((await request(app).patch(`/api/resources/${response.body.resourceId}`).set('Authorization', `Bearer ${owner}`).send({})).status, 400);
});

test('create accepts real JPEG, PNG and WebP content and generates safe image references', async () => {
  for (const [format, buffer] of [['jpg',jpeg],['png',png],['webp',webp]]) {
    const response = await request(app).post('/api/resources').set('Authorization', `Bearer ${owner}`).field('data',JSON.stringify(payload)).attach('image',buffer,{ filename:'untrusted.svg', contentType:'application/octet-stream' });
    assert.equal(response.status,201, JSON.stringify(response.body));
    assert.match(response.body.resource.imageUrl,new RegExp(`^/resource-images/[a-f0-9-]+\\.${format}$`));
    assert.equal('imagePath' in response.body.resource,false);
    assert.ok(fs.existsSync(path.join(photoDirectory,path.basename(response.body.resource.imageUrl))));
    if (format==='jpg') { id=response.body.resourceId; currentUrl=response.body.resource.imageUrl; }
  }
});

test('public and owner APIs expose the same photo, with cross-origin read-only serving', async () => {
  const detail = await request(app).get(`/api/resources/${id}`);
  const directory = await request(app).get('/api/resources');
  const owned = await request(app).get('/api/owner/resources').set('Authorization',`Bearer ${owner}`);
  const dashboard = await request(app).get('/api/dashboard/owner').set('Authorization',`Bearer ${owner}`);
  for (const resource of [detail.body.resource, directory.body.resources.find(r=>r.id===id),owned.body.resources.find(r=>r.id===id),dashboard.body.resources.find(r=>r.id===id)]) {
    assert.equal(resource.imageUrl,currentUrl);
    assert.equal('imagePath' in resource,false);
  }
  const photo = await request(app).get(apiImage(currentUrl));
  assert.equal(photo.status,200); assert.match(photo.headers['content-type'],/^image\/jpeg/);
  assert.equal(photo.headers['cross-origin-resource-policy'],'cross-origin');
  assert.equal((await request(app).post(apiImage(currentUrl))).status,404);
  assert.equal((await request(app).get('/api/resource-images/..%2F..%2F.env')).status,404);
});

test('replacement commits a new file and only then retires the old file; metadata edits keep it', async () => {
  const oldUrl=currentUrl;
  const response=await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${owner}`).field('data',JSON.stringify({title:'Updated camera equipment'})).attach('image',png,'photo.png');
  assert.equal(response.status,200,JSON.stringify(response.body));
  currentUrl=response.body.resource.imageUrl;
  assert.notEqual(currentUrl,oldUrl);
  assert.equal((await request(app).get(apiImage(currentUrl))).status,200);
  assert.equal((await request(app).get(apiImage(oldUrl))).status,404);
  assert.equal(fs.existsSync(path.join(photoDirectory,path.basename(oldUrl))),false);
  const metadata=await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${owner}`).send({location:'New Studio'});
  assert.equal(metadata.body.resource.imageUrl,currentUrl);
  assert.equal(metadata.body.resource.capacity,4);
  assert.deepEqual((await request(app).get(`/api/resources/${id}`)).body.resource.eligibility,['Active student account']);
});

test('forged MIME types, SVG, truncated content, invalid form data and oversized images leave the current photo intact', async () => {
  const before=fs.readdirSync(photoDirectory).sort();
  for (const invalid of [Buffer.from('not really a JPEG'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'),jpeg.subarray(0,30)]) {
    const response=await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${owner}`).attach('image',invalid,{filename:'photo.jpg',contentType:'image/jpeg'});
    assert.equal(response.status,400,JSON.stringify(response.body));
  }
  const oversized=await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${owner}`).attach('image',Buffer.alloc(5*1024*1024+1),{filename:'large.jpg',contentType:'image/jpeg'});
  assert.equal(oversized.status,413); assert.match(oversized.body.error,/5 MB/);
  assert.equal((await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${owner}`).field('data','{broken').attach('image',png,'photo.png')).status,400);
  assert.equal((await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${owner}`).field('data',JSON.stringify({removeImage:true})).attach('image',png,'photo.png')).status,400);
  assert.equal((await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${owner}`).attach('image',png,'one.png').attach('image',png,'two.png')).status,400);
  assert.deepEqual(fs.readdirSync(photoDirectory).sort(),before);
  assert.equal((await request(app).get(`/api/resources/${id}`)).body.resource.imageUrl,currentUrl);
});

test('only the resource owner can replace or remove a photo, including when the caller is admin', async () => {
  for (const [token,status] of [[null,401],[student,403],[otherOwner,403],[admin,403]]) {
    const patch=request(app).patch(`/api/resources/${id}`);
    if (token) patch.set('Authorization',`Bearer ${token}`);
    assert.equal((await patch.attach('image',png,'photo.png')).status,status);
    const remove=request(app).patch(`/api/resources/${id}`);
    if (token) remove.set('Authorization',`Bearer ${token}`);
    assert.equal((await remove.send({removeImage:true})).status,status);
  }
  assert.equal((await request(app).post('/api/resources').set('Authorization',`Bearer ${student}`).field('data',JSON.stringify(payload)).attach('image',png,'photo.png')).status,403);
  assert.equal((await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${admin}`).send({capacity:6})).status,200);
  assert.equal((await request(app).get(`/api/resources/${id}`)).body.resource.imageUrl,currentUrl);
});

test('a database save failure rolls back the new photo and retains the original', async () => {
  const before=fs.readdirSync(photoDirectory).sort();
  db.exec("CREATE TEMP TRIGGER reject_image_change BEFORE UPDATE OF image_path ON resources BEGIN SELECT RAISE(ABORT, 'simulated image commit failure'); END");
  try {
    const response=await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${owner}`).attach('image',webp,'photo.webp');
    assert.equal(response.status,500);
    assert.equal((await request(app).get(`/api/resources/${id}`)).body.resource.imageUrl,currentUrl);
    assert.equal((await request(app).get(apiImage(currentUrl))).status,200);
    assert.deepEqual(fs.readdirSync(photoDirectory).sort(),before);
  } finally { db.exec('DROP TRIGGER reject_image_change'); }
});

test('explicit removal restores the illustration reference without affecting resource fields', async () => {
  const old=currentUrl;
  const response=await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${owner}`).send({removeImage:true});
  assert.equal(response.status,200);
  assert.equal(response.body.resource.imageUrl,null);
  assert.equal(response.body.resource.title,'Updated camera equipment');
  assert.equal((await request(app).get(apiImage(old))).status,404);
});

test('stored image and SQLite reference survive a complete backend process restart', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'resourcebridge-photos-'));
  const script=path.resolve('scripts/check-image-persistence.mjs');
  for (const mode of ['create','read']) {
    const response=spawnSync(process.execPath,[script,mode],{env:{...process.env,RESOURCEBRIDGE_IMAGE_TEST_DIR:directory},encoding:'utf8',timeout:30000});
    assert.equal(response.status,0,response.stdout+'\n'+response.stderr);
    assert.match(response.stdout,new RegExp(`PERSISTENCE_${mode.toUpperCase()}_OK`));
  }
});
