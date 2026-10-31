-- All existing resources are FREE. Owners explicitly set future listing rates.
ALTER TABLE resources ADD COLUMN hourly_price_paise INTEGER NOT NULL DEFAULT 0
  CHECK (typeof(hourly_price_paise) = 'integer' AND hourly_price_paise BETWEEN 0 AND 9007199254740991);

-- NULL means no historical quote exists. Never infer an old booking price
-- from the current listing rate. These are estimates, not payment records.
ALTER TABLE booking_requests ADD COLUMN quoted_hourly_price_paise INTEGER DEFAULT NULL
  CHECK (quoted_hourly_price_paise IS NULL OR (typeof(quoted_hourly_price_paise) = 'integer' AND quoted_hourly_price_paise BETWEEN 0 AND 9007199254740991));
ALTER TABLE booking_requests ADD COLUMN estimated_total_paise INTEGER DEFAULT NULL
  CHECK (estimated_total_paise IS NULL OR (typeof(estimated_total_paise) = 'integer' AND estimated_total_paise BETWEEN 0 AND 9007199254740991));
