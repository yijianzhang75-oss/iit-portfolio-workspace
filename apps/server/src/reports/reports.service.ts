import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { CurrentUser } from "../auth/auth.types";
import { DatabaseService } from "../database.service";
import { ProjectsGateway } from "../realtime/projects.gateway";
import type { SaveProjectReportInput } from "./report.schemas";

type ReportRow = {
  id: string;
  projectId: string;
  completedWork: string | null;
  risksAndIssues: string | null;
  nextPlan: string | null;
  supportNeeded: string | null;
  ownerId: string;
  ownerDisplayName: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService, private readonly realtime: ProjectsGateway) {}

  get(user: CurrentUser, projectId: string) {
    const project = this.findProject(projectId);
    const report = this.find(projectId);
    if (!report) return { projectId, completedWork: null, risksAndIssues: null, nextPlan: null, supportNeeded: null, version: null, canEdit: Boolean(project.isPublicEditable) || project.ownerId === user.id, owner: { id: project.ownerId, displayName: project.ownerDisplayName } };
    return this.present(report, user.id);
  }

  save(user: CurrentUser, projectId: string, input: SaveProjectReportInput) {
    const project = this.findProject(projectId);
    if (project.ownerId !== user.id && !project.isPublicEditable) throw new ForbiddenException("该项目当前不允许由其他成员维护本期汇报");
    const existing = this.find(projectId);
    const now = new Date().toISOString();
    const row = this.database.transaction(() => {
      if (!existing) {
        const id = randomUUID();
        this.database.db.prepare(`
          INSERT INTO project_reports (id, project_id, completed_work, risks_and_issues, next_plan, support_needed, owner_id, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(id, projectId, this.nullable(input.completedWork), this.nullable(input.risksAndIssues), this.nullable(input.nextPlan), this.nullable(input.supportNeeded), user.id, now, now);
        const created = this.find(projectId)!;
        this.writeAudit("CREATE", created.id, user.id, null, created);
        return created;
      }
      if (!input.version || input.version !== existing.version) throw new ConflictException("汇报已被更新，请刷新后重试");
      const result = this.database.db.prepare(`
        UPDATE project_reports SET completed_work = ?, risks_and_issues = ?, next_plan = ?, support_needed = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(this.nullable(input.completedWork), this.nullable(input.risksAndIssues), this.nullable(input.nextPlan), this.nullable(input.supportNeeded), now, existing.id, input.version);
      if (Number(result.changes) !== 1) throw new ConflictException("汇报已被更新，请刷新后重试");
      const updated = this.find(projectId)!;
      this.writeAudit("UPDATE", updated.id, user.id, existing, updated);
      return updated;
    });
    this.realtime.projectChanged({ projectId, action: "report.updated", version: row.version });
    return this.present(row, user.id);
  }

  private findProject(projectId: string) {
    const row = this.database.db.prepare(`
      SELECT p.id, p.owner_id AS ownerId, p.is_public_editable AS isPublicEditable, u.display_name AS ownerDisplayName
      FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ? AND p.deleted_at IS NULL
    `).get(projectId) as { id: string; ownerId: string; isPublicEditable: number; ownerDisplayName: string } | undefined;
    if (!row) throw new NotFoundException("项目不存在");
    return row;
  }

  private find(projectId: string) {
    return this.database.db.prepare(`
      SELECT r.id, r.project_id AS projectId, r.completed_work AS completedWork,
        r.risks_and_issues AS risksAndIssues, r.next_plan AS nextPlan,
        r.support_needed AS supportNeeded, r.owner_id AS ownerId, r.version,
        r.created_at AS createdAt, r.updated_at AS updatedAt, u.display_name AS ownerDisplayName
      FROM project_reports r JOIN users u ON u.id = r.owner_id WHERE r.project_id = ?
    `).get(projectId) as ReportRow | undefined;
  }

  private present(row: ReportRow, userId: string) {
    const project = this.findProject(row.projectId);
    return { ...row, owner: { id: row.ownerId, displayName: row.ownerDisplayName }, canEdit: Boolean(project.isPublicEditable) || row.ownerId === userId };
  }

  private nullable(value: string | null | undefined) { return value?.trim() || null; }

  private writeAudit(action: string, entityId: string, userId: string, before: unknown, after: unknown) {
    this.database.db.prepare(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, user_id, before_json, after_json, created_at)
      VALUES (?, ?, 'PROJECT_REPORT', ?, ?, ?, ?, ?)
    `).run(randomUUID(), action, entityId, userId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, new Date().toISOString());
  }
}
