-- D1 migration: create the primary tables used by the SolarRoots directory scaffold
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS site_tags (
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (site_id, tag_id)
);

INSERT INTO sites (name, description, website) VALUES
  ('SolarRoots Community', 'Community hub for regenerative agriculture and solar cooperatives.', 'https://solarroots.example.com'),
  ('Sunrise Co-op', 'Worker-owned solar installation cooperative focused on rural communities.', 'https://sunrisecoop.example.com');

INSERT INTO tags (label) VALUES ('solar'), ('cooperative'), ('regenerative');

INSERT INTO site_tags (site_id, tag_id)
  SELECT s.id, t.id
  FROM sites s
  JOIN tags t ON (
    (s.name = 'SolarRoots Community' AND t.label IN ('solar', 'regenerative'))
    OR (s.name = 'Sunrise Co-op' AND t.label IN ('solar', 'cooperative'))
  );
