-- 导入的历史项目可由内部团队共同维护；手工创建项目默认仍由创建者维护。
ALTER TABLE projects ADD COLUMN is_public_editable INTEGER NOT NULL DEFAULT 0
  CHECK (is_public_editable IN (0, 1));

CREATE INDEX projects_public_editable_idx
ON projects(is_public_editable)
WHERE deleted_at IS NULL;
