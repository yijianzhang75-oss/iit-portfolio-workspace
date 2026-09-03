CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  planned_date TEXT,
  actual_date TEXT,
  status TEXT NOT NULL DEFAULT '未开始',
  sort_order INTEGER NOT NULL DEFAULT 0,
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX milestones_project_idx ON milestones(project_id, sort_order);
CREATE INDEX milestones_owner_idx ON milestones(owner_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  assignee_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '未开始',
  priority TEXT NOT NULL DEFAULT '中',
  start_date TEXT,
  due_date TEXT,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  notes TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX tasks_project_idx ON tasks(project_id, due_date);
CREATE INDEX tasks_owner_idx ON tasks(owner_id);
CREATE INDEX tasks_status_idx ON tasks(status);
