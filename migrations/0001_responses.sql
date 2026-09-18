CREATE TABLE responses (
  session_hash TEXT PRIMARY KEY,
  attending INTEGER NOT NULL CHECK (attending IN (0, 1)),
  companions TEXT NOT NULL DEFAULT '',
  needs_bed INTEGER NOT NULL CHECK (needs_bed IN (0, 1)),
  comment TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
