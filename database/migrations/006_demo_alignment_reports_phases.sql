ALTER TABLE tasks ADD COLUMN phase_name TEXT;

CREATE TABLE project_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
  completed_work TEXT,
  risks_and_issues TEXT,
  next_plan TEXT,
  support_needed TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX project_reports_owner_idx ON project_reports(owner_id);
