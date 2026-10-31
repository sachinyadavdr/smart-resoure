// A fresh-process persistence check, explicitly confined to a newly created
// temporary directory. Never accepts a development database path.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';

const directory=process.env.RESOURCEBRIDGE_IMAGE_TEST_DIR;
if (!directory || path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('resourcebridge-photos-')) throw new Error('An isolated resourcebridge-photos-* temporary directory is required.');
process.env.DATABASE_FILE=path.join(directory,'restart-check.db');
process.env.UPLOAD_DIR=path.join(directory,'uploads');
delete process.env.NODE_TEST_CONTEXT;
process.env.NODE_ENV='development';
const { default: app }=await import('../src/app.js');
const stateFile=path.join(directory,'image-state.json');
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
if (process.argv[2]==='create') {
  await import('../src/db/seed.js');
  const login=await request(app).post('/api/auth/login').send({email:'owner@example.test',password:'DemoPass123!'});
  const buffer=await sharp({create:{width:80,height:60,channels:3,background:'#1d9c83'}}).png().toBuffer();
  const created=await request(app).post('/api/resources').set('Authorization',`Bearer ${login.body.token}`).field('data',JSON.stringify({title:'Restart persistence resource',description:'A resource in an isolated restart verification database.',category:'Media',location:'Test studio'})).attach('image',buffer,'restart.png');
  assert.equal(created.status,201,JSON.stringify(created.body));
  const image=await request(app).get('/api'+created.body.resource.imageUrl);
  assert.equal(image.status,200);
  fs.writeFileSync(stateFile,JSON.stringify({id:created.body.resourceId,url:created.body.resource.imageUrl,hash:digest(image.body)}));
  console.log('PERSISTENCE_CREATE_OK');
} else {
  const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  const detail=await request(app).get(`/api/resources/${state.id}`);
  assert.equal(detail.body.resource.imageUrl,state.url);
  const image=await request(app).get('/api'+state.url);
  assert.equal(image.status,200);
  assert.equal(digest(image.body),state.hash);
  console.log('PERSISTENCE_READ_OK');
}
