-- 项目全周期预算：金额均以分保存，接口层按万元输入和展示。
CREATE TABLE project_budget_overviews (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  total_budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_budget_cents >= 0),
  medical_budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (medical_budget_cents >= 0),
  sales_budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (sales_budget_cents >= 0),
  sales_allocated_budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (sales_allocated_budget_cents >= 0),
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 每个项目每年一条目标与入组进度记录；年份由项目周期决定，不固定为 2026 年。
CREATE TABLE annual_project_targets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  target_enrollment INTEGER NOT NULL DEFAULT 0 CHECK (target_enrollment >= 0),
  enrolled_count INTEGER NOT NULL DEFAULT 0 CHECK (enrolled_count >= 0),
  active_count INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0),
  followup_complete_count INTEGER NOT NULL DEFAULT 0 CHECK (followup_complete_count >= 0),
  dropout_count INTEGER NOT NULL DEFAULT 0 CHECK (dropout_count >= 0),
  owner_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(project_id, year)
);
CREATE INDEX annual_project_targets_project_idx ON annual_project_targets(project_id, year DESC);
CREATE INDEX annual_project_targets_owner_idx ON annual_project_targets(owner_id);
