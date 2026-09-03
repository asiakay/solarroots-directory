-- D1 migration: capture early interest submissions for SolarRoots
CREATE TABLE IF NOT EXISTS interest_signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT NOT NULL,
  organization TEXT,
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interest_signups_email ON interest_signups(email);
