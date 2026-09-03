import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database.service";
import { ProjectsGateway } from "../realtime/projects.gateway";
import type { CurrentUser } from "../auth/auth.types";
import type { CreateProjectInput, DeleteProjectInput, UpdateProjectInput } from "./project.schemas";
import { projectMilestoneTemplates } from "../work-items/milestone-template";

type ProjectRow = Record<string, unknown> & {
  id: string;
  projectCode: string;
  ownerId: string;
  ownerUserId: string;
  ownerDisplayName: string;
  version: number;
};

const selectProject = `
  SELECT
    p.id,
    p.project_code AS projectCode,
    p.name,
    p.short_name AS shortName,
    p.responsible_person AS responsiblePerson,
    p.grade,
    p.disease_type AS diseaseType,
    p.region,
    p.province,
    p.leading_pi AS leadingPi,
    p.lead_institution AS leadInstitution,
    p.planned_center_count AS plannedCenterCount,
    p.planned_enrollment AS plannedEnrollment,
    COALESCE((
      SELECT s.enrolled_count FROM enrollment_snapshots s
      WHERE s.project_id = p.id AND s.deleted_at IS NULL
      ORDER BY s.snapshot_date DESC LIMIT 1
    ), p.enrolled_count) AS enrolledCount,
    p.current_stage AS currentStage,
    p.status,
    p.summary,
    p.owner_id AS ownerId,
    p.is_public_editable AS isPublicEditable,
    p.version,
    p.created_at AS createdAt,
    p.updated_at AS updatedAt,
    u.id AS ownerUserId,
    u.display_name AS ownerDisplayName
  FROM projects p
  JOIN users u ON u.id = p.owner_id
`;

const fieldToColumn: Record<string, string> = {
  projectCode: "project_code",
  name: "name",
  shortName: "short_name",
  responsiblePerson: "responsible_person",
  grade: "grade",
  diseaseType: "disease_type",
  region: "region",
  province: "province",
  leadingPi: "leading_pi",
  leadInstitution: "lead_institution",
  plannedCenterCount: "planned_center_count",
  plannedEnrollment: "planned_enrollment",
  enrolledCount: "enrolled_count",
  currentStage: "current_stage",
  status: "status",
  summary: "summary",
};

@Injectable()
export class ProjectsService {
  constructor(private readonly database: DatabaseService, private readonly realtime: ProjectsGateway) {}

  list(user: CurrentUser, search?: string) {
    const query = search?.trim();
    const rows = query
      ? this.database.db
          .prepare(`${selectProject} WHERE p.deleted_at IS NULL AND (p.name LIKE ? OR p.project_code LIKE ?) ORDER BY p.updated_at DESC LIMIT 200`)
          .all(`%${query}%`, `%${query}%`)
      : this.database.db
          .prepare(`${selectProject} WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 200`)
          .all();
    return (rows as unknown as ProjectRow[]).map((row) => this.present(row, user.id));
  }

  get(user: CurrentUser, id: string) {
    const row = this.findRow(id);
    if (!row) throw new NotFoundException("项目不存在");
    return this.present(row, user.id);
  }

  listFavoriteIds(user: CurrentUser) {
    return (this.database.db.prepare(`
      SELECT f.project_id AS projectId
      FROM user_project_favorites f
      JOIN projects p ON p.id = f.project_id
      WHERE f.user_id = ? AND p.deleted_at IS NULL
      ORDER BY f.created_at DESC
    `).all(user.id) as Array<{ projectId: string }>).map((item) => item.projectId);
  }

  addFavorite(user: CurrentUser, projectId: string) {
    if (!this.findRow(projectId)) throw new NotFoundException("项目不存在");
    this.database.db.prepare(`
      INSERT OR IGNORE INTO user_project_favorites (user_id, project_id, created_at)
      VALUES (?, ?, ?)
    `).run(user.id, projectId, new Date().toISOString());
    return { projectId };
  }

  removeFavorite(user: CurrentUser, projectId: string) {
    this.database.db.prepare("DELETE FROM user_project_favorites WHERE user_id = ? AND project_id = ?").run(user.id, projectId);
    return { projectId };
  }

  create(user: CurrentUser, input: CreateProjectInput) {
    const now = new Date().toISOString();
    const id = randomUUID();
    try {
      const row = this.database.transaction(() => {
        this.database.db.prepare(`
          INSERT INTO projects (
            id, project_code, name, short_name, responsible_person, grade, disease_type,
            region, province, leading_pi, lead_institution, planned_center_count,
            planned_enrollment, enrolled_count, current_stage, status, summary,
            owner_id, is_public_editable, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
        `).run(
          id,
          input.projectCode,
          input.name,
          this.nullable(input.shortName),
          input.responsiblePerson,
          input.grade,
          input.diseaseType,
          this.nullable(input.region),
          this.nullable(input.province),
          input.leadingPi,
          input.leadInstitution,
          input.plannedCenterCount,
          input.plannedEnrollment,
          input.enrolledCount ?? 0,
          this.nullable(input.currentStage),
          input.status ?? "筹备中",
          this.nullable(input.summary),
          user.id,
          now,
          now,
        );
        this.seedFixedMilestones(id, user.id, now);
        const created = this.findRow(id)!;
        this.writeAudit("CREATE", id, user.id, null, created);
        return created;
      });
      this.realtime.projectChanged({ projectId: id, action: "created", version: 1 });
      return this.present(row, user.id);
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException("项目编码已存在");
      throw error;
    }
  }

  update(user: CurrentUser, id: string, input: UpdateProjectInput) {
    const existing = this.findRow(id);
    if (!existing) throw new NotFoundException("项目不存在");
    const { version, ...changes } = input;
    const entries = Object.entries(changes).filter(([key]) => fieldToColumn[key]);
    const assignments = entries.map(([key]) => `${fieldToColumn[key]} = ?`);
    const values: Array<string | number | bigint | Uint8Array | null> = entries.map(([, value]) =>
      this.nullable(value),
    );
    assignments.push("version = version + 1", "updated_at = ?");
    values.push(new Date().toISOString());

    try {
      const updated = this.database.transaction(() => {
        const result = this.database.db
        .prepare(`UPDATE projects SET ${assignments.join(", ")} WHERE id = ? AND version = ? AND deleted_at IS NULL`)
          .run(...values, id, version);
        if (Number(result.changes) !== 1) throw new ConflictException("项目已被更新，请刷新后重试");
        const row = this.findRow(id)!;
        this.writeAudit("UPDATE", id, user.id, existing, row);
        return row;
      });
      this.realtime.projectChanged({ projectId: id, action: "updated", version: updated.version });
      return this.present(updated, user.id);
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException("项目编码已存在");
      throw error;
    }
  }

  remove(user: CurrentUser, id: string, input: DeleteProjectInput) {
    const existing = this.findRow(id);
    if (!existing) throw new NotFoundException("项目不存在");
    const now = new Date().toISOString();
    const deletedCode = `${String(existing.projectCode)}__deleted__${id}`;
    this.database.transaction(() => {
      const result = this.database.db.prepare(`
        UPDATE projects
        SET project_code = ?, deleted_at = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND version = ? AND deleted_at IS NULL
      `).run(deletedCode, now, now, id, input.version);
      if (Number(result.changes) !== 1) throw new ConflictException("项目已被更新，请刷新后重试");
      this.writeAudit("DELETE", id, user.id, existing, { deletedAt: now, recoverable: true });
    });
    this.realtime.projectChanged({ projectId: id, action: "deleted", version: input.version + 1 });
    return { ok: true, projectId: id, recoverable: true };
  }

  private findRow(id: string) {
    return this.database.db
      .prepare(`${selectProject} WHERE p.id = ? AND p.deleted_at IS NULL`)
      .get(id) as unknown as ProjectRow | undefined;
  }

  private seedFixedMilestones(projectId: string, ownerId: string, now: string) {
    const insert = this.database.db.prepare(`
      INSERT INTO milestones (
        id, project_id, name, planned_date, actual_date, status, sort_order,
        owner_id, version, created_at, updated_at, template_key
      ) VALUES (?, ?, ?, NULL, NULL, '未开始', ?, ?, 1, ?, ?, ?)
    `);
    for (const template of projectMilestoneTemplates) {
      insert.run(randomUUID(), projectId, template.name, template.sortOrder, ownerId, now, now, template.key);
    }
  }

  private writeAudit(action: string, entityId: string, userId: string, before: unknown, after: unknown) {
    this.database.db.prepare(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, user_id, before_json, after_json, created_at)
      VALUES (?, ?, 'PROJECT', ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      action,
      entityId,
      userId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      new Date().toISOString(),
    );
  }

  private present(row: ProjectRow, _userId: string) {
    const { ownerUserId, ownerDisplayName, ...project } = row;
    return {
      ...project,
      owner: { id: ownerUserId, displayName: ownerDisplayName },
      canEdit: true,
    };
  }

  private nullable(value: unknown): string | number | bigint | Uint8Array | null {
    if (value === "" || value === undefined || value === null) return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
    if (value instanceof Uint8Array) return value;
    return String(value);
  }

  private isUniqueError(error: unknown) {
    return error instanceof Error && error.message.includes("UNIQUE constraint failed");
  }
}
