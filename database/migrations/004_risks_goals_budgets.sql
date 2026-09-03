CREATE TABLE project_risks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT '中',
  status TEXT NOT NULL DEFAULT '开放',
  responsible_person TEXT,
  due_date TEXT,
  mitigation TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX project_risks_project_idx ON project_risks(project_id, status, level);
CREATE INDEX project_risks_owner_idx ON project_risks(owner_id);

CREATE TABLE annual_goals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  year INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '未开始',
  planned_date TEXT,
  completion_notes TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX annual_goals_project_idx ON annual_goals(project_id, year, status);
CREATE INDEX annual_goals_owner_idx ON annual_goals(owner_id);

CREATE TABLE project_budgets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  year INTEGER NOT NULL,
  category TEXT NOT NULL,
  budget_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_amount_cents >= 0),
  spent_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (spent_amount_cents >= 0),
  notes TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX project_budgets_project_idx ON project_budgets(project_id, year, category);
CREATE INDEX project_budgets_owner_idx ON project_budgets(owner_id);
