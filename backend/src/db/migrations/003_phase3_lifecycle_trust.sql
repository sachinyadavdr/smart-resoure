ALTER TABLE check_ins ADD COLUMN initial_condition TEXT NOT NULL DEFAULT '';
ALTER TABLE check_ins ADD COLUMN final_condition TEXT;
ALTER TABLE check_ins ADD COLUMN return_notes TEXT;
ALTER TABLE condition_reports ADD COLUMN image_path TEXT;
ALTER TABLE incidents ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE incidents ADD COLUMN resolution_notes TEXT;
ALTER TABLE incidents ADD COLUMN resolved_at TEXT;
ALTER TABLE booking_requests ADD COLUMN waitlist_position INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_check_ins_booking_unique ON check_ins(booking_id);
CREATE INDEX IF NOT EXISTS idx_incident_status ON incidents(status);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  dedupe_key TEXT UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS resource_waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id INTEGER NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_id, student_id, booking_id)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at, created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_resource_position ON resource_waitlist(resource_id, position);
