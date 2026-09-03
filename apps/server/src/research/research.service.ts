import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { CurrentUser } from "../auth/auth.types";
import { DatabaseService } from "../database.service";
import { ProjectsGateway } from "../realtime/projects.gateway";
import type {
  CreateCenterInput,
  CreateSnapshotInput,
  CreateAnnualTargetInput,
  UpdateCenterInput,
  UpdateSnapshotInput,
  UpdateAnnualTargetInput,
} from "./research.schemas";

type ResearchRow = Record<string, unknown> & {
  id: string;
  projectId: string;
  ownerId: string;
  ownerDisplayName: string;
  version: number;
};

@Injectable()
export class ResearchService {
  constructor(private readonly database: DatabaseService, private readonly realtime: ProjectsGateway) {}

  listCenters(user: CurrentUser, projectId: string) {
    this.assertProject(projectId);
    const rows = this.database.db.prepare(`
      SELECT c.id, c.project_id AS projectId, c.center_code AS centerCode, c.name, c.province,
        c.principal_investigator AS principalInvestigator, c.stage,
        c.planned_enrollment AS plannedEnrollment, c.enrolled_count AS enrolledCount,
        c.active_count AS activeCount, c.followup_complete_count AS followupCompleteCount,
        c.owner_id AS ownerId, c.version, c.created_at AS createdAt, c.updated_at AS updatedAt,
        u.display_name AS ownerDisplayName
      FROM research_centers c JOIN users u ON u.id = c.owner_id
      WHERE c.project_id = ? AND c.deleted_at IS NULL
      ORDER BY CASE c.stage WHEN '入组中' THEN 0 WHEN '已启动' THEN 1 WHEN '启动中' THEN 2 ELSE 3 END, c.name
    `).all(projectId) as unknown as ResearchRow[];
    return rows.map((row) => this.present(row, user.id));
  }

  createCenter(user: CurrentUser, projectId: string, input: CreateCenterInput) {
    this.assertProject(projectId);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.db.prepare(`
        INSERT INTO research_centers (
          id, project_id, center_code, name, province, principal_investigator, stage,
          planned_enrollment, enrolled_count, active_count, followup_complete_count,
          owner_id, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, projectId, this.nullable(input.centerCode), input.name, this.nullable(input.province),
        this.nullable(input.principalInvestigator), input.stage, input.plannedEnrollment,
        input.enrolledCount, input.activeCount, input.followupCompleteCount, user.id, now, now);
      this.writeAudit("CREATE", "RESEARCH_CENTER", id, user.id, null, input);
    });
    const row = this.findCenter(id)!;
    this.realtime.projectChanged({ projectId, action: "center.created", version: row.version });
    return this.present(row, user.id);
  }

  updateCenter(user: CurrentUser, id: string, input: UpdateCenterInput) {
    const existing = this.findCenter(id);
    if (!existing) throw new NotFoundException("研究中心不存在");
    this.assertOwner(existing, user);
    const columns: Record<string, string> = {
      centerCode: "center_code", name: "name", province: "province",
      principalInvestigator: "principal_investigator", stage: "stage",
      plannedEnrollment: "planned_enrollment", enrolledCount: "enrolled_count",
      activeCount: "active_count", followupCompleteCount: "followup_complete_count",
    };
    const row = this.updateItem("research_centers", id, user.id, input.version, input, columns, "RESEARCH_CENTER", existing, () => this.findCenter(id)!);
    this.realtime.projectChanged({ projectId: row.projectId, action: "center.updated", version: row.version });
    return this.present(row, user.id);
  }

  listSnapshots(user: CurrentUser, projectId: string) {
    this.assertProject(projectId);
    const rows = this.database.db.prepare(`
      SELECT s.id, s.project_id AS projectId, s.snapshot_date AS snapshotDate,
        s.enrolled_count AS enrolledCount, s.active_count AS activeCount,
        s.followup_complete_count AS followupCompleteCount, s.notes,
        s.owner_id AS ownerId, s.version, s.created_at AS createdAt, s.updated_at AS updatedAt,
        u.display_name AS ownerDisplayName
      FROM enrollment_snapshots s JOIN users u ON u.id = s.owner_id
      WHERE s.project_id = ? AND s.deleted_at IS NULL
      ORDER BY s.snapshot_date
    `).all(projectId) as unknown as ResearchRow[];
    return rows.map((row) => this.present(row, user.id));
  }

  createSnapshot(user: CurrentUser, projectId: string, input: CreateSnapshotInput) {
    this.assertProject(projectId);
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      this.database.transaction(() => {
        this.database.db.prepare(`
          INSERT INTO enrollment_snapshots (
            id, project_id, snapshot_date, enrolled_count, active_count,
            followup_complete_count, notes, owner_id, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(id, projectId, input.snapshotDate, input.enrolledCount, input.activeCount,
          input.followupCompleteCount, this.nullable(input.notes), user.id, now, now);
        this.writeAudit("CREATE", "ENROLLMENT_SNAPSHOT", id, user.id, null, input);
      });
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException("该日期已经存在入组快照");
      throw error;
    }
    const row = this.findSnapshot(id)!;
    this.realtime.projectChanged({ projectId, action: "enrollment.created", version: row.version });
    return this.present(row, user.id);
  }

  updateSnapshot(user: CurrentUser, id: string, input: UpdateSnapshotInput) {
    const existing = this.findSnapshot(id);
    if (!existing) throw new NotFoundException("入组快照不存在");
    this.assertOwner(existing, user);
    const columns: Record<string, string> = {
      snapshotDate: "snapshot_date", enrolledCount: "enrolled_count", activeCount: "active_count",
      followupCompleteCount: "followup_complete_count", notes: "notes",
    };
    try {
      const row = this.updateItem("enrollment_snapshots", id, user.id, input.version, input, columns, "ENROLLMENT_SNAPSHOT", existing, () => this.findSnapshot(id)!);
      this.realtime.projectChanged({ projectId: row.projectId, action: "enrollment.updated", version: row.version });
      return this.present(row, user.id);
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException("该日期已经存在入组快照");
      throw error;
    }
  }

  listAnnualTargets(user: CurrentUser, projectId: string) {
    this.assertProject(projectId);
    const rows = this.database.db.prepare(`
      SELECT t.id, t.project_id AS projectId, t.year,
        t.target_enrollment AS targetEnrollment, t.enrolled_count AS enrolledCount,
        t.active_count AS activeCount, t.followup_complete_count AS followupCompleteCount,
        t.dropout_count AS dropoutCount, t.owner_id AS ownerId, t.version,
        t.created_at AS createdAt, t.updated_at AS updatedAt, u.display_name AS ownerDisplayName
      FROM annual_project_targets t JOIN users u ON u.id = t.owner_id
      WHERE t.project_id = ? AND t.deleted_at IS NULL
      ORDER BY t.year DESC
    `).all(projectId) as unknown as ResearchRow[];
    return rows.map((row) => this.present(row, user.id));
  }

  createAnnualTarget(user: CurrentUser, projectId: string, input: CreateAnnualTargetInput) {
    this.assertProject(projectId);
    const id = randomUUID(); const now = new Date().toISOString();
    try {
      this.database.transaction(() => {
        this.database.db.prepare(`
          INSERT INTO annual_project_targets (
            id, project_id, year, target_enrollment, enrolled_count, active_count,
            followup_complete_count, dropout_count, owner_id, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(id, projectId, input.year, input.targetEnrollment, input.enrolledCount, input.activeCount, input.followupCompleteCount, input.dropoutCount, user.id, now, now);
        this.writeAudit("CREATE", "ANNUAL_PROJECT_TARGET", id, user.id, null, input);
      });
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException("该项目已存在相同年度的目标记录");
      throw error;
    }
    const row = this.findAnnualTarget(id)!;
    this.realtime.projectChanged({ projectId, action: "annual-target.created", version: row.version });
    return this.present(row, user.id);
  }

  updateAnnualTarget(user: CurrentUser, id: string, input: UpdateAnnualTargetInput) {
    const existing = this.findAnnualTarget(id);
    if (!existing) throw new NotFoundException("年度目标记录不存在");
    this.assertOwner(existing, user);
    const columns: Record<string, string> = {
      year: "year", targetEnrollment: "target_enrollment", enrolledCount: "enrolled_count",
      activeCount: "active_count", followupCompleteCount: "followup_complete_count", dropoutCount: "dropout_count",
    };
    try {
      const row = this.updateItem("annual_project_targets", id, user.id, input.version, input, columns, "ANNUAL_PROJECT_TARGET", existing, () => this.findAnnualTarget(id)!);
      this.realtime.projectChanged({ projectId: row.projectId, action: "annual-target.updated", version: row.version });
      return this.present(row, user.id);
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException("该项目已存在相同年度的目标记录");
      throw error;
    }
  }

  private updateItem(
    table: "research_centers" | "enrollment_snapshots" | "annual_project_targets", id: string, ownerId: string,
    version: number, input: Record<string, unknown>, columns: Record<string, string>,
    entityType: string, existing: ResearchRow, reload: () => ResearchRow,
  ) {
    const entries = Object.entries(input).filter(([key]) => key !== "version" && columns[key]);
    const assignments = entries.map(([key]) => `${columns[key]} = ?`);
    const values = entries.map(([, value]) => this.nullable(value));
    assignments.push("version = version + 1", "updated_at = ?");
    values.push(new Date().toISOString());
    return this.database.transaction(() => {
      const result = this.database.db.prepare(`
        UPDATE ${table} SET ${assignments.join(", ")}
        WHERE id = ? AND version = ? AND deleted_at IS NULL
      `).run(...values, id, version);
      if (Number(result.changes) !== 1) throw new ConflictException("内容已被更新，请刷新后重试");
      const row = reload();
      this.writeAudit("UPDATE", entityType, id, ownerId, existing, row);
      return row;
    });
  }

  private findCenter(id: string) {
    return this.database.db.prepare(`
      SELECT c.id, c.project_id AS projectId, c.center_code AS centerCode, c.name, c.province,
        c.principal_investigator AS principalInvestigator, c.stage,
        c.planned_enrollment AS plannedEnrollment, c.enrolled_count AS enrolledCount,
        c.active_count AS activeCount, c.followup_complete_count AS followupCompleteCount,
        c.owner_id AS ownerId, c.version, c.created_at AS createdAt, c.updated_at AS updatedAt,
        u.display_name AS ownerDisplayName
      FROM research_centers c JOIN users u ON u.id = c.owner_id
      WHERE c.id = ? AND c.deleted_at IS NULL
    `).get(id) as unknown as ResearchRow | undefined;
  }

  private findSnapshot(id: string) {
    return this.database.db.prepare(`
      SELECT s.id, s.project_id AS projectId, s.snapshot_date AS snapshotDate,
        s.enrolled_count AS enrolledCount, s.active_count AS activeCount,
        s.followup_complete_count AS followupCompleteCount, s.notes,
        s.owner_id AS ownerId, s.version, s.created_at AS createdAt, s.updated_at AS updatedAt,
        u.display_name AS ownerDisplayName
      FROM enrollment_snapshots s JOIN users u ON u.id = s.owner_id
      WHERE s.id = ? AND s.deleted_at IS NULL
    `).get(id) as unknown as ResearchRow | undefined;
  }

  private findAnnualTarget(id: string) {
    return this.database.db.prepare(`
      SELECT t.id, t.project_id AS projectId, t.year,
        t.target_enrollment AS targetEnrollment, t.enrolled_count AS enrolledCount,
        t.active_count AS activeCount, t.followup_complete_count AS followupCompleteCount,
        t.dropout_count AS dropoutCount, t.owner_id AS ownerId, t.version,
        t.created_at AS createdAt, t.updated_at AS updatedAt, u.display_name AS ownerDisplayName
      FROM annual_project_targets t JOIN users u ON u.id = t.owner_id
      WHERE t.id = ? AND t.deleted_at IS NULL
    `).get(id) as unknown as ResearchRow | undefined;
  }

  private assertProject(projectId: string) {
    if (!this.database.db.prepare("SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL").get(projectId)) {
      throw new NotFoundException("项目不存在");
    }
  }

  private assertOwner(row: ResearchRow, user: CurrentUser) {
    const project = this.database.db.prepare("SELECT is_public_editable AS isPublicEditable FROM projects WHERE id = ? AND deleted_at IS NULL").get(row.projectId) as { isPublicEditable: number } | undefined;
    if (!project) throw new NotFoundException("项目不存在");
    if (row.ownerId !== user.id && !project.isPublicEditable) throw new ForbiddenException("该项目当前不允许由其他成员编辑");
  }

  private present(row: ResearchRow, userId: string) {
    const { ownerDisplayName, ...item } = row;
    const project = this.database.db.prepare("SELECT is_public_editable AS isPublicEditable FROM projects WHERE id = ? AND deleted_at IS NULL").get(row.projectId) as { isPublicEditable: number } | undefined;
    return { ...item, owner: { id: row.ownerId, displayName: ownerDisplayName }, canEdit: Boolean(project?.isPublicEditable) || row.ownerId === userId };
  }

  private nullable(value: unknown): string | number | bigint | Uint8Array | null {
    if (value === "" || value === undefined || value === null) return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
    if (value instanceof Uint8Array) return value;
    return String(value);
  }

  private writeAudit(action: string, entityType: string, entityId: string, userId: string, before: unknown, after: unknown) {
    this.database.db.prepare(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, user_id, before_json, after_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), action, entityType, entityId, userId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, new Date().toISOString());
  }

  private isUniqueError(error: unknown) {
    return error instanceof Error && error.message.includes("UNIQUE constraint failed");
  }
}
