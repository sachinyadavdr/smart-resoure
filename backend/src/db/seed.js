import bcrypt from 'bcryptjs';
import { db } from './index.js';

const password = bcrypt.hashSync('DemoPass123!', 12);
const insertUser = db.prepare('INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
insertUser.run('Avery Student', 'student@example.test', password, 'student');
insertUser.run('Morgan Owner', 'owner@example.test', password, 'owner');
insertUser.run('Riley Admin', 'admin@example.test', password, 'admin');
const owner = db.prepare('SELECT id FROM users WHERE email = ?').get('owner@example.test');
const count = db.prepare('SELECT COUNT(*) AS count FROM resources').get().count;
// Development seeding must never publish sample resources. Automated tests get
// a distinct fixture only inside Node's test runner and an in-memory database.
if (!count && process.env.NODE_TEST_CONTEXT && process.env.DATABASE_FILE === ':memory:') {
  const result = db.prepare('INSERT INTO resources (owner_id, title, description, category, location, access_rules) VALUES (?, ?, ?, ?, ?, ?)').run(owner.id, 'Test Presentation Projector', 'An isolated projector resource for automated tests.', 'Audio visual', 'Innovation Lab', 'Students with an approved booking may collect it from the lab desk.');
  db.prepare('INSERT INTO eligibility_requirements (resource_id, requirement) VALUES (?, ?)').run(result.lastInsertRowid, 'Active student account');
}
console.log('Fictional seed data ready.');
