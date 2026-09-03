CREATE TABLE research_centers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  center_code TEXT,
  name TEXT NOT NULL,
  province TEXT,
  principal_investigator TEXT,
  stage TEXT NOT NULL DEFAULT '待启动',
  planned_enrollment INTEGER NOT NULL DEFAULT 0 CHECK (planned_enrollment >= 0),
  enrolled_count INTEGER NOT NULL DEFAULT 0 CHECK (enrolled_count >= 0),
  active_count INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0),
  followup_complete_count INTEGER NOT NULL DEFAULT 0 CHECK (followup_complete_count >= 0),
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX research_centers_project_idx ON research_centers(project_id, stage);
CREATE INDEX research_centers_owner_idx ON research_centers(owner_id);

CREATE TABLE enrollment_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  snapshot_date TEXT NOT NULL,
  enrolled_count INTEGER NOT NULL DEFAULT 0 CHECK (enrolled_count >= 0),
  active_count INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0),
  followup_complete_count INTEGER NOT NULL DEFAULT 0 CHECK (followup_complete_count >= 0),
  notes TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(project_id, snapshot_date)
);
CREATE INDEX enrollment_snapshots_project_idx ON enrollment_snapshots(project_id, snapshot_date);
CREATE INDEX enrollment_snapshots_owner_idx ON enrollment_snapshots(owner_id);
