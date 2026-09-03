ALTER TABLE milestones ADD COLUMN template_key TEXT;

CREATE UNIQUE INDEX milestones_project_template_key_idx
ON milestones(project_id, template_key)
WHERE template_key IS NOT NULL AND deleted_at IS NULL;

WITH milestone_template(template_key, name, sort_order) AS (
  VALUES
    ('protocol-finalized', '研究方案定稿时间', 10),
    ('scientific-review-approved', '科学性审查/立项通过时间', 20),
    ('ethics-approval', '伦理批件获取时间', 30),
    ('contract-signed', '合同签署时间', 40),
    ('study-started', '研究启动时间', 50),
    ('first-subject-enrolled', '首例入组时间', 60),
    ('enrollment-target', '入组完成计划时间', 70),
    ('followup-completed', '随访完成时间', 80),
    ('data-cleaning-completed', '数据清理完成时间', 90),
    ('statistical-analysis-completed', '统计分析完成时间', 100),
    ('manuscript-completed', '文章撰写完成时间', 110),
    ('center-closed', '中心关闭时间', 120)
)
INSERT INTO milestones (
  id, project_id, name, planned_date, actual_date, status, sort_order,
  owner_id, version, created_at, updated_at, template_key
)
SELECT
  lower(hex(randomblob(16))), p.id, t.name, NULL, NULL, '未开始', t.sort_order,
  p.owner_id, 1, datetime('now'), datetime('now'), t.template_key
FROM projects p
CROSS JOIN milestone_template t
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM milestones m
    WHERE m.project_id = p.id
      AND m.template_key = t.template_key
      AND m.deleted_at IS NULL
  );
