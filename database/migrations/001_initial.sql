CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  display_name_normalized TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  project_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT,
  responsible_person TEXT NOT NULL,
  grade TEXT NOT NULL,
  disease_type TEXT NOT NULL,
  region TEXT,
  province TEXT,
  leading_pi TEXT NOT NULL,
  lead_institution TEXT NOT NULL,
  planned_center_count INTEGER NOT NULL,
  planned_enrollment INTEGER NOT NULL,
  enrolled_count INTEGER NOT NULL DEFAULT 0,
  current_stage TEXT,
  status TEXT NOT NULL DEFAULT '筹备中',
  summary TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX projects_owner_id_idx ON projects(owner_id);
CREATE INDEX projects_status_idx ON projects(status);
CREATE INDEX projects_updated_at_idx ON projects(updated_at);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX audit_logs_user_idx ON audit_logs(user_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);
