import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Must run before any application module (including dotenv) is imported.
process.env.DATABASE_FILE = ':memory:';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'resourcebridge-test-'));
const { default: app } = await import('../src/app.js');
const { db } = await import('../src/db/index.js');
await import('../src/db/seed.js');

test('health endpoint is available', async () => { const response = await request(app).get('/api/health'); assert.equal(response.status, 200); assert.equal(response.body.status, 'ok'); });
test('resource listing is public and returns an array', async () => { const response = await request(app).get('/api/resources'); assert.equal(response.status, 200); assert.ok(Array.isArray(response.body.resources)); });
test('invalid login is rejected safely', async () => { const response = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: '' }); assert.equal(response.status, 400); assert.equal(response.body.error, 'Email and password are required.'); });
test('registration normalizes email casing and returns a stable duplicate conflict', async () => {
  const email = `duplicate-${Date.now()}@example.test`;
  const registration = await request(app).post('/api/auth/register').send({ name: 'Duplicate Fixture', email: email.toUpperCase(), password: 'DemoPass123!', role: 'owner' });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.user.email, email);
  assert.equal(registration.body.user.role, 'owner');
  assert.ok(registration.body.token);

  const duplicate = await request(app).post('/api/auth/register').send({ name: 'Duplicate Fixture', email, password: 'DemoPass123!' });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, {
    error: 'This email is already registered. Please log in or use a different email.',
    code: 'EMAIL_ALREADY_EXISTS',
  });
  assert.equal(JSON.stringify(duplicate.body).includes('SQLITE'), false);
  assert.equal(JSON.stringify(duplicate.body).includes('stack'), false);
});
test('public registration cannot create an admin account', async () => {
  const response = await request(app).post('/api/auth/register').send({
    name: 'Admin Registration Attempt',
    email: `admin-attempt-${Date.now()}@example.test`,
    password: 'DemoPass123!',
    role: 'admin',
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Invalid registration details.');
});
test('simultaneous registrations for the same normalized email allow only one account', async () => {
  const email = `concurrent-${Date.now()}@example.test`;
  const payload = (candidateEmail) => ({ name: 'Concurrent Fixture', email: candidateEmail, password: 'DemoPass123!' });
  const responses = await Promise.all([
    request(app).post('/api/auth/register').send(payload(email)),
    request(app).post('/api/auth/register').send(payload(email.toUpperCase())),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const duplicate = responses.find((response) => response.status === 409);
  assert.equal(duplicate.body.code, 'EMAIL_ALREADY_EXISTS');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get(email).count, 1);
});
test('seeded student can log in but cannot create resources', async () => { const login = await request(app).post('/api/auth/login').send({ email: 'student@example.test', password: 'DemoPass123!' }); assert.equal(login.status, 200); assert.ok(login.body.token); const response = await request(app).post('/api/resources').set('Authorization', `Bearer ${login.body.token}`).send({ title: 'Student Attempt', description: 'This should be rejected by role authorization.', category: 'Test', location: 'Test Lab' }); assert.equal(response.status, 403); });
test('seeded owner can create a validated resource', async () => { const login = await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: 'DemoPass123!' }); assert.equal(login.status, 200); const response = await request(app).post('/api/resources').set('Authorization', `Bearer ${login.body.token}`).send({ title: 'Demo Camera', description: 'A fictional camera for testing resource sharing.', category: 'Media', location: 'Studio A', eligibility: ['Active owner account'] }); assert.equal(response.status, 201); assert.ok(response.body.resourceId); });
test('owner resource management persists capacity, requirements, edits, and ownership boundaries', async () => {
  const owner = await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: 'DemoPass123!' });
  const otherOwner = await request(app).post('/api/auth/register').send({ name: 'Second Fixture Owner', email: `resource-owner-${Date.now()}@example.test`, password: 'DemoPass123!', role: 'owner' });
  const title = `Resource Management Fixture ${Date.now()}`;
  const created = await request(app).post('/api/resources').set('Authorization', `Bearer ${owner.body.token}`).send({ title, description: 'A fictional managed resource for persistence testing.', category: 'Workshop', location: 'Training Lab', capacity: 12, eligibility: ['Completed lab safety training', 'Active student account'] });
  assert.equal(created.status, 201);
  const listed = await request(app).get('/api/resources').query({ search: title });
  assert.equal(listed.status, 200); assert.equal(listed.body.resources[0].capacity, 12); assert.deepEqual([...listed.body.resources[0].eligibility].sort(), ['Active student account', 'Completed lab safety training'].sort());
  const edited = await request(app).patch(`/api/resources/${created.body.resourceId}`).set('Authorization', `Bearer ${owner.body.token}`).send({ capacity: 20, availability: 'maintenance', eligibility: ['Supervisor training required'] });
  assert.equal(edited.status, 200); assert.equal(edited.body.resource.capacity, 20); assert.equal(edited.body.resource.availability, 'maintenance');
  assert.equal((await request(app).patch(`/api/resources/${created.body.resourceId}`).set('Authorization', `Bearer ${otherOwner.body.token}`).send({ title: 'Unauthorized edit' })).status, 403);
  assert.equal((await request(app).get('/api/owner/resources').set('Authorization', `Bearer ${owner.body.token}`)).body.resources.some((item) => item.id === created.body.resourceId && item.capacity === 20), true);
  assert.equal((await request(app).get('/api/resources').query({ search: title })).body.resources[0].availability, 'maintenance');
});
test('owner approval and rejection persist decisions with notifications and audit history', async () => {
  const owner = await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: 'DemoPass123!' });
  const student = await request(app).post('/api/auth/register').send({ name: 'Decision Fixture Student', email: `decision-${Date.now()}@example.test`, password: 'DemoPass123!', role: 'student' });
  const resource = await request(app).post('/api/resources').set('Authorization', `Bearer ${owner.body.token}`).send({ title: `Decision Fixture ${Date.now()}`, description: 'A fictional resource for decision persistence testing.', category: 'Testing', location: 'Decision Lab' });
  const booking = await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${student.body.token}`).send({ startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), purpose: 'Verify owner decision persistence.' });
  assert.equal((await request(app).patch(`/api/bookings/${booking.body.bookingId}/decision`).set('Authorization', `Bearer ${student.body.token}`).send({ status: 'approved', reason: 'Unauthorized decision.' })).status, 403);
  const decision = await request(app).patch(`/api/bookings/${booking.body.bookingId}/decision`).set('Authorization', `Bearer ${owner.body.token}`).send({ status: 'rejected', reason: 'The requested window is unavailable for this fixture.' });
  assert.equal(decision.status, 200); assert.equal(decision.body.status, 'rejected');
  const history = await request(app).get('/api/bookings').set('Authorization', `Bearer ${student.body.token}`); const saved = history.body.bookings.find((item) => item.id === booking.body.bookingId); assert.equal(saved.status, 'rejected'); assert.equal(saved.decisionReason, 'The requested window is unavailable for this fixture.');
  const notifications = await request(app).get('/api/notifications').set('Authorization', `Bearer ${student.body.token}`); assert.ok(notifications.body.notifications.some((item) => item.type === 'booking_rejected' && item.entityId === booking.body.bookingId));
  const audit = await request(app).get('/api/audit').set('Authorization', `Bearer ${owner.body.token}`); assert.ok(audit.body.audit.some((item) => item.action === 'booking.rejected' && item.entityId === booking.body.bookingId));
});
test('booking workflow enforces duplicate requests, approval, and overlap rules', async () => {
  const ownerLogin = await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: 'DemoPass123!' });
  const studentLogin = await request(app).post('/api/auth/register').send({ name: 'Fixture Student', email: `fixture-${Date.now()}@example.test`, password: 'DemoPass123!', role: 'student' });
  const resource = await request(app).post('/api/resources').set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ title: `Booking Fixture ${Date.now()}`, description: 'A fictional fixture for booking integration tests.', category: 'Testing', location: 'Test Lab', eligibility: ['Active student account'] });
  assert.equal(resource.status, 201);
  const startsAt = new Date(Date.now() + 86400000).toISOString(); const endsAt = new Date(Date.now() + 90000000).toISOString();
  const booking = await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${studentLogin.body.token}`).send({ startsAt, endsAt, purpose: 'Complete the integration test fixture.' });
  assert.equal(booking.status, 201);
  const duplicate = await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${studentLogin.body.token}`).send({ startsAt, endsAt, purpose: 'Try to create a duplicate active request.' });
  assert.equal(duplicate.status, 409);
  const approved = await request(app).patch(`/api/bookings/${booking.body.bookingId}/decision`).set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ status: 'approved', reason: 'Approved for the student test project.' });
  assert.equal(approved.status, 200);
  const overlap = await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${studentLogin.body.token}`).send({ startsAt: new Date(Date.now() + 87000000).toISOString(), endsAt: new Date(Date.now() + 91000000).toISOString(), purpose: 'Try an overlapping request after approval.' });
  assert.equal(overlap.status, 409);
  const history = await request(app).get('/api/bookings').set('Authorization', `Bearer ${studentLogin.body.token}`); assert.equal(history.status, 200); assert.ok(history.body.bookings.some((item) => item.id === booking.body.bookingId && item.status === 'approved'));
});
test('owner request review is scoped and dashboard APIs are role protected', async () => {
  const studentLogin = await request(app).post('/api/auth/login').send({ email: 'student@example.test', password: 'DemoPass123!' });
  const ownerLogin = await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: 'DemoPass123!' });
  const studentDashboard = await request(app).get('/api/dashboard/student').set('Authorization', `Bearer ${studentLogin.body.token}`);
  const ownerDashboard = await request(app).get('/api/dashboard/owner').set('Authorization', `Bearer ${ownerLogin.body.token}`);
  assert.equal(studentDashboard.status, 200); assert.ok('availableResources' in studentDashboard.body.stats); assert.ok(Array.isArray(studentDashboard.body.recentBookings));
  assert.equal(ownerDashboard.status, 200); assert.ok('bookedHours' in ownerDashboard.body.stats); assert.ok(Array.isArray(ownerDashboard.body.resources)); assert.ok(Array.isArray(ownerDashboard.body.recentActivity));
  assert.equal((await request(app).get('/api/dashboard/admin').set('Authorization', `Bearer ${studentLogin.body.token}`)).status, 403);
  assert.equal((await request(app).get('/api/owner/bookings').set('Authorization', `Bearer ${studentLogin.body.token}`)).status, 403);
});
test('complete lifecycle records conditions, incidents, notifications, and audit history', async () => {
  const ownerLogin = await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: 'DemoPass123!' });
  const studentLogin = await request(app).post('/api/auth/register').send({ name: 'Lifecycle Student', email: `lifecycle-${Date.now()}@example.test`, password: 'DemoPass123!', role: 'student' });
  const resource = await request(app).post('/api/resources').set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ title: `Lifecycle Fixture ${Date.now()}`, description: 'A fictional resource for lifecycle integration tests.', category: 'Testing', location: 'Lifecycle Lab', eligibility: ['Active student account'] });
  const startsAt = new Date(Date.now() + 86400000).toISOString(); const endsAt = new Date(Date.now() + 90000000).toISOString();
  const booking = await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${studentLogin.body.token}`).send({ startsAt, endsAt, purpose: 'Run the complete lifecycle test.' });
  assert.equal(booking.status, 201);
  assert.equal((await request(app).patch(`/api/bookings/${booking.body.bookingId}/decision`).set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ status: 'approved', reason: 'Lifecycle fixture approved.' })).status, 200);
  db.prepare('UPDATE booking_requests SET starts_at = ?, ends_at = ? WHERE id = ?').run(new Date(Date.now() - 600000).toISOString(), new Date(Date.now() + 600000).toISOString(), booking.body.bookingId);
  const checkIn = await request(app).post(`/api/bookings/${booking.body.bookingId}/check-in`).set('Authorization', `Bearer ${studentLogin.body.token}`).send({ condition: 'Good condition at pickup.', notes: 'All parts present.' }); assert.equal(checkIn.status, 201);
  const report = await request(app).post(`/api/bookings/${booking.body.bookingId}/condition-reports`).set('Authorization', `Bearer ${studentLogin.body.token}`).field('reportType', 'before').field('notes', 'Before-use report without an image.'); assert.equal(report.status, 201);
  const incident = await request(app).post(`/api/bookings/${booking.body.bookingId}/incidents`).set('Authorization', `Bearer ${studentLogin.body.token}`).send({ category: 'delay', description: 'Fictional pickup delay reported for review.' }); assert.equal(incident.status, 201);
  const incidentUpdate = await request(app).patch(`/api/incidents/${incident.body.incidentId}`).set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ status: 'resolved', resolutionNotes: 'Owner reviewed and resolved the fictional delay.' }); assert.equal(incidentUpdate.status, 200);
  const checkOut = await request(app).post(`/api/bookings/${booking.body.bookingId}/check-out`).set('Authorization', `Bearer ${studentLogin.body.token}`).send({ condition: 'Good condition at return.', returnNotes: 'Returned to the lab desk.' }); assert.equal(checkOut.status, 200);
  assert.equal((await request(app).post(`/api/bookings/${booking.body.bookingId}/check-out`).set('Authorization', `Bearer ${studentLogin.body.token}`).send({ condition: 'Duplicate return attempt.' })).status, 409);
  const history = await request(app).get('/api/audit').set('Authorization', `Bearer ${studentLogin.body.token}`); assert.equal(history.status, 200); assert.ok(history.body.audit.some((item) => item.action === 'booking.checked_in')); assert.ok(history.body.audit.some((item) => item.action === 'booking.checked_out'));
  const notifications = await request(app).get('/api/notifications').set('Authorization', `Bearer ${studentLogin.body.token}`); assert.equal(notifications.status, 200); assert.ok(notifications.body.notifications.some((item) => item.type === 'booking_approved'));
});
test('unauthorized lifecycle actions are rejected', async () => {
  const studentLogin = await request(app).post('/api/auth/login').send({ email: 'student@example.test', password: 'DemoPass123!' });
  assert.equal((await request(app).get('/api/admin/audit').set('Authorization', `Bearer ${studentLogin.body.token}`)).status, 403);
  assert.equal((await request(app).post('/api/bookings/999999/check-in').set('Authorization', `Bearer ${studentLogin.body.token}`).send({ condition: 'No booking.' })).status, 404);
});
test('AI resource matching uses the deterministic fallback and verified records', async () => {
  const studentLogin = await request(app).post('/api/auth/login').send({ email: 'student@example.test', password: 'DemoPass123!' });
  const originalKey = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  const response = await request(app).post('/api/ai/resource-match').set('Authorization', `Bearer ${studentLogin.body.token}`).send({ query: 'projector presentation Innovation Lab' });
  if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  assert.equal(response.status, 200); assert.equal(response.body.source, 'fallback'); assert.ok(response.body.recommendations.every((item) => Number.isInteger(item.id))); assert.ok(response.body.recommendations.some((item) => item.title === 'Test Presentation Projector'));
});
test('waitlist promotion advances fairly after cancellation', async () => {
  const ownerLogin = await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: 'DemoPass123!' });
  const firstStudent = await request(app).post('/api/auth/register').send({ name: 'Queue First', email: `queue-first-${Date.now()}@example.test`, password: 'DemoPass123!', role: 'student' });
  const secondStudent = await request(app).post('/api/auth/register').send({ name: 'Queue Second', email: `queue-second-${Date.now()}@example.test`, password: 'DemoPass123!', role: 'student' });
  const resource = await request(app).post('/api/resources').set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ title: `Waitlist Fixture ${Date.now()}`, description: 'A fictional resource for fair allocation tests.', category: 'Testing', location: 'Queue Lab', eligibility: ['Active student account'] });
  const startsAt = new Date(Date.now() + 86400000).toISOString(); const endsAt = new Date(Date.now() + 90000000).toISOString();
  const firstBooking = await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${firstStudent.body.token}`).send({ startsAt, endsAt, purpose: 'First queue reservation.' });
  assert.equal((await request(app).patch(`/api/bookings/${firstBooking.body.bookingId}/decision`).set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ status: 'approved', reason: 'First queue reservation approved.' })).status, 200);
  const queued = await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${secondStudent.body.token}`).send({ startsAt: new Date(Date.now() + 87000000).toISOString(), endsAt: new Date(Date.now() + 91000000).toISOString(), purpose: 'Join the fair waitlist.' });
  assert.equal(queued.status, 201); assert.equal(queued.body.status, 'waitlisted');
  assert.equal((await request(app).patch(`/api/bookings/${firstBooking.body.bookingId}/cancel`).set('Authorization', `Bearer ${firstStudent.body.token}`)).status, 200);
  const history = await request(app).get('/api/bookings').set('Authorization', `Bearer ${secondStudent.body.token}`); assert.equal(history.body.bookings.find((item) => item.id === queued.body.bookingId).status, 'pending');
  const audit = await request(app).get('/api/audit').set('Authorization', `Bearer ${secondStudent.body.token}`); assert.ok(audit.body.audit.some((item) => item.action === 'booking.waitlist_promoted'));
});
test('condition image access is authenticated and role authorized', async () => {
  const ownerLogin = await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: 'DemoPass123!' });
  const studentLogin = await request(app).post('/api/auth/register').send({ name: 'Image Student', email: `image-${Date.now()}@example.test`, password: 'DemoPass123!', role: 'student' });
  const otherStudent = await request(app).post('/api/auth/register').send({ name: 'Other Student', email: `other-${Date.now()}@example.test`, password: 'DemoPass123!', role: 'student' });
  const resource = await request(app).post('/api/resources').set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ title: `Image Fixture ${Date.now()}`, description: 'A fictional resource for image access tests.', category: 'Testing', location: 'Image Lab', eligibility: ['Active student account'] });
  const booking = await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${studentLogin.body.token}`).send({ startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), purpose: 'Test secure image access.' });
  assert.equal((await request(app).patch(`/api/bookings/${booking.body.bookingId}/decision`).set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ status: 'approved', reason: 'Image test approved.' })).status, 200);
  const report = await request(app).post(`/api/bookings/${booking.body.bookingId}/condition-reports`).set('Authorization', `Bearer ${studentLogin.body.token}`).field('reportType', 'before').field('notes', 'Image access fixture.').attach('image', Buffer.from('fake-png-content'), 'condition.png'); assert.equal(report.status, 201);
  const image = await request(app).get(`/api/condition-reports/${report.body.reportId}/image`).set('Authorization', `Bearer ${studentLogin.body.token}`); assert.equal(image.status, 200);
  assert.equal((await request(app).get(`/api/condition-reports/${report.body.reportId}/image`).set('Authorization', `Bearer ${otherStudent.body.token}`)).status, 404);
});
test('upcoming notification delivery is persistent and deduplicated', async () => {
  const ownerLogin = await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: 'DemoPass123!' });
  const studentLogin = await request(app).post('/api/auth/register').send({ name: 'Notification Student', email: `notify-${Date.now()}@example.test`, password: 'DemoPass123!', role: 'student' });
  const resource = await request(app).post('/api/resources').set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ title: `Notification Fixture ${Date.now()}`, description: 'A fictional resource for notification tests.', category: 'Testing', location: 'Notification Lab', eligibility: ['Active student account'] });
  const booking = await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${studentLogin.body.token}`).send({ startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString(), purpose: 'Test notification deduplication.' });
  await request(app).patch(`/api/bookings/${booking.body.bookingId}/decision`).set('Authorization', `Bearer ${ownerLogin.body.token}`).send({ status: 'approved', reason: 'Notification test approved.' });
  const first = await request(app).get('/api/notifications').set('Authorization', `Bearer ${studentLogin.body.token}`); const second = await request(app).get('/api/notifications').set('Authorization', `Bearer ${studentLogin.body.token}`); assert.equal(first.status, 200); assert.equal(second.status, 200); const firstCount = first.body.notifications.filter((item) => item.type === 'upcoming_booking').length; const secondCount = second.body.notifications.filter((item) => item.type === 'upcoming_booking').length; assert.equal(firstCount, 1); assert.equal(secondCount, 1);
});

test('booking eligibility and availability stay enforced on the server', async () => {
  const student = await request(app).post('/api/auth/register').send({ name:'Eligibility Student', email:'eligibility@example.test', password:'DemoPass123!', role:'student' });
  const owner = await request(app).post('/api/auth/login').send({ email:'owner@example.test', password:'DemoPass123!' });
  const resource = await request(app).post('/api/resources').set('Authorization', `Bearer ${owner.body.token}`).send({ title:'Restricted equipment', description:'Equipment requiring verified supervisor training.', category:'Laboratory', location:'Training room', eligibility:['Supervisor training required'] });
  const payload = { startsAt:new Date(Date.now()+86400000).toISOString(), endsAt:new Date(Date.now()+90000000).toISOString(), purpose:'Check enforced access requirements.' };
  assert.equal((await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${student.body.token}`).send(payload)).status,403);
  await request(app).patch(`/api/resources/${resource.body.resourceId}`).set('Authorization', `Bearer ${owner.body.token}`).send({ eligibility:['Active student account'], availability:'maintenance' });
  assert.equal((await request(app).post(`/api/resources/${resource.body.resourceId}/bookings`).set('Authorization', `Bearer ${student.body.token}`).send(payload)).status,409);
});
