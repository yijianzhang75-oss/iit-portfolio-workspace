import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { CurrentUser } from "../auth/auth.types";
import { DatabaseService } from "../database.service";
import { ProjectsGateway } from "../realtime/projects.gateway";
import type {
  CreateTaskInput,
  UpdateMilestoneInput,
  UpdateTaskInput,
} from "./work-item.schemas";
import { milestoneStatus } from "./milestone-template";

type ItemRow = Record<string, unknown> & {
  id: string;
  projectId: string;
  name?: string;
  templateKey?: string | null;
  plannedDate?: string | null;
  actualDate?: string | null;
  status?: string;
  sortOrder?: number;
  ownerId: string;
  ownerDisplayName: string;
  isPublicEditable?: number;
  version: number;
};

@Injectable()
export class WorkItemsService {
  constructor(private readonly database: DatabaseService, private readonly realtime: ProjectsGateway) {}

  listMilestones(user: CurrentUser, projectId: string) {
    this.assertProject(projectId);
    const rows = this.database.db.prepare(`
      SELECT m.id, m.project_id AS projectId, m.name, m.template_key AS templateKey, m.planned_date AS plannedDate,
        m.actual_date AS actualDate, m.status, m.sort_order AS sortOrder,
        m.owner_id AS ownerId, m.version, m.created_at AS createdAt, m.updated_at AS updatedAt,
        u.display_name AS ownerDisplayName, p.is_public_editable AS isPublicEditable
      FROM milestones m JOIN users u ON u.id = m.owner_id JOIN projects p ON p.id = m.project_id
      WHERE m.project_id = ? AND m.deleted_at IS NULL
      ORDER BY m.sort_order, COALESCE(m.planned_date, '9999-12-31'), m.created_at
    `).all(projectId) as unknown as ItemRow[];
    return rows.map((row) => this.presentMilestone(row, user.id));
  }

  updateMilestone(user: CurrentUser, id: string, input: UpdateMilestoneInput) {
    const existing = this.findMilestone(id);
    if (!existing) throw new NotFoundException("里程碑不存在");
    this.assertEditableItem(existing, user);
    const plannedDate = input.plannedDate === undefined ? existing.plannedDate as string | null | undefined : input.plannedDate;
    const actualDate = input.actualDate === undefined ? existing.actualDate as string | null | undefined : input.actualDate;
    const changes = { ...input, status: milestoneStatus(plannedDate, actualDate) };
    const columns: Record<string, string> = { plannedDate: "planned_date", actualDate: "actual_date", status: "status" };
    const updated = this.updateItem("milestones", id, user.id, input.version, changes, columns, "MILESTONE", existing);
    this.realtime.projectChanged({ projectId: updated.projectId, action: "milestone.updated", version: updated.version });
    return this.presentMilestone(updated, user.id);
  }

  listTasks(user: CurrentUser, projectId: string) {
    this.assertProject(projectId);
    const rows = this.database.db.prepare(`
      SELECT t.id, t.project_id AS projectId, t.title, t.assignee_name AS assigneeName,
        t.status, t.priority, t.phase_name AS phaseName, t.start_date AS startDate, t.due_date AS dueDate,
        t.progress, t.notes, t.owner_id AS ownerId, t.version,
        t.created_at AS createdAt, t.updated_at AS updatedAt,
        u.display_name AS ownerDisplayName, p.is_public_editable AS isPublicEditable
      FROM tasks t JOIN users u ON u.id = t.owner_id JOIN projects p ON p.id = t.project_id
      WHERE t.project_id = ? AND t.deleted_at IS NULL
      ORDER BY CASE t.status WHEN '已阻塞' THEN 0 WHEN '进行中' THEN 1 WHEN '未开始' THEN 2 ELSE 3 END,
        COALESCE(t.due_date, '9999-12-31'), t.created_at
    `).all(projectId) as unknown as ItemRow[];
    return rows.map((row) => this.present(row, user.id));
  }

  createTask(user: CurrentUser, projectId: string, input: CreateTaskInput) {
    this.assertProject(projectId);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.db.prepare(`
        INSERT INTO tasks (id, project_id, title, assignee_name, status, priority, phase_name, start_date, due_date, progress, notes, owner_id, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, projectId, input.title, input.assigneeName, input.status, input.priority, this.nullable(input.phaseName), this.nullable(input.startDate), this.nullable(input.dueDate), input.progress, this.nullable(input.notes), user.id, now, now);
      this.writeAudit("CREATE", "TASK", id, user.id, null, input);
    });
    const item = this.findTask(id)!;
    this.realtime.projectChanged({ projectId, action: "task.created", version: item.version });
    return this.present(item, user.id);
  }

  updateTask(user: CurrentUser, id: string, input: UpdateTaskInput) {
    const existing = this.findTask(id);
    if (!existing) throw new NotFoundException("事项不存在");
    this.assertEditableItem(existing, user);
    const columns: Record<string, string> = {
      title: "title", assigneeName: "assignee_name", status: "status", priority: "priority", phaseName: "phase_name",
      startDate: "start_date", dueDate: "due_date", progress: "progress", notes: "notes",
    };
    const updated = this.updateItem("tasks", id, user.id, input.version, input, columns, "TASK", existing);
    this.realtime.projectChanged({ projectId: updated.projectId, action: "task.updated", version: updated.version });
    return this.present(updated, user.id);
  }

  private updateItem(
    table: "milestones" | "tasks",
    id: string,
    ownerId: string,
    version: number,
    input: Record<string, unknown>,
    columns: Record<string, string>,
    entityType: string,
    existing: ItemRow,
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
      const updated = table === "tasks" ? this.findTask(id)! : this.findMilestone(id)!;
      this.writeAudit("UPDATE", entityType, id, ownerId, existing, updated);
      return updated;
    });
  }

  private findMilestone(id: string) {
    return this.database.db.prepare(`
      SELECT m.id, m.project_id AS projectId, m.name, m.template_key AS templateKey, m.planned_date AS plannedDate,
        m.actual_date AS actualDate, m.status, m.sort_order AS sortOrder, m.owner_id AS ownerId,
        m.version, m.created_at AS createdAt, m.updated_at AS updatedAt, u.display_name AS ownerDisplayName,
        p.is_public_editable AS isPublicEditable
      FROM milestones m JOIN users u ON u.id = m.owner_id JOIN projects p ON p.id = m.project_id WHERE m.id = ? AND m.deleted_at IS NULL
    `).get(id) as unknown as ItemRow | undefined;
  }

  private findTask(id: string) {
    return this.database.db.prepare(`
      SELECT t.id, t.project_id AS projectId, t.title, t.assignee_name AS assigneeName,
        t.status, t.priority, t.phase_name AS phaseName, t.start_date AS startDate, t.due_date AS dueDate, t.progress,
        t.notes, t.owner_id AS ownerId, t.version, t.created_at AS createdAt,
        t.updated_at AS updatedAt, u.display_name AS ownerDisplayName, p.is_public_editable AS isPublicEditable
      FROM tasks t JOIN users u ON u.id = t.owner_id JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND t.deleted_at IS NULL
    `).get(id) as unknown as ItemRow | undefined;
  }

  private assertProject(projectId: string) {
    const row = this.database.db.prepare("SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL").get(projectId);
    if (!row) throw new NotFoundException("项目不存在");
  }

  private assertEditableItem(item: ItemRow, user: CurrentUser) {
    const row = this.database.db.prepare("SELECT is_public_editable AS isPublicEditable FROM projects WHERE id = ? AND deleted_at IS NULL").get(item.projectId) as { isPublicEditable: number } | undefined;
    if (!row) throw new NotFoundException("项目不存在");
    if (item.ownerId !== user.id && !row.isPublicEditable) throw new ForbiddenException("该项目当前不允许由其他成员编辑");
  }

  private present(row: ItemRow, userId: string) {
    const { ownerDisplayName, ...item } = row;
    return { ...item, owner: { id: row.ownerId, displayName: ownerDisplayName }, canEdit: Boolean(row.isPublicEditable) || row.ownerId === userId };
  }

  private presentMilestone(row: ItemRow, userId: string) {
    const { ownerDisplayName, ...item } = row;
    return {
      ...item,
      status: milestoneStatus(row.plannedDate, row.actualDate),
      owner: { id: row.ownerId, displayName: ownerDisplayName },
      canEdit: Boolean(row.isPublicEditable) || row.ownerId === userId,
    };
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
}
