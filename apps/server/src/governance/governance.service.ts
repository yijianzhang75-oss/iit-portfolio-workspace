import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { CurrentUser } from "../auth/auth.types";
import { DatabaseService } from "../database.service";
import { ProjectsGateway } from "../realtime/projects.gateway";
import type {
  CreateBudgetInput, CreateGoalInput, CreateRiskInput,
  UpdateBudgetInput, UpdateGoalInput, UpdateRiskInput, UpdateBudgetOverviewInput,
} from "./governance.schemas";

type GovernanceRow = Record<string, unknown> & {
  id: string; projectId: string; ownerId: string; ownerDisplayName: string; version: number;
};

@Injectable()
export class GovernanceService {
  constructor(private readonly database: DatabaseService, private readonly realtime: ProjectsGateway) {}

  listRisks(user: CurrentUser, projectId: string) {
    this.assertProject(projectId);
    return (this.database.db.prepare(`
      SELECT r.id, r.project_id AS projectId, r.title, r.level, r.status,
        r.responsible_person AS responsiblePerson, r.due_date AS dueDate, r.mitigation,
        r.owner_id AS ownerId, r.version, r.created_at AS createdAt, r.updated_at AS updatedAt,
        u.display_name AS ownerDisplayName
      FROM project_risks r JOIN users u ON u.id = r.owner_id
      WHERE r.project_id = ? AND r.deleted_at IS NULL
      ORDER BY CASE r.level WHEN '严重' THEN 0 WHEN '高' THEN 1 WHEN '中' THEN 2 ELSE 3 END,
        CASE r.status WHEN '开放' THEN 0 WHEN '监控中' THEN 1 ELSE 2 END, COALESCE(r.due_date, '9999-12-31')
    `).all(projectId) as unknown as GovernanceRow[]).map((row) => this.present(row, user.id));
  }

  createRisk(user: CurrentUser, projectId: string, input: CreateRiskInput) {
    this.assertProject(projectId);
    const id = randomUUID(); const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.db.prepare(`
        INSERT INTO project_risks (id, project_id, title, level, status, responsible_person, due_date, mitigation, owner_id, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, projectId, input.title, input.level, input.status, this.nullable(input.responsiblePerson), this.nullable(input.dueDate), this.nullable(input.mitigation), user.id, now, now);
      this.writeAudit("CREATE", "RISK", id, user.id, null, input);
    });
    const row = this.findRisk(id)!; this.emit(row, "risk.created"); return this.present(row, user.id);
  }

  updateRisk(user: CurrentUser, id: string, input: UpdateRiskInput) {
    const existing = this.findRisk(id); if (!existing) throw new NotFoundException("风险记录不存在"); this.assertOwner(existing, user);
    const row = this.updateItem("project_risks", id, user.id, input.version, input,
      { title: "title", level: "level", status: "status", responsiblePerson: "responsible_person", dueDate: "due_date", mitigation: "mitigation" },
      "RISK", existing, () => this.findRisk(id)!);
    this.emit(row, "risk.updated"); return this.present(row, user.id);
  }

  listGoals(user: CurrentUser, projectId: string) {
    this.assertProject(projectId);
    return (this.database.db.prepare(`
      SELECT g.id, g.project_id AS projectId, g.year, g.title, g.status,
        g.planned_date AS plannedDate, g.completion_notes AS completionNotes,
        g.owner_id AS ownerId, g.version, g.created_at AS createdAt, g.updated_at AS updatedAt,
        u.display_name AS ownerDisplayName
      FROM annual_goals g JOIN users u ON u.id = g.owner_id
      WHERE g.project_id = ? AND g.deleted_at IS NULL
      ORDER BY g.year DESC, CASE g.status WHEN '进行中' THEN 0 WHEN '未开始' THEN 1 ELSE 2 END, COALESCE(g.planned_date, '9999-12-31')
    `).all(projectId) as unknown as GovernanceRow[]).map((row) => this.present(row, user.id));
  }

  createGoal(user: CurrentUser, projectId: string, input: CreateGoalInput) {
    this.assertProject(projectId);
    const id = randomUUID(); const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.db.prepare(`
        INSERT INTO annual_goals (id, project_id, year, title, status, planned_date, completion_notes, owner_id, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, projectId, input.year, input.title, input.status, this.nullable(input.plannedDate), this.nullable(input.completionNotes), user.id, now, now);
      this.writeAudit("CREATE", "ANNUAL_GOAL", id, user.id, null, input);
    });
    const row = this.findGoal(id)!; this.emit(row, "goal.created"); return this.present(row, user.id);
  }

  updateGoal(user: CurrentUser, id: string, input: UpdateGoalInput) {
    const existing = this.findGoal(id); if (!existing) throw new NotFoundException("年度目标不存在"); this.assertOwner(existing, user);
    const row = this.updateItem("annual_goals", id, user.id, input.version, input,
      { year: "year", title: "title", status: "status", plannedDate: "planned_date", completionNotes: "completion_notes" },
      "ANNUAL_GOAL", existing, () => this.findGoal(id)!);
    this.emit(row, "goal.updated"); return this.present(row, user.id);
  }

  listBudgets(user: CurrentUser, projectId: string) {
    this.assertProject(projectId);
    return (this.database.db.prepare(`
      SELECT b.id, b.project_id AS projectId, b.year, b.category,
        b.budget_amount_cents / 100.0 AS budgetAmount, b.spent_amount_cents / 100.0 AS spentAmount,
        b.notes, b.owner_id AS ownerId, b.version, b.created_at AS createdAt, b.updated_at AS updatedAt,
        u.display_name AS ownerDisplayName
      FROM project_budgets b JOIN users u ON u.id = b.owner_id
      WHERE b.project_id = ? AND b.deleted_at IS NULL ORDER BY b.year DESC, b.category
    `).all(projectId) as unknown as GovernanceRow[]).map((row) => this.present(row, user.id));
  }

  createBudget(user: CurrentUser, projectId: string, input: CreateBudgetInput) {
    this.assertProject(projectId);
    const id = randomUUID(); const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.db.prepare(`
        INSERT INTO project_budgets (id, project_id, year, category, budget_amount_cents, spent_amount_cents, notes, owner_id, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, projectId, input.year, input.category, this.toCents(input.budgetAmount), this.toCents(input.spentAmount), this.nullable(input.notes), user.id, now, now);
      this.writeAudit("CREATE", "BUDGET", id, user.id, null, input);
    });
    const row = this.findBudget(id)!; this.emit(row, "budget.created"); return this.present(row, user.id);
  }

  updateBudget(user: CurrentUser, id: string, input: UpdateBudgetInput) {
    const existing = this.findBudget(id); if (!existing) throw new NotFoundException("预算记录不存在"); this.assertOwner(existing, user);
    const transformed: Record<string, unknown> = { ...input };
    if (input.budgetAmount !== undefined) transformed.budgetAmount = this.toCents(input.budgetAmount);
    if (input.spentAmount !== undefined) transformed.spentAmount = this.toCents(input.spentAmount);
    const row = this.updateItem("project_budgets", id, user.id, input.version, transformed,
      { year: "year", category: "category", budgetAmount: "budget_amount_cents", spentAmount: "spent_amount_cents", notes: "notes" },
      "BUDGET", existing, () => this.findBudget(id)!);
    this.emit(row, "budget.updated"); return this.present(row, user.id);
  }

  budgetOverview(user: CurrentUser, projectId: string) {
    this.assertProject(projectId);
    const row = this.database.db.prepare(`
      SELECT b.project_id AS projectId,
        b.total_budget_cents / 1000000.0 AS totalBudgetWan,
        b.medical_budget_cents / 1000000.0 AS medicalBudgetWan,
        b.sales_budget_cents / 1000000.0 AS salesBudgetWan,
        b.sales_allocated_budget_cents / 1000000.0 AS salesAllocatedBudgetWan,
        b.owner_id AS ownerId, b.version, b.created_at AS createdAt, b.updated_at AS updatedAt,
        u.display_name AS ownerDisplayName
      FROM project_budget_overviews b JOIN users u ON u.id = b.owner_id
      WHERE b.project_id = ?
    `).get(projectId) as unknown as GovernanceRow | undefined;
    if (!row) return { projectId, totalBudgetWan: 0, medicalBudgetWan: 0, salesBudgetWan: 0, salesAllocatedBudgetWan: 0, version: null, owner: null, canEdit: this.canEditProject(projectId, user.id) };
    return this.present(row, user.id);
  }

  updateBudgetOverview(user: CurrentUser, projectId: string, input: UpdateBudgetOverviewInput) {
    this.assertProject(projectId);
    if (!this.canEditProject(projectId, user.id)) throw new ForbiddenException("该项目当前不允许由其他成员编辑预算");
    const existing = this.budgetOverview(user, projectId) as Record<string, unknown>;
    const now = new Date().toISOString();
    const changes = this.database.transaction(() => {
      const result = this.database.db.prepare(`
        INSERT INTO project_budget_overviews (
          project_id, total_budget_cents, medical_budget_cents, sales_budget_cents, sales_allocated_budget_cents,
          owner_id, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          total_budget_cents = excluded.total_budget_cents,
          medical_budget_cents = excluded.medical_budget_cents,
          sales_budget_cents = excluded.sales_budget_cents,
          sales_allocated_budget_cents = excluded.sales_allocated_budget_cents,
          version = project_budget_overviews.version + 1,
          updated_at = excluded.updated_at
      `).run(projectId, this.wanToCents(input.totalBudgetWan), this.wanToCents(input.medicalBudgetWan), this.wanToCents(input.salesBudgetWan), this.wanToCents(input.salesAllocatedBudgetWan), user.id, now, now);
      this.writeAudit("UPDATE", "PROJECT_BUDGET_OVERVIEW", projectId, user.id, existing.version ? existing : null, input);
      return result;
    });
    void changes;
    const row = this.budgetOverview(user, projectId) as unknown as GovernanceRow;
    this.realtime.projectChanged({ projectId, action: "budget-overview.updated", version: row.version });
    return row;
  }

  private updateItem(table: "project_risks" | "annual_goals" | "project_budgets", id: string, ownerId: string, version: number,
    input: Record<string, unknown>, columns: Record<string, string>, entityType: string, existing: GovernanceRow, reload: () => GovernanceRow) {
    const entries = Object.entries(input).filter(([key]) => key !== "version" && columns[key]);
    const assignments = entries.map(([key]) => `${columns[key]} = ?`);
    const values = entries.map(([, value]) => this.nullable(value));
    assignments.push("version = version + 1", "updated_at = ?"); values.push(new Date().toISOString());
    return this.database.transaction(() => {
      const result = this.database.db.prepare(`UPDATE ${table} SET ${assignments.join(", ")} WHERE id = ? AND version = ? AND deleted_at IS NULL`).run(...values, id, version);
      if (Number(result.changes) !== 1) throw new ConflictException("内容已被更新，请刷新后重试");
      const row = reload(); this.writeAudit("UPDATE", entityType, id, ownerId, existing, row); return row;
    });
  }

  private findRisk(id: string) { return this.database.db.prepare(`SELECT r.id, r.project_id AS projectId, r.title, r.level, r.status, r.responsible_person AS responsiblePerson, r.due_date AS dueDate, r.mitigation, r.owner_id AS ownerId, r.version, u.display_name AS ownerDisplayName FROM project_risks r JOIN users u ON u.id=r.owner_id WHERE r.id=? AND r.deleted_at IS NULL`).get(id) as unknown as GovernanceRow | undefined; }
  private findGoal(id: string) { return this.database.db.prepare(`SELECT g.id, g.project_id AS projectId, g.year, g.title, g.status, g.planned_date AS plannedDate, g.completion_notes AS completionNotes, g.owner_id AS ownerId, g.version, u.display_name AS ownerDisplayName FROM annual_goals g JOIN users u ON u.id=g.owner_id WHERE g.id=? AND g.deleted_at IS NULL`).get(id) as unknown as GovernanceRow | undefined; }
  private findBudget(id: string) { return this.database.db.prepare(`SELECT b.id, b.project_id AS projectId, b.year, b.category, b.budget_amount_cents/100.0 AS budgetAmount, b.spent_amount_cents/100.0 AS spentAmount, b.notes, b.owner_id AS ownerId, b.version, u.display_name AS ownerDisplayName FROM project_budgets b JOIN users u ON u.id=b.owner_id WHERE b.id=? AND b.deleted_at IS NULL`).get(id) as unknown as GovernanceRow | undefined; }
  private projectOwnerId(projectId: string) { return (this.database.db.prepare("SELECT owner_id AS ownerId FROM projects WHERE id=? AND deleted_at IS NULL").get(projectId) as { ownerId: string }).ownerId; }
  private assertProject(projectId: string) { if (!this.database.db.prepare("SELECT id FROM projects WHERE id=? AND deleted_at IS NULL").get(projectId)) throw new NotFoundException("项目不存在"); }
  private assertOwner(row: GovernanceRow, user: CurrentUser) { if (row.ownerId !== user.id && !this.isPublicProject(row.projectId)) throw new ForbiddenException("该项目当前不允许由其他成员编辑"); }
  private canEditProject(projectId: string, userId: string) {
    const row = this.database.db.prepare("SELECT owner_id AS ownerId, is_public_editable AS isPublicEditable FROM projects WHERE id=? AND deleted_at IS NULL").get(projectId) as { ownerId: string; isPublicEditable: number } | undefined;
    return Boolean(row && (row.ownerId === userId || row.isPublicEditable));
  }
  private isPublicProject(projectId: string) { return Boolean((this.database.db.prepare("SELECT is_public_editable AS isPublicEditable FROM projects WHERE id=? AND deleted_at IS NULL").get(projectId) as { isPublicEditable: number } | undefined)?.isPublicEditable); }
  private present(row: GovernanceRow, userId: string) { const { ownerDisplayName, ...item } = row; return { ...item, owner: { id: row.ownerId, displayName: ownerDisplayName }, canEdit: row.ownerId === userId || this.isPublicProject(row.projectId) }; }
  private emit(row: GovernanceRow, action: string) { this.realtime.projectChanged({ projectId: row.projectId, action, version: row.version }); }
  private toCents(value: number) { return Math.round(value * 100); }
  private wanToCents(value: number) { return Math.round(value * 1_000_000); }
  private nullable(value: unknown): string | number | bigint | Uint8Array | null { if (value === "" || value === undefined || value === null) return null; if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value; if (value instanceof Uint8Array) return value; return String(value); }
  private writeAudit(action: string, entityType: string, entityId: string, userId: string, before: unknown, after: unknown) { this.database.db.prepare(`INSERT INTO audit_logs (id, action, entity_type, entity_id, user_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), action, entityType, entityId, userId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, new Date().toISOString()); }
}
