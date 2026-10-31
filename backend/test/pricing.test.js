import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { bookingEstimate, resourcePricingInput } from '../src/pricing.js';
import { rupeesToPaise, paiseToInput, formatINR } from '../../frontend/app/lib/pricing.ts';

process.env.DATABASE_FILE = ':memory:';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'resourcebridge-pricing-'));
process.env.GEMINI_API_KEY = '';
const { default: app } = await import('../src/app.js');
const { db } = await import('../src/db/index.js');
await import('../src/db/seed.js');
const login = async email => (await request(app).post('/api/auth/login').send({ email, password:'DemoPass123!' })).body.token;
const owner = await login('owner@example.test'), student = await login('student@example.test'), admin = await login('admin@example.test');
const otherOwner = (await request(app).post('/api/auth/register').send({ name:'Other Pricing Owner',email:'pricing-owner@example.test',password:'DemoPass123!',role:'owner' })).body.token;
const resource = { title:'Pricing Camera',description:'Camera equipment for isolated hourly pricing tests.',category:'Media',location:'Test Studio',eligibility:['Active student account'] };
const startsAt = new Date(Date.now()+86400000).toISOString();
const endsAt = new Date(new Date(startsAt).getTime()+5400000).toISOString();
let paidId;

test('pricing migration preserves legacy data, defaults listings to free and leaves historical booking estimates unknown', () => {
  const legacy = new DatabaseSync(':memory:');
  try {
    for (const file of ['schema.sql','migrations/002_phase2_booking_workflows.sql','migrations/003_phase3_lifecycle_trust.sql','migrations/004_resource_capacity.sql','migrations/005_resource_images.sql']) legacy.exec(fs.readFileSync(path.join('src/db',file),'utf8'));
    legacy.exec("INSERT INTO users (name,email,password_hash,role) VALUES ('Owner','legacy-owner@example.test','test','owner'),('Student','legacy-student@example.test','test','student'); INSERT INTO resources (owner_id,title,description,category,location) VALUES (1,'Existing Lab','Existing description','Laboratory','Campus'); INSERT INTO booking_requests (resource_id,student_id,starts_at,ends_at,status) VALUES (1,2,'2025-01-01T10:00:00Z','2025-01-01T11:00:00Z','approved');");
    const before=legacy.prepare('SELECT title,description,location FROM resources').get();
    legacy.exec(fs.readFileSync('src/db/migrations/006_hourly_resource_pricing.sql','utf8'));
    assert.deepEqual(legacy.prepare('SELECT title,description,location FROM resources').get(),before);
    assert.equal(legacy.prepare('SELECT hourly_price_paise AS rate FROM resources').get().rate,0);
    const booking=legacy.prepare('SELECT * FROM booking_requests').get();
    assert.equal(booking.status,'approved'); assert.equal(booking.starts_at,'2025-01-01T10:00:00Z');
    assert.equal(booking.quoted_hourly_price_paise,null); assert.equal(booking.estimated_total_paise,null);
    assert.throws(()=>legacy.exec('UPDATE resources SET hourly_price_paise=-1'));
    assert.throws(()=>legacy.exec('UPDATE resources SET hourly_price_paise=1.5'));
    assert.throws(()=>legacy.exec('UPDATE resources SET hourly_price_paise=NULL'));
    assert.throws(()=>legacy.exec('UPDATE resources SET hourly_price_paise=9007199254740992'));
  } finally { legacy.close(); }
});

test('rupee input converts exactly to integer paise and formats INR without floating-point cent loss', () => {
  for (const [input,paise] of [['0',0],['0.29',29],['150.50',15050],['90071992547409.91',Number.MAX_SAFE_INTEGER]]) {
    assert.equal(rupeesToPaise(input),paise); assert.equal(rupeesToPaise(paiseToInput(paise)),paise);
  }
  for (const invalid of ['', '-1', '1.001', '1e3', 'NaN', 'Infinity', '90071992547409.92']) assert.equal(rupeesToPaise(invalid),null);
  assert.equal(formatINR(15050),'₹150.50'); assert.equal(formatINR(0),'₹0');
  assert.equal(formatINR(Number.MAX_SAFE_INTEGER),'₹9,00,71,99,25,47,409.91');
});

test('pricing normalization is explicit and rejects invalid or missing paid rates', () => {
  assert.deepEqual(resourcePricingInput({}),{hourlyPricePaise:0});
  assert.deepEqual(resourcePricingInput({},true),{});
  assert.deepEqual(resourcePricingInput({pricingType:'free',hourlyPricePaise:100}),{hourlyPricePaise:0});
  assert.deepEqual(resourcePricingInput({pricingType:'paid',hourlyPricePaise:0}),{hourlyPricePaise:0});
  for (const hourlyPricePaise of [-1,0.5,null,true,'100',Number.NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>resourcePricingInput({hourlyPricePaise}));
  assert.throws(()=>resourcePricingInput({pricingType:'paid'})); assert.throws(()=>resourcePricingInput({pricingType:'monthly'}));
});

test('legacy JSON creates are free; explicitly paid JSON and multipart resources retain exact paise', async () => {
  const free=await request(app).post('/api/resources').set('Authorization',`Bearer ${owner}`).send(resource);
  assert.equal(free.status,201); assert.equal(free.body.resource.hourlyPricePaise,0);
  const paid=await request(app).post('/api/resources').set('Authorization',`Bearer ${owner}`).send({...resource,pricingType:'paid',hourlyPricePaise:15050});
  assert.equal(paid.status,201); paidId=paid.body.resourceId; assert.equal(paid.body.resource.hourlyPricePaise,15050);
  const multipart=await request(app).post('/api/resources').set('Authorization',`Bearer ${owner}`).field('data',JSON.stringify({...resource,pricingType:'paid',hourlyPricePaise:29}));
  assert.equal(multipart.status,201); assert.equal(multipart.body.resource.hourlyPricePaise,29);
  const zero=await request(app).post('/api/resources').set('Authorization',`Bearer ${owner}`).send({...resource,pricingType:'paid',hourlyPricePaise:0});
  assert.equal(zero.status,201); assert.equal(zero.body.resource.hourlyPricePaise,0);
});

test('invalid create and update prices are rejected without changing listings', async () => {
  const count=db.prepare('SELECT COUNT(*) AS count FROM resources').get().count;
  for (const hourlyPricePaise of [-1,0.5,null,true,'100',Number.MAX_SAFE_INTEGER+1]) {
    assert.equal((await request(app).post('/api/resources').set('Authorization',`Bearer ${owner}`).send({...resource,hourlyPricePaise})).status,400);
    assert.equal((await request(app).patch(`/api/resources/${paidId}`).set('Authorization',`Bearer ${owner}`).send({hourlyPricePaise})).status,400);
  }
  assert.equal((await request(app).post('/api/resources').set('Authorization',`Bearer ${owner}`).send({...resource,pricingType:'paid'})).status,400);
  assert.equal((await request(app).patch(`/api/resources/${paidId}`).set('Authorization',`Bearer ${owner}`).send({pricingType:'invalid'})).status,400);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM resources').get().count,count);
  assert.equal((await request(app).get(`/api/resources/${paidId}`)).body.resource.hourlyPricePaise,15050);
});

test('list, detail, management, dashboard and deterministic AI responses expose the stored hourly rate', async () => {
  const listing=await request(app).get('/api/resources');
  const detail=await request(app).get(`/api/resources/${paidId}`);
  const owned=await request(app).get('/api/owner/resources').set('Authorization',`Bearer ${owner}`);
  const dashboard=await request(app).get('/api/dashboard/owner').set('Authorization',`Bearer ${owner}`);
  for (const item of [listing.body.resources.find(r=>r.id===paidId),detail.body.resource,owned.body.resources.find(r=>r.id===paidId),dashboard.body.resources.find(r=>r.id===paidId)]) assert.equal(item.hourlyPricePaise,15050);
  const matches=await request(app).post('/api/ai/resource-match').set('Authorization',`Bearer ${student}`).send({query:'Pricing Camera Media'});
  assert.equal(matches.status,200); assert.equal(matches.body.recommendations.find(r=>r.id===paidId).hourlyPricePaise,15050);
});

test('only the owner changes a listing rate; metadata edits preserve it and Free explicitly resets it', async () => {
  for (const [token,status] of [[null,401],[student,403],[otherOwner,403],[admin,403]]) {
    const req=request(app).patch(`/api/resources/${paidId}`); if (token) req.set('Authorization',`Bearer ${token}`);
    assert.equal((await req.send({hourlyPricePaise:20000})).status,status);
  }
  const metadata=await request(app).patch(`/api/resources/${paidId}`).set('Authorization',`Bearer ${owner}`).send({location:'New Studio'});
  assert.equal(metadata.body.resource.hourlyPricePaise,15050);
  const free=await request(app).patch(`/api/resources/${paidId}`).set('Authorization',`Bearer ${owner}`).field('data',JSON.stringify({pricingType:'free'}));
  assert.equal(free.status,200); assert.equal(free.body.resource.hourlyPricePaise,0);
  const paid=await request(app).patch(`/api/resources/${paidId}`).set('Authorization',`Bearer ${owner}`).send({pricingType:'paid',hourlyPricePaise:15050});
  assert.equal(paid.status,200); assert.equal(paid.body.resource.hourlyPricePaise,15050);
});

test('estimates use exact elapsed time, fractional hours, time zones and nearest-paise half-up rounding', () => {
  assert.equal(bookingEstimate(15050,startsAt,endsAt).estimatedTotalPaise,22575);
  assert.equal(bookingEstimate(1,'2035-01-01T10:00:00Z','2035-01-01T10:30:00Z').estimatedTotalPaise,1);
  assert.equal(bookingEstimate(100,'2035-01-01T10:00:00Z','2035-01-01T10:01:00Z').estimatedTotalPaise,2);
  assert.equal(bookingEstimate(15050,'2035-01-01T10:00:00+05:30','2035-01-01T06:00:00Z').estimatedTotalPaise,22575);
  assert.equal(bookingEstimate(3600000,'2035-01-01T23:59:59.999Z','2035-01-02T00:00:00.000Z').estimatedTotalPaise,1);
  assert.equal(bookingEstimate(0,startsAt,endsAt).estimatedTotalPaise,0);
  assert.throws(()=>bookingEstimate(100,endsAt,startsAt)); assert.throws(()=>bookingEstimate(100,'invalid',endsAt));
  assert.throws(()=>bookingEstimate(Number.MAX_SAFE_INTEGER,'2035-01-01T10:00:00Z','2035-01-01T12:00:00Z'));
});

test('estimate endpoint reads stored rates, ignores client totals and rejects invalid windows', async () => {
  const response=await request(app).post(`/api/resources/${paidId}/estimate`).send({startsAt,endsAt,hourlyPricePaise:1,estimatedTotalPaise:1});
  assert.equal(response.status,200); assert.equal(response.body.estimate.hourlyPricePaise,15050); assert.equal(response.body.estimate.estimatedTotalPaise,22575);
  assert.equal(response.body.estimate.currency,'INR'); assert.equal(response.body.estimate.estimateOnly,true);
  for (const body of [{startsAt:endsAt,endsAt:startsAt},{startsAt,endsAt:startsAt},{startsAt:'invalid',endsAt},{startsAt:'2020-01-01T00:00:00Z',endsAt}]) assert.equal((await request(app).post(`/api/resources/${paidId}/estimate`).send(body)).status,400);
  assert.equal((await request(app).post('/api/resources/999999/estimate').send({startsAt,endsAt})).status,404);
  const free=await request(app).post('/api/resources/1/estimate').send({startsAt,endsAt});
  assert.equal(free.status,200); assert.equal(free.body.estimate.estimatedTotalPaise,0);
});

test('bookings store a server-calculated quote, ignore browser totals, and retain it after owner rate changes', async () => {
  const response=await request(app).post(`/api/resources/${paidId}/bookings`).set('Authorization',`Bearer ${student}`).send({startsAt,endsAt,purpose:'Photograph a student project.',expectedHourlyPricePaise:15050,estimatedTotalPaise:0,hourlyPricePaise:0,paymentStatus:'paid'});
  assert.equal(response.status,201,JSON.stringify(response.body)); assert.equal(response.body.status,'pending');
  assert.equal(response.body.estimate.estimatedTotalPaise,22575); assert.equal(response.body.paymentStatus,undefined);
  const saved=db.prepare('SELECT quoted_hourly_price_paise AS rate, estimated_total_paise AS total FROM booking_requests WHERE id=?').get(response.body.bookingId);
  assert.deepEqual({...saved},{rate:15050,total:22575});
  await request(app).patch(`/api/resources/${paidId}`).set('Authorization',`Bearer ${owner}`).send({hourlyPricePaise:20000});
  const history=await request(app).get('/api/bookings').set('Authorization',`Bearer ${student}`);
  const item=history.body.bookings.find(b=>b.id===response.body.bookingId);
  assert.equal(item.quotedHourlyPricePaise,15050); assert.equal(item.estimatedTotalPaise,22575);
  const requests=await request(app).get('/api/owner/bookings').set('Authorization',`Bearer ${owner}`);
  assert.equal(requests.body.bookings.find(b=>b.id===item.id).estimatedTotalPaise,22575);
});

test('a changed-rate guard stops stale quotes before booking; refreshed requests and free bookings work', async () => {
  const created=await request(app).post('/api/resources').set('Authorization',`Bearer ${owner}`).send({...resource,hourlyPricePaise:10000});
  const id=created.body.resourceId;
  await request(app).patch(`/api/resources/${id}`).set('Authorization',`Bearer ${owner}`).send({hourlyPricePaise:20000});
  const body={startsAt,endsAt,purpose:'Review a changed hourly rate.',expectedHourlyPricePaise:10000};
  const before=db.prepare('SELECT COUNT(*) AS count FROM booking_requests').get().count;
  const stale=await request(app).post(`/api/resources/${id}/bookings`).set('Authorization',`Bearer ${student}`).send(body);
  assert.equal(stale.status,409); assert.equal(stale.body.code,'PRICE_CHANGED'); assert.equal(stale.body.hourlyPricePaise,20000);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM booking_requests').get().count,before);
  const refreshed=await request(app).post(`/api/resources/${id}/bookings`).set('Authorization',`Bearer ${student}`).send({...body,expectedHourlyPricePaise:20000});
  assert.equal(refreshed.status,201); assert.equal(refreshed.body.estimate.estimatedTotalPaise,30000);
  const free=await request(app).post('/api/resources/1/bookings').set('Authorization',`Bearer ${student}`).send({startsAt,endsAt,purpose:'Reserve a free resource.'});
  assert.equal(free.status,201); assert.equal(free.body.estimate.estimatedTotalPaise,0);
  assert.equal(db.prepare('SELECT estimated_total_paise AS total FROM booking_requests WHERE id=?').get(free.body.bookingId).total,0);
});
