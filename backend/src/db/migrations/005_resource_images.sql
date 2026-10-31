-- Existing listings keep a NULL reference and continue using illustrations.
ALTER TABLE resources ADD COLUMN image_path TEXT DEFAULT NULL;
