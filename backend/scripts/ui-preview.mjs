// Browser verification server. Never opens the development database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATABASE_FILE = ':memory:';
process.env.NODE_ENV = 'test';
process.env.CLIENT_ORIGIN = 'http://localhost:3100';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'resourcebridge-preview-'));
const { default: app } = await import('../src/app.js');
await import('../src/db/seed.js');
delete process.env.GEMINI_API_KEY; // Browser smoke tests use the deterministic matcher.
const port = Number(process.env.PREVIEW_API_PORT || 4000);
app.listen(port, () => console.log(`Isolated in-memory browser verification API on :${port}`));
