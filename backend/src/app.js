import express from 'express';
import { isDiscoveryExcluded, publicResources } from './discovery.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { matchResourcesWithGemini } from './ai.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from './db/index.js';
import './db/migrate.js';
import { createToken, requireAuth, allowRoles } from './auth.js';
import { ResourceImageError, resourcePhotoUpload, resourcePayload, validateResourcePhoto, resourcePhotoStorage, withResourcePhoto, registerResourcePhotoReadRoute } from './resource-images.js';
import { PricingError, MAX_PRICE_PAISE, resourcePricingInput, bookingEstimate } from './pricing.js';

const app = express();
const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './data/uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const resourcePhotos = resourcePhotoStorage(uploadDir);
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, callback) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? callback(null, true) : callback(new Error('Only JPEG, PNG, and WebP images are allowed.')) });
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 }));
registerResourcePhotoReadRoute(app, db, resourcePhotos);
const registerSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().email().max(160), password: z.string().min(8).max(128), role: z.enum(['student', 'owner']).default('student') });
const resourceSchema = z.object({ title: z.string().trim().min(2).max(120), description: z.string().trim().min(10).max(2000), category: z.string().trim().min(2).max(80), location: z.string().trim().min(2).max(120), capacity: z.coerce.number().int().min(1).max(1000).default(1), availability: z.enum(['available', 'unavailable', 'maintenance']).default('available'), accessRules: z.string().trim().max(1000).default(''), eligibility: z.array(z.string().trim().min(2).max(200)).max(20).default([]) });
const resourceUpdateSchema = resourceSchema.partial();
const timeWindowSchema = z.object({ startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }) });
const bookingSchema = timeWindowSchema.extend({ purpose: z.string().trim().min(5).max(1000), expectedHourlyPricePaise: z.number().int().min(0).max(MAX_PRICE_PAISE).optional() });
const decisionSchema = z.object({ status: z.enum(['approved', 'rejected']), reason: z.string().trim().min(3).max(1000) });
const conditionSchema = z.object({ condition: z.string().trim().min(3).max(2000), notes: z.string().trim().max(2000).optional() });
const checkoutSchema = conditionSchema.extend({ returnNotes: z.string().trim().max(2000).optional() });
const incidentSchema = z.object({ category: z.enum(['damage', 'delay', 'missing_equipment', 'other']), description: z.string().trim().min(5).max(2000) });
const incidentUpdateSchema = z.object({ status: z.enum(['open', 'investigating', 'resolved', 'dismissed']), resolutionNotes: z.string().trim().min(3).max(2000) });
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });
const audit = (actorId, action, entityType, entityId, metadata = {}) => db.prepare('INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?)').run(actorId, action, entityType, entityId, JSON.stringify(metadata));
const notify = (userId, type, title, message, entityType, entityId, dedupeKey) => db.prepare('INSERT OR IGNORE INTO notifications (user_id, type, title, message, entity_type, entity_id, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, type, title, message, entityType, entityId, dedupeKey);
const toIso = (value) => new Date(value).toISOString();
const resourceById = (id) => db.prepare('SELECT id, owner_id AS ownerId, title, description, category, location, capacity, availability, access_rules AS accessRules, image_path AS imagePath, hourly_price_paise AS hourlyPricePaise FROM resources WHERE id = ?').get(Number(id));
const bookingWithResource = `SELECT b.id, b.resource_id AS resourceId, b.student_id AS studentId, b.status, b.starts_at AS startsAt, b.ends_at AS endsAt, b.purpose, b.quoted_hourly_price_paise AS quotedHourlyPricePaise, b.estimated_total_paise AS estimatedTotalPaise, b.decision_reason AS decisionReason, b.waitlist_position AS waitlistPosition, b.created_at AS createdAt, b.reviewed_at AS reviewedAt, r.title AS resourceTitle, r.location, u.name AS studentName, u.email AS studentEmail FROM booking_requests b JOIN resources r ON r.id = b.resource_id JOIN users u ON u.id = b.student_id`;
const isEligibleStudent = (studentId, resourceId) => db.prepare("SELECT COUNT(*) AS invalid FROM eligibility_requirements WHERE resource_id = ? AND LOWER(requirement) != 'active student account'").get(resourceId).invalid === 0 && Boolean(db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(studentId));
const promoteWaitlist = (resourceId) => { const queue = db.prepare('SELECT w.id, w.student_id AS studentId, w.booking_id AS bookingId, w.position, b.starts_at AS startsAt, b.ends_at AS endsAt, r.title FROM resource_waitlist w JOIN booking_requests b ON b.id = w.booking_id JOIN resources r ON r.id = w.resource_id WHERE w.resource_id = ? AND b.status = \'waitlisted\' ORDER BY w.position, w.created_at').all(resourceId); for (const item of queue) { if (!isEligibleStudent(item.studentId, resourceId)) { audit(item.studentId, 'booking.waitlist_skipped', 'booking', item.bookingId, { reason: 'eligibility' }); continue; } const active = db.prepare("SELECT COUNT(*) AS count FROM booking_requests WHERE student_id = ? AND status IN ('pending', 'approved', 'waitlisted') AND id != ? AND ends_at > CURRENT_TIMESTAMP").get(item.studentId, item.bookingId).count; const overlap = db.prepare("SELECT id FROM booking_requests WHERE resource_id = ? AND status = 'approved' AND starts_at < ? AND ends_at > ?").get(resourceId, item.endsAt, item.startsAt); if (active >= 3 || overlap) { audit(item.studentId, 'booking.waitlist_skipped', 'booking', item.bookingId, { reason: active >= 3 ? 'booking_limit' : 'schedule_conflict' }); continue; } db.prepare("UPDATE booking_requests SET status = 'pending', waitlist_position = NULL WHERE id = ?").run(item.bookingId); db.prepare('DELETE FROM resource_waitlist WHERE id = ?').run(item.id); db.prepare('UPDATE resource_waitlist SET position = position - 1 WHERE resource_id = ? AND position > ?').run(resourceId, item.position); db.prepare('UPDATE booking_requests SET waitlist_position = waitlist_position - 1 WHERE resource_id = ? AND status = \'waitlisted\' AND waitlist_position > ?').run(resourceId, item.position); audit(item.studentId, 'booking.waitlist_promoted', 'booking', item.bookingId, { reason: 'fair allocation queue advanced' }); notify(item.studentId, 'booking_promoted', 'Waitlist promotion', `Your request for ${item.title} is now pending owner review after the queue advanced.`, 'booking', item.bookingId, `booking-${item.bookingId}-promoted`); break; } };

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/auth/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Invalid registration details.', details: parsed.error.flatten() });
  const { name, email, password, role } = parsed.data;
  try { const result = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email.toLowerCase(), bcrypt.hashSync(password, 12), role); const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid); return res.status(201).json({ user: publicUser(user), token: createToken(user) }); } catch (error) { if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account with that email already exists.' }); throw error; }
});
app.post('/api/auth/login', (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Email and password are required.' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(parsed.data.email.toLowerCase());
  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password.' });
  res.json({ user: publicUser(user), token: createToken(user) });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.sub) }));

app.get('/api/resources', (req, res) => {
  const params = []; let sql = `SELECT r.id, r.owner_id AS ownerId, r.title, r.description, r.category, r.location, r.capacity, r.availability, r.access_rules AS accessRules, r.image_path AS imagePath, r.hourly_price_paise AS hourlyPricePaise, r.created_at AS createdAt, u.name AS ownerName, GROUP_CONCAT(e.requirement, '||') AS eligibility FROM resources r JOIN users u ON u.id = r.owner_id LEFT JOIN eligibility_requirements e ON e.resource_id = r.id WHERE 1=1`;
  if (req.query.category) { sql += ' AND r.category = ?'; params.push(req.query.category); } if (req.query.availability) { sql += ' AND r.availability = ?'; params.push(req.query.availability); } if (req.query.search) { sql += ' AND (r.title LIKE ? OR r.description LIKE ? OR r.location LIKE ?)'; const q = `%${req.query.search}%`; params.push(q, q, q); }
  sql += ' GROUP BY r.id ORDER BY r.created_at DESC'; const rows = db.prepare(sql).all(...params).map((row) => withResourcePhoto({ ...row, eligibility: row.eligibility ? row.eligibility.split('||') : [] })); res.json({ resources: publicResources(rows) });
});
app.post('/api/ai/resource-match', requireAuth, allowRoles('student', 'owner', 'admin'), async (req, res) => {
  const parsed = z.object({ query: z.string().trim().min(3).max(1000) }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Describe the resource you need in at least 3 characters.' });
  const resources = db.prepare("SELECT r.id, r.owner_id AS ownerId, r.title, r.description, r.category, r.location, r.availability, r.access_rules AS accessRules, r.image_path AS imagePath, r.hourly_price_paise AS hourlyPricePaise, GROUP_CONCAT(e.requirement, '||') AS eligibility FROM resources r LEFT JOIN eligibility_requirements e ON e.resource_id = r.id WHERE r.availability = 'available' GROUP BY r.id ORDER BY r.created_at DESC").all().map((row) => withResourcePhoto({ ...row, eligibility: row.eligibility ? row.eligibility.split('||') : [] }));
  const result = await matchResourcesWithGemini(parsed.data.query, publicResources(resources)); res.json(result);
});
app.get('/api/resources/:id', (req, res) => { const row = db.prepare(`SELECT r.id, r.owner_id AS ownerId, r.title, r.description, r.category, r.location, r.capacity, r.availability, r.access_rules AS accessRules, r.image_path AS imagePath, r.hourly_price_paise AS hourlyPricePaise, r.created_at AS createdAt, u.name AS ownerName FROM resources r JOIN users u ON u.id = r.owner_id WHERE r.id = ?`).get(Number(req.params.id)); if (!row) return res.status(404).json({ error: 'Resource not found.' }); row.eligibility = db.prepare('SELECT requirement FROM eligibility_requirements WHERE resource_id = ?').all(row.id).map((x) => x.requirement); res.json({ resource: withResourcePhoto(row) }); });
app.post('/api/resources', requireAuth, allowRoles('owner', 'admin'), resourcePhotoUpload, asyncRoute(async (req, res) => {
  const body = resourcePayload(req);
  const parsed = resourceSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid resource details.', details: parsed.error.flatten() });
  const { hourlyPricePaise } = resourcePricingInput(body);
  if (body.removeImage !== undefined && typeof body.removeImage !== 'boolean') throw new ResourceImageError('Invalid image removal option.');
  if (body.removeImage && req.file) throw new ResourceImageError('Choose a replacement image or remove the image, not both.');
  const photo = await validateResourcePhoto(req.file);
  const { title, description, category, location, capacity, availability, accessRules, eligibility } = parsed.data;
  resourcePhotos.write(photo);
  let resourceId;
  try {
    resourceId = db.transaction(() => {
      const result = db.prepare('INSERT INTO resources (owner_id, title, description, category, location, capacity, availability, access_rules, image_path, hourly_price_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(req.user.sub, title, description, category, location, capacity, availability, accessRules, photo?.filename || null, hourlyPricePaise);
      const insert = db.prepare('INSERT INTO eligibility_requirements (resource_id, requirement) VALUES (?, ?)');
      eligibility.forEach(item => insert.run(result.lastInsertRowid, item));
      audit(req.user.sub, 'resource.created', 'resource', result.lastInsertRowid, { title, category, capacity, hourlyPricePaise, hasPhoto: Boolean(photo) });
      return result.lastInsertRowid;
    })();
  } catch (error) { resourcePhotos.remove(photo?.filename); throw error; }
  res.status(201).json({ resourceId, resource: withResourcePhoto(resourceById(resourceId)) });
}));

app.patch('/api/resources/:id', requireAuth, allowRoles('owner', 'admin'), (req, res, next) => {
  const resource = resourceById(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found.' });
  if (req.user.role === 'owner' && resource.ownerId !== req.user.sub) return res.status(403).json({ error: 'You can only modify your own resources.' });
  req.resource = resource;
  next();
}, resourcePhotoUpload, asyncRoute(async (req, res) => {
  const resource = req.resource;
  const body = resourcePayload(req);
  if (body.removeImage !== undefined && typeof body.removeImage !== 'boolean') throw new ResourceImageError('Invalid image removal option.');
  const removeImage = body.removeImage === true;
  // Retain admin metadata oversight; only the actual owner may change a photo.
  if ((req.file || removeImage) && resource.ownerId !== req.user.sub) return res.status(403).json({ error: 'Only the resource owner can change its photo.' });
  if (removeImage && req.file) throw new ResourceImageError('Choose a replacement image or remove the image, not both.');
  const parsed = resourceUpdateSchema.safeParse(body);
  // Zod defaults belong to create requests, not omitted PATCH fields.
  const fields = parsed.success ? { ...Object.fromEntries(Object.entries(parsed.data).filter(([key]) => Object.hasOwn(body, key))), ...resourcePricingInput(body, true) } : {};
  if (fields.hourlyPricePaise !== undefined && fields.hourlyPricePaise !== resource.hourlyPricePaise && resource.ownerId !== req.user.sub) return res.status(403).json({ error: 'Only the resource owner can change its hourly price.' });
  if (!parsed.success || (!Object.keys(fields).length && !req.file && !removeImage)) return res.status(400).json({ error: 'Valid resource changes or a photo are required.' });
  const photo = await validateResourcePhoto(req.file);
  const updates = [], values = [];
  for (const [key, column] of [['title', 'title'], ['description', 'description'], ['category', 'category'], ['location', 'location'], ['capacity', 'capacity'], ['availability', 'availability'], ['accessRules', 'access_rules']]) {
    if (fields[key] !== undefined) { updates.push(column + ' = ?'); values.push(fields[key]); }
  }
  if (photo || removeImage) { updates.push('image_path = ?'); values.push(photo?.filename || null); }
  if (fields.hourlyPricePaise !== undefined) { updates.push('hourly_price_paise = ?'); values.push(fields.hourlyPricePaise); }
  resourcePhotos.write(photo);
  let retiredImage;
  try {
    db.transaction(() => {
      // Re-read after asynchronous decoding so concurrent replacements retire
      // the image that was actually current at commit time.
      retiredImage = resourceById(resource.id).imagePath;
      if (updates.length) db.prepare('UPDATE resources SET ' + updates.join(', ') + ' WHERE id = ?').run(...values, resource.id);
      if (fields.eligibility) {
        db.prepare('DELETE FROM eligibility_requirements WHERE resource_id = ?').run(resource.id);
        const insert = db.prepare('INSERT INTO eligibility_requirements (resource_id, requirement) VALUES (?, ?)');
        fields.eligibility.forEach(item => insert.run(resource.id, item));
      }
      audit(req.user.sub, 'resource.updated', 'resource', resource.id, { ...fields, ...(photo || removeImage ? { photoChanged: true } : {}) });
    })();
  } catch (error) { resourcePhotos.remove(photo?.filename); throw error; }
  if (photo || removeImage) resourcePhotos.remove(retiredImage);
  res.json({ resource: withResourcePhoto(resourceById(resource.id)) });
}));

app.get('/api/owner/resources', requireAuth, allowRoles('owner', 'admin'), (req, res) => { const sql = req.user.role === 'admin' ? "SELECT r.id, r.owner_id AS ownerId, r.title, r.description, r.category, r.location, r.capacity, r.availability, r.access_rules AS accessRules, r.image_path AS imagePath, r.hourly_price_paise AS hourlyPricePaise, GROUP_CONCAT(e.requirement, '||') AS eligibility FROM resources r LEFT JOIN eligibility_requirements e ON e.resource_id = r.id GROUP BY r.id ORDER BY r.created_at DESC" : "SELECT r.id, r.owner_id AS ownerId, r.title, r.description, r.category, r.location, r.capacity, r.availability, r.access_rules AS accessRules, r.image_path AS imagePath, r.hourly_price_paise AS hourlyPricePaise, GROUP_CONCAT(e.requirement, '||') AS eligibility FROM resources r LEFT JOIN eligibility_requirements e ON e.resource_id = r.id WHERE r.owner_id = ? GROUP BY r.id ORDER BY r.created_at DESC"; const resources = (req.user.role === 'admin' ? db.prepare(sql).all() : db.prepare(sql).all(req.user.sub)).map((row) => withResourcePhoto({ ...row, eligibility: row.eligibility ? row.eligibility.split('||') : [] })); res.json({ resources: resources.map(resource => ({ ...resource, discoveryExcluded: isDiscoveryExcluded(resource) })) }); });

app.post('/api/resources/:id/estimate', (req, res) => {
  const parsed = timeWindowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid start and end time are required.' });
  const resource = resourceById(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found.' });
  if (new Date(parsed.data.startsAt) <= new Date()) return res.status(400).json({ error: 'Bookings must start in the future.' });
  res.json({ estimate: bookingEstimate(resource.hourlyPricePaise, parsed.data.startsAt, parsed.data.endsAt) });
});

app.post('/api/resources/:id/bookings', requireAuth, allowRoles('student'), (req, res) => {
  const parsed = bookingSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Start time, end time, and purpose are required.', details: parsed.error.flatten() });
  const startsAt = toIso(parsed.data.startsAt); const endsAt = toIso(parsed.data.endsAt); if (new Date(startsAt) >= new Date(endsAt)) return res.status(400).json({ error: 'End time must be after start time.' }); if (new Date(startsAt) <= new Date()) return res.status(400).json({ error: 'Bookings must start in the future.' });
  const resource = resourceById(req.params.id); if (!resource) return res.status(404).json({ error: 'Resource not found.' }); if (resource.availability !== 'available') return res.status(409).json({ error: 'This resource is not currently available.' });
  const requirements = db.prepare('SELECT requirement FROM eligibility_requirements WHERE resource_id = ?').all(resource.id).map((row) => row.requirement); if (requirements.some((requirement) => requirement.toLowerCase() === 'active student account' ? req.user.role !== 'student' : true)) return res.status(403).json({ error: 'You do not meet this resource\'s eligibility requirements.' });
  const estimate = bookingEstimate(resource.hourlyPricePaise, startsAt, endsAt);
  if (parsed.data.expectedHourlyPricePaise !== undefined && parsed.data.expectedHourlyPricePaise !== resource.hourlyPricePaise) return res.status(409).json({ error: 'The hourly price has changed. Review the updated estimate before requesting a booking.', code: 'PRICE_CHANGED', hourlyPricePaise: resource.hourlyPricePaise });
  const duplicate = db.prepare("SELECT id FROM booking_requests WHERE resource_id = ? AND student_id = ? AND status IN ('pending', 'approved', 'waitlisted') AND cancelled_at IS NULL").get(resource.id, req.user.sub); if (duplicate) return res.status(409).json({ error: 'You already have an active request for this resource.' });
  const activeCount = db.prepare("SELECT COUNT(*) AS count FROM booking_requests WHERE student_id = ? AND status IN ('pending', 'approved', 'waitlisted') AND cancelled_at IS NULL AND ends_at > CURRENT_TIMESTAMP").get(req.user.sub).count; if (activeCount >= 3) return res.status(429).json({ error: 'Booking limit reached. Complete or cancel an active booking before requesting another.' });
  const overlap = db.prepare("SELECT id FROM booking_requests WHERE resource_id = ? AND status = 'approved' AND starts_at < ? AND ends_at > ?").get(resource.id, endsAt, startsAt); const status = overlap ? 'waitlisted' : 'pending';
  const create = db.transaction(() => { const position = status === 'waitlisted' ? (db.prepare('SELECT COALESCE(MAX(position), 0) AS position FROM resource_waitlist WHERE resource_id = ?').get(resource.id).position + 1) : null; const result = db.prepare('INSERT INTO booking_requests (resource_id, student_id, starts_at, ends_at, purpose, status, waitlist_position, quoted_hourly_price_paise, estimated_total_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(resource.id, req.user.sub, startsAt, endsAt, parsed.data.purpose, status, position, estimate.hourlyPricePaise, estimate.estimatedTotalPaise); if (status === 'waitlisted') db.prepare('INSERT INTO resource_waitlist (resource_id, student_id, booking_id, position) VALUES (?, ?, ?, ?)').run(resource.id, req.user.sub, result.lastInsertRowid, position); audit(req.user.sub, 'booking.created', 'booking', result.lastInsertRowid, { resourceId: resource.id, status }); if (status === 'waitlisted') notify(req.user.sub, 'booking_waitlisted', 'Booking waitlisted', `Your request for ${resource.title} is waitlisted at position ${position} because the requested window conflicts with an approved booking.`, 'booking', result.lastInsertRowid, `booking-${result.lastInsertRowid}-waitlisted`); return result.lastInsertRowid; });
  res.status(201).json({ bookingId: create(), status, estimate, explanation: status === 'waitlisted' ? 'The requested window conflicts with an approved booking; you were placed on the transparent waitlist.' : 'Your request is pending owner review.' });
});

app.get('/api/bookings', requireAuth, allowRoles('student'), (req, res) => res.json({ bookings: db.prepare(`${bookingWithResource} WHERE b.student_id = ? ORDER BY b.starts_at DESC`).all(req.user.sub) }));
app.patch('/api/bookings/:id/cancel', requireAuth, allowRoles('student'), (req, res) => { const booking = db.prepare('SELECT id, status, resource_id AS resourceId FROM booking_requests WHERE id = ? AND student_id = ?').get(Number(req.params.id), req.user.sub); if (!booking) return res.status(404).json({ error: 'Booking not found.' }); if (!['pending', 'approved', 'waitlisted'].includes(booking.status)) return res.status(409).json({ error: 'This booking cannot be cancelled.' }); const checkedIn = db.prepare('SELECT id FROM check_ins WHERE booking_id = ? AND checked_out_at IS NULL').get(booking.id); if (checkedIn) return res.status(409).json({ error: 'Check out before cancelling an in-use booking.' }); const cancel = db.transaction(() => { db.prepare("UPDATE booking_requests SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = ?").run(booking.id); audit(req.user.sub, 'booking.cancelled', 'booking', booking.id); promoteWaitlist(booking.resourceId); }); cancel(); res.json({ status: 'cancelled' }); });

app.get('/api/owner/bookings', requireAuth, allowRoles('owner', 'admin'), (req, res) => { const sql = req.user.role === 'admin' ? `${bookingWithResource} ORDER BY b.created_at DESC` : `${bookingWithResource} WHERE r.owner_id = ? ORDER BY b.created_at DESC`; res.json({ bookings: req.user.role === 'admin' ? db.prepare(sql).all() : db.prepare(sql).all(req.user.sub) }); });
app.patch('/api/bookings/:id/decision', requireAuth, allowRoles('owner', 'admin'), (req, res) => {
  const parsed = decisionSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'A valid decision and reason are required.' }); const booking = db.prepare(`${bookingWithResource} WHERE b.id = ?`).get(Number(req.params.id)); if (!booking) return res.status(404).json({ error: 'Booking not found.' }); const resource = resourceById(booking.resourceId); if (req.user.role === 'owner' && resource.ownerId !== req.user.sub) return res.status(403).json({ error: 'You can only review requests for your own resources.' }); if (!['pending', 'waitlisted'].includes(booking.status)) return res.status(409).json({ error: 'Only pending or waitlisted requests can be reviewed.' });
  if (parsed.data.status === 'approved') { if (resource.availability !== 'available') return res.status(409).json({ error: 'This resource is not currently available.' }); const overlap = db.prepare("SELECT id FROM booking_requests WHERE resource_id = ? AND status = 'approved' AND starts_at < ? AND ends_at > ?").get(booking.resourceId, booking.endsAt, booking.startsAt); if (overlap) return res.status(409).json({ error: 'This request overlaps an approved booking.' }); }
  const decide = db.transaction(() => { db.prepare('UPDATE booking_requests SET status = ?, decision_reason = ?, reviewed_at = CURRENT_TIMESTAMP, waitlist_position = NULL WHERE id = ?').run(parsed.data.status, parsed.data.reason, booking.id); if (booking.status === 'waitlisted') { db.prepare('DELETE FROM resource_waitlist WHERE booking_id = ?').run(booking.id); db.prepare('UPDATE resource_waitlist SET position = position - 1 WHERE resource_id = ? AND position > ?').run(booking.resourceId, booking.waitlistPosition); db.prepare('UPDATE booking_requests SET waitlist_position = waitlist_position - 1 WHERE resource_id = ? AND status = \'waitlisted\' AND waitlist_position > ?').run(booking.resourceId, booking.waitlistPosition); } audit(req.user.sub, `booking.${parsed.data.status}`, 'booking', booking.id, { reason: parsed.data.reason }); notify(booking.studentId, `booking_${parsed.data.status}`, `Booking ${parsed.data.status}`, `Your request for ${booking.resourceTitle} was ${parsed.data.status}. Reason: ${parsed.data.reason}`, 'booking', booking.id, `booking-${booking.id}-${parsed.data.status}`); if (parsed.data.status === 'rejected') promoteWaitlist(booking.resourceId); }); decide(); res.json({ status: parsed.data.status, reason: parsed.data.reason });
});

const lifecycleBooking = `SELECT b.id, b.resource_id AS resourceId, b.student_id AS studentId, b.status, b.starts_at AS startsAt, b.ends_at AS endsAt, r.owner_id AS ownerId, r.title AS resourceTitle FROM booking_requests b JOIN resources r ON r.id = b.resource_id WHERE b.id = ?`;
const canAccessLifecycle = (booking, user) => user.role === 'admin' || booking.studentId === user.sub || booking.ownerId === user.sub;

app.post('/api/bookings/:id/check-in', requireAuth, allowRoles('student'), (req, res) => {
  const parsed = conditionSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Initial condition is required.' }); const booking = db.prepare(lifecycleBooking).get(Number(req.params.id)); if (!booking || booking.studentId !== req.user.sub) return res.status(404).json({ error: 'Booking not found.' }); if (booking.status !== 'approved') return res.status(409).json({ error: 'Only approved bookings can be checked in.' }); const now = new Date(); if (now < new Date(booking.startsAt) || now > new Date(booking.endsAt)) return res.status(409).json({ error: 'Check-in is only available during the approved booking window.' }); if (db.prepare('SELECT id FROM check_ins WHERE booking_id = ?').get(booking.id)) return res.status(409).json({ error: 'This booking has already been checked in.' });
  const perform = db.transaction(() => { const result = db.prepare('INSERT INTO check_ins (booking_id, checked_in_at, initial_condition) VALUES (?, CURRENT_TIMESTAMP, ?)').run(booking.id, parsed.data.condition); db.prepare("INSERT INTO condition_reports (booking_id, report_type, notes) VALUES (?, 'before', ?)").run(booking.id, `${parsed.data.condition}${parsed.data.notes ? `\n${parsed.data.notes}` : ''}`); audit(req.user.sub, 'booking.checked_in', 'booking', booking.id, { condition: parsed.data.condition }); notify(booking.ownerId, 'booking_checked_in', 'Resource checked in', `${booking.resourceTitle} was checked in by the student.`, 'booking', booking.id, `booking-${booking.id}-checked-in`); return result.lastInsertRowid; }); perform(); res.status(201).json({ checkInId: db.prepare('SELECT id FROM check_ins WHERE booking_id = ?').get(booking.id).id, status: 'checked_in' });
});

app.post('/api/bookings/:id/check-out', requireAuth, allowRoles('student'), (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Final condition is required.' }); const booking = db.prepare(lifecycleBooking).get(Number(req.params.id)); if (!booking || booking.studentId !== req.user.sub) return res.status(404).json({ error: 'Booking not found.' }); const checkIn = db.prepare('SELECT id, checked_out_at FROM check_ins WHERE booking_id = ?').get(booking.id); if (!checkIn) return res.status(409).json({ error: 'Check in before checking out.' }); if (checkIn.checked_out_at) return res.status(409).json({ error: 'This booking has already been checked out.' });
  const perform = db.transaction(() => { db.prepare('UPDATE check_ins SET checked_out_at = CURRENT_TIMESTAMP, final_condition = ?, return_notes = ? WHERE booking_id = ?').run(parsed.data.condition, parsed.data.returnNotes || '', booking.id); db.prepare("INSERT INTO condition_reports (booking_id, report_type, notes) VALUES (?, 'after', ?)").run(booking.id, `${parsed.data.condition}${parsed.data.notes ? `\n${parsed.data.notes}` : ''}`); audit(req.user.sub, 'booking.checked_out', 'booking', booking.id, { condition: parsed.data.condition }); notify(booking.ownerId, 'booking_checked_out', 'Resource returned', `${booking.resourceTitle} was returned by the student.`, 'booking', booking.id, `booking-${booking.id}-checked-out`); }); perform(); res.json({ status: 'checked_out' });
});

app.post('/api/bookings/:id/condition-reports', requireAuth, upload.single('image'), (req, res) => {
  const booking = db.prepare(lifecycleBooking).get(Number(req.params.id)); if (!booking || !canAccessLifecycle(booking, req.user)) return res.status(404).json({ error: 'Booking not found.' }); const reportType = req.body.reportType; const parsed = conditionSchema.safeParse({ condition: req.body.notes, notes: req.body.notes }); if (!['before', 'after'].includes(reportType) || !parsed.success) return res.status(400).json({ error: 'Report type and notes are required.' }); let imagePath = null; if (req.file) { const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.file.mimetype]; if (!extension) return res.status(400).json({ error: 'Only JPEG, PNG, and WebP images are allowed.' }); const filename = `${crypto.randomUUID()}${extension}`; fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer, { flag: 'wx' }); imagePath = filename; }
  const result = db.prepare('INSERT INTO condition_reports (booking_id, report_type, notes, image_path) VALUES (?, ?, ?, ?)').run(booking.id, reportType, req.body.notes, imagePath); audit(req.user.sub, `condition.${reportType}`, 'booking', booking.id, { reportId: result.lastInsertRowid, hasImage: Boolean(imagePath) }); res.status(201).json({ reportId: result.lastInsertRowid, reportType });
});

app.get('/api/bookings/:id/condition-reports', requireAuth, (req, res) => { const booking = db.prepare(lifecycleBooking).get(Number(req.params.id)); if (!booking || !canAccessLifecycle(booking, req.user)) return res.status(404).json({ error: 'Booking not found.' }); const reports = db.prepare("SELECT id, report_type AS reportType, notes, CASE WHEN image_path IS NOT NULL THEN 1 ELSE 0 END AS hasImage, CASE WHEN image_path IS NOT NULL THEN '/api/condition-reports/' || id || '/image' ELSE NULL END AS imageUrl, created_at AS createdAt FROM condition_reports WHERE booking_id = ? ORDER BY created_at").all(booking.id); res.json({ reports }); });
app.get('/api/condition-reports/:id/image', requireAuth, (req, res) => { const report = db.prepare('SELECT cr.id, cr.image_path AS imagePath, b.student_id AS studentId, r.owner_id AS ownerId FROM condition_reports cr JOIN booking_requests b ON b.id = cr.booking_id JOIN resources r ON r.id = b.resource_id WHERE cr.id = ?').get(Number(req.params.id)); if (!report || !report.imagePath || !(req.user.role === 'admin' || req.user.sub === report.studentId || req.user.sub === report.ownerId)) return res.status(404).json({ error: 'Condition image not found.' }); const filename = path.basename(report.imagePath); if (filename !== report.imagePath || !/^[a-f0-9-]+\.(jpg|png|webp)$/.test(filename)) return res.status(404).json({ error: 'Condition image not found.' }); const file = path.join(uploadDir, filename); if (!fs.existsSync(file)) return res.status(404).json({ error: 'Condition image not found.' }); res.sendFile(filename, { root: uploadDir }); });

app.post('/api/bookings/:id/incidents', requireAuth, (req, res) => { const parsed = incidentSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Incident category and description are required.' }); const booking = db.prepare(lifecycleBooking).get(Number(req.params.id)); if (!booking || !canAccessLifecycle(booking, req.user)) return res.status(404).json({ error: 'Booking not found.' }); const create = db.transaction(() => { const result = db.prepare('INSERT INTO incidents (booking_id, reported_by, category, description) VALUES (?, ?, ?, ?)').run(booking.id, req.user.sub, parsed.data.category, parsed.data.description); audit(req.user.sub, 'incident.created', 'incident', result.lastInsertRowid, { bookingId: booking.id }); const recipient = req.user.sub === booking.ownerId ? booking.studentId : booking.ownerId; notify(recipient, 'incident_created', 'Incident reported', `An incident was reported for ${booking.resourceTitle}.`, 'incident', result.lastInsertRowid, `incident-${result.lastInsertRowid}-created`); return result.lastInsertRowid; }); res.status(201).json({ incidentId: create(), status: 'open' }); });
app.get('/api/incidents', requireAuth, (req, res) => { let sql = 'SELECT i.id, i.booking_id AS bookingId, i.reported_by AS reportedBy, i.category, i.description, i.status, i.resolution_notes AS resolutionNotes, i.created_at AS createdAt, r.title AS resourceTitle FROM incidents i LEFT JOIN booking_requests b ON b.id = i.booking_id LEFT JOIN resources r ON r.id = b.resource_id'; const params = []; if (req.user.role === 'student') { sql += ' WHERE i.reported_by = ? OR b.student_id = ?'; params.push(req.user.sub, req.user.sub); } else if (req.user.role === 'owner') { sql += ' WHERE r.owner_id = ?'; params.push(req.user.sub); } sql += ' ORDER BY i.created_at DESC'; res.json({ incidents: db.prepare(sql).all(...params) }); });
app.patch('/api/incidents/:id', requireAuth, allowRoles('owner', 'admin'), (req, res) => { const parsed = incidentUpdateSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Status and resolution notes are required.' }); const incident = db.prepare('SELECT i.id, i.reported_by AS reportedBy, r.owner_id AS ownerId, r.title FROM incidents i LEFT JOIN booking_requests b ON b.id = i.booking_id LEFT JOIN resources r ON r.id = b.resource_id WHERE i.id = ?').get(Number(req.params.id)); if (!incident) return res.status(404).json({ error: 'Incident not found.' }); if (req.user.role === 'owner' && incident.ownerId !== req.user.sub) return res.status(403).json({ error: 'You can only review incidents for your resources.' }); db.prepare('UPDATE incidents SET status = ?, resolution_notes = ?, resolved_at = CASE WHEN ? IN (\'resolved\', \'dismissed\') THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE id = ?').run(parsed.data.status, parsed.data.resolutionNotes, parsed.data.status, incident.id); audit(req.user.sub, 'incident.updated', 'incident', incident.id, parsed.data); notify(incident.reportedBy, 'incident_updated', 'Incident updated', `An incident for ${incident.title} is now ${parsed.data.status}.`, 'incident', incident.id, `incident-${incident.id}-${parsed.data.status}`); res.json({ status: parsed.data.status }); });

app.get('/api/audit', requireAuth, (req, res) => { let sql = 'SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.metadata, a.created_at AS createdAt FROM audit_logs a'; const params = []; if (req.user.role === 'student') { sql += ' WHERE a.actor_id = ? OR (a.entity_type = \'booking\' AND a.entity_id IN (SELECT id FROM booking_requests WHERE student_id = ?))'; params.push(req.user.sub, req.user.sub); } else if (req.user.role === 'owner') { sql += ' WHERE a.actor_id = ? OR (a.entity_type = \'resource\' AND a.entity_id IN (SELECT id FROM resources WHERE owner_id = ?)) OR (a.entity_type = \'booking\' AND a.entity_id IN (SELECT b.id FROM booking_requests b JOIN resources r ON r.id = b.resource_id WHERE r.owner_id = ?))'; params.push(req.user.sub, req.user.sub, req.user.sub); } sql += ' ORDER BY a.created_at DESC LIMIT 200'; res.json({ audit: db.prepare(sql).all(...params).map((row) => ({ ...row, metadata: JSON.parse(row.metadata || '{}') })) }); });

app.get('/api/notifications', requireAuth, (req, res) => { const now = Date.now(); const upcoming = db.prepare("SELECT b.id, b.starts_at AS startsAt, b.ends_at AS endsAt, r.title FROM booking_requests b JOIN resources r ON r.id = b.resource_id WHERE b.student_id = ? AND b.status = 'approved'").all(req.user.sub); for (const booking of upcoming) { const start = new Date(booking.startsAt).getTime(); if (start > now && start - now <= 86400000) notify(req.user.sub, 'upcoming_booking', 'Upcoming booking', `${booking.title} starts within 24 hours.`, 'booking', booking.id, `booking-${booking.id}-upcoming`); const checkIn = db.prepare('SELECT checked_out_at FROM check_ins WHERE booking_id = ?').get(booking.id); if (new Date(booking.startsAt).getTime() < now && new Date(booking.endsAt).getTime() < now && (!checkIn || !checkIn.checked_out_at)) notify(req.user.sub, 'overdue_return', 'Overdue return', `${booking.title} has not been checked out after its booking window.`, 'booking', booking.id, `booking-${booking.id}-overdue`); } res.json({ notifications: db.prepare('SELECT id, type, title, message, entity_type AS entityType, entity_id AS entityId, read_at AS readAt, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC').all(req.user.sub) }); });
app.patch('/api/notifications/:id/read', requireAuth, (req, res) => { const result = db.prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.sub); if (!result.changes) return res.status(404).json({ error: 'Notification not found.' }); res.json({ status: 'read' }); });

app.get('/api/admin/incidents', requireAuth, allowRoles('admin'), (req, res) => res.json({ incidents: db.prepare("SELECT i.id, i.category, i.description, i.status, i.resolution_notes AS resolutionNotes, i.created_at AS createdAt, r.title AS resourceTitle FROM incidents i LEFT JOIN booking_requests b ON b.id = i.booking_id LEFT JOIN resources r ON r.id = b.resource_id ORDER BY i.created_at DESC").all() }));
app.get('/api/admin/audit', requireAuth, allowRoles('admin'), (req, res) => res.json({ audit: db.prepare("SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.metadata, a.created_at AS createdAt, u.name AS actorName FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 500").all().map((row) => ({ ...row, metadata: JSON.parse(row.metadata || '{}') })) }));

app.get('/api/dashboard/student', requireAuth, allowRoles('student'), (req, res) => {
  const totals = db.prepare("SELECT COUNT(*) AS total, SUM(status = 'pending') AS pending, SUM(status = 'approved') AS approved, SUM(status = 'rejected') AS rejected, SUM(status = 'waitlisted') AS waitlisted FROM booking_requests WHERE student_id = ? AND status != 'cancelled'").get(req.user.sub);
  const upcoming = db.prepare(`${bookingWithResource} WHERE b.student_id = ? AND b.status = 'approved' AND b.ends_at > CURRENT_TIMESTAMP ORDER BY b.starts_at LIMIT 5`).all(req.user.sub);
  const recentBookings = db.prepare(`${bookingWithResource} WHERE b.student_id = ? ORDER BY b.created_at DESC LIMIT 6`).all(req.user.sub);
  const availableResources = publicResources(db.prepare("SELECT id, owner_id AS ownerId, title, description, category, location FROM resources WHERE availability = 'available'").all()).length;
  res.json({ stats: { total: totals.total || 0, pending: totals.pending || 0, approved: totals.approved || 0, rejected: totals.rejected || 0, waitlisted: totals.waitlisted || 0, availableResources }, upcoming, recentBookings });
});
app.get('/api/dashboard/owner', requireAuth, allowRoles('owner'), (req, res) => {
  const stats = db.prepare("SELECT COUNT(DISTINCT r.id) AS resources, COUNT(CASE WHEN b.status = 'pending' THEN 1 END) AS pendingRequests, COUNT(CASE WHEN b.status = 'approved' THEN 1 END) AS approvedBookings, COUNT(CASE WHEN b.status = 'waitlisted' THEN 1 END) AS waitlistedRequests, COALESCE(SUM(CASE WHEN b.status = 'approved' THEN (julianday(b.ends_at) - julianday(b.starts_at)) * 24 ELSE 0 END), 0) AS bookedHours FROM resources r LEFT JOIN booking_requests b ON b.resource_id = r.id WHERE r.owner_id = ?").get(req.user.sub);
  const resources = db.prepare("SELECT r.id, r.title, r.category, r.location, r.availability, r.image_path AS imagePath, r.hourly_price_paise AS hourlyPricePaise, COUNT(CASE WHEN b.status IN ('pending', 'waitlisted') THEN 1 END) AS openRequests, COUNT(CASE WHEN b.status = 'approved' THEN 1 END) AS approvedBookings FROM resources r LEFT JOIN booking_requests b ON b.resource_id = r.id WHERE r.owner_id = ? GROUP BY r.id ORDER BY r.created_at DESC").all(req.user.sub).map(withResourcePhoto);
  const recentActivity = db.prepare("SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.metadata, a.created_at AS createdAt FROM audit_logs a WHERE a.actor_id = ? OR (a.entity_type = 'resource' AND a.entity_id IN (SELECT id FROM resources WHERE owner_id = ?)) OR (a.entity_type = 'booking' AND a.entity_id IN (SELECT b.id FROM booking_requests b JOIN resources r ON r.id = b.resource_id WHERE r.owner_id = ?)) ORDER BY a.created_at DESC LIMIT 8").all(req.user.sub, req.user.sub, req.user.sub).map((row) => ({ ...row, metadata: JSON.parse(row.metadata || '{}') }));
  res.json({ stats: { resources: stats.resources || 0, pendingRequests: stats.pendingRequests || 0, approvedBookings: stats.approvedBookings || 0, waitlistedRequests: stats.waitlistedRequests || 0, bookedHours: Math.round((stats.bookedHours || 0) * 10) / 10 }, resources, recentActivity });
});
app.get('/api/dashboard/admin', requireAuth, allowRoles('admin'), (req, res) => { const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count; const resources = db.prepare('SELECT COUNT(*) AS count FROM resources').get().count; const bookings = db.prepare('SELECT COUNT(*) AS count FROM booking_requests').get().count; const auditLogs = db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count; res.json({ stats: { users, resources, bookings, auditLogs } }); });

app.use((error, _req, res, _next) => { if (error instanceof PricingError) return res.status(400).json({ error: error.message }); if (error instanceof ResourceImageError) return res.status(error.status).json({ error: error.message }); if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Image must be 5 MB or smaller.' }); if (error instanceof multer.MulterError || error.message === 'Only JPEG, PNG, and WebP images are allowed.') return res.status(400).json({ error: error.message }); console.error(error); res.status(500).json({ error: 'Unexpected server error.' }); });
export default app;
