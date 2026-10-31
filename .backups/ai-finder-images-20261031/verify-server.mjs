// Temporary browser verification: all data lives in memory; provider disabled.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
process.env.NODE_ENV = 'test';
process.env.DATABASE_FILE = ':memory:';
process.env.GEMINI_API_KEY = '';
process.env.JWT_SECRET = 'temporary-in-memory-browser-verification-only';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-ai-role-browser-'));
const moduleUrl = file => pathToFileURL(path.resolve(file)).href;
const { default: app } = await import(moduleUrl('src/app.js'));
const { db } = await import(moduleUrl('src/db/index.js'));
await import(moduleUrl('src/db/seed.js'));
const owner = db.prepare("SELECT id FROM users WHERE role='owner'").get();
const response = await fetch('http://localhost:4000/api/resources');
if (!response.ok) throw new Error('Public catalog unavailable');
const { resources } = await response.json();
const images = path.join(process.env.UPLOAD_DIR, 'resource-images');
fs.mkdirSync(images, { recursive: true });
for (const resource of resources) {
 const filename = resource.imageUrl ? path.basename(resource.imageUrl) : null;
 if (filename) fs.copyFileSync(path.resolve('data/uploads/resource-images', filename), path.join(images, filename));
 db.prepare('INSERT INTO resources(id,owner_id,title,description,category,location,availability,hourly_price_paise,image_path) VALUES (?,?,?,?,?,?,?,?,?)').run(resource.id,owner.id,resource.title,resource.description,resource.category,resource.location,resource.availability,resource.hourlyPricePaise,filename);
 for (const requirement of resource.eligibility) db.prepare('INSERT INTO eligibility_requirements(resource_id,requirement) VALUES (?,?)').run(resource.id,requirement);
}
const server = app.listen(4107, '127.0.0.1', () => console.log('ISOLATED_AI_BROWSER_READY :memory: port 4107; Gemini disabled'));
const shutdown = () => server.close(() => process.exit());
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
