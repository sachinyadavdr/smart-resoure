import fs from 'node:fs';
import path from 'node:path';
import { db } from './index.js';

db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
const migrations = [
  ['001_initial.sql', path.join(process.cwd(), 'src/db/schema.sql')],
  ['002_phase2_booking_workflows.sql', path.join(process.cwd(), 'src/db/migrations/002_phase2_booking_workflows.sql')],
  ['003_phase3_lifecycle_trust.sql', path.join(process.cwd(), 'src/db/migrations/003_phase3_lifecycle_trust.sql')],
  ['004_resource_capacity.sql', path.join(process.cwd(), 'src/db/migrations/004_resource_capacity.sql')],
  ['005_resource_images.sql', path.join(process.cwd(), 'src/db/migrations/005_resource_images.sql')],
  ['006_hourly_resource_pricing.sql', path.join(process.cwd(), 'src/db/migrations/006_hourly_resource_pricing.sql')],
];
for (const [name, file] of migrations) {
  if (!db.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(name)) {
    db.transaction(() => {
      db.exec(fs.readFileSync(file, 'utf8'));
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    })();
  }
}
console.log('Database migrations applied.');
