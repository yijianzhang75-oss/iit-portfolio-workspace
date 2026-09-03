import { Injectable, NotFoundException } from "@nestjs/common";
import type { CurrentUser } from "../auth/auth.types";
import { DatabaseService } from "../database.service";

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
  userId: string;
  userDisplayName: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  list(_user: CurrentUser, projectId: string) {
    if (!this.database.db.prepare("SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL").get(projectId)) {
      throw new NotFoundException("项目不存在");
    }
    const rows = this.database.db.prepare(`
      SELECT l.id, l.action, l.entity_type AS entityType, l.entity_id AS entityId,
        l.before_json AS beforeJson, l.after_json AS afterJson, l.created_at AS createdAt,
        u.id AS userId, u.display_name AS userDisplayName
      FROM audit_logs l JOIN users u ON u.id = l.user_id
      WHERE
        (l.entity_type = 'PROJECT' AND l.entity_id = ?)
        OR (l.entity_type = 'MILESTONE' AND l.entity_id IN (SELECT id FROM milestones WHERE project_id = ?))
        OR (l.entity_type = 'TASK' AND l.entity_id IN (SELECT id FROM tasks WHERE project_id = ?))
        OR (l.entity_type = 'RESEARCH_CENTER' AND l.entity_id IN (SELECT id FROM research_centers WHERE project_id = ?))
        OR (l.entity_type = 'ENROLLMENT_SNAPSHOT' AND l.entity_id IN (SELECT id FROM enrollment_snapshots WHERE project_id = ?))
        OR (l.entity_type = 'PROJECT_RISK' AND l.entity_id IN (SELECT id FROM project_risks WHERE project_id = ?))
        OR (l.entity_type = 'ANNUAL_GOAL' AND l.entity_id IN (SELECT id FROM annual_goals WHERE project_id = ?))
        OR (l.entity_type = 'PROJECT_BUDGET' AND l.entity_id IN (SELECT id FROM project_budgets WHERE project_id = ?))
        OR (l.entity_type = 'ANNUAL_PROJECT_TARGET' AND l.entity_id IN (SELECT id FROM annual_project_targets WHERE project_id = ?))
        OR (l.entity_type = 'PROJECT_BUDGET_OVERVIEW' AND l.entity_id = ?)
        OR (l.entity_type = 'ATTACHMENT' AND l.entity_id IN (SELECT id FROM attachments WHERE project_id = ?))
        OR (l.entity_type = 'PROJECT_REPORT' AND l.entity_id IN (SELECT id FROM project_reports WHERE project_id = ?))
      ORDER BY l.created_at DESC
      LIMIT 300
    `).all(projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId) as unknown as AuditRow[];

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: { id: row.userId, displayName: row.userDisplayName },
      before: this.parse(row.beforeJson),
      after: this.parse(row.afterJson),
      createdAt: row.createdAt,
    }));
  }

  importSource(_user: CurrentUser, projectId: string) {
    if (!this.database.db.prepare("SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL").get(projectId)) {
      throw new NotFoundException("项目不存在");
    }
    const row = this.database.db.prepare(`
      SELECT s.source_row_number AS sourceRowNumber, s.source_json AS sourceJson,
        b.source_file AS sourceFile, b.source_sha256 AS sourceSha256,
        b.sheet_name AS sheetName, s.created_at AS importedAt
      FROM project_import_sources s JOIN import_batches b ON b.id = s.batch_id
      WHERE s.project_id = ? ORDER BY s.created_at DESC LIMIT 1
    `).get(projectId) as { sourceRowNumber: number; sourceJson: string; sourceFile: string; sourceSha256: string; sheetName: string; importedAt: string } | undefined;
    if (!row) return null;
    return { ...row, source: this.parse(row.sourceJson), sourceJson: undefined };
  }

  private parse(value: string | null) {
    if (!value) return null;
    try { return JSON.parse(value) as unknown; } catch { return value; }
  }
}
