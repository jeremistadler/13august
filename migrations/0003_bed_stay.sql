ALTER TABLE responses ADD COLUMN bed_stay TEXT NOT NULL DEFAULT ''
  CHECK (bed_stay IN ('', 'fri-sat', 'sat-sun', 'fri-sun'));
