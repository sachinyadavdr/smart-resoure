ALTER TABLE booking_requests ADD COLUMN purpose TEXT NOT NULL DEFAULT '';
ALTER TABLE booking_requests ADD COLUMN decision_reason TEXT;
ALTER TABLE booking_requests ADD COLUMN reviewed_at TEXT;
ALTER TABLE booking_requests ADD COLUMN cancelled_at TEXT;
CREATE INDEX IF NOT EXISTS idx_booking_resource_time ON booking_requests(resource_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_booking_student_status ON booking_requests(student_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
