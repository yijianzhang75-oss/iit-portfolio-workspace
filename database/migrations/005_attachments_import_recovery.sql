CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL,
  uploaded_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX attachments_project_idx ON attachments(project_id, created_at);
CREATE INDEX attachments_uploader_idx ON attachments(uploaded_by_id);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  source_file TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  imported_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE project_import_sources (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  source_row_number INTEGER NOT NULL,
  source_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(batch_id, source_row_number)
);
CREATE INDEX project_import_sources_project_idx ON project_import_sources(project_id, created_at);

CREATE TABLE identity_recovery_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX identity_recovery_codes_user_idx ON identity_recovery_codes(user_id, expires_at);
