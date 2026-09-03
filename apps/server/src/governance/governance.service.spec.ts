import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database.service";
import { ProjectsService } from "../projects/projects.service";
import { GovernanceService } from "./governance.service";

describe("GovernanceService", () => {
  let database: DatabaseService;
  let auth: AuthService;
  let projects: ProjectsService;
  let governance: GovernanceService;

  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.NODE_ENV = "test";
    process.env.TEAM_ACCESS_PASSWORD = "team-secret";
    database = new DatabaseService(); database.onModuleInit();
    auth = new AuthService(database);
    const realtime = { projectChanged: vi.fn() } as never;
    projects = new ProjectsService(database, realtime);
    governance = new GovernanceService(database, realtime);
  });

  afterEach(() => database.onModuleDestroy());

  it("allows all internal users to maintain governance records", async () => {
    const userA = (await auth.createIdentity("Governance A", "team-secret")).user;
    const userB = (await auth.createIdentity("Governance B", "team-secret")).user;
    const project = projects.create(userA, {
      projectCode: "GOV-001", name: "治理测试", responsiblePerson: "Governance A", grade: "A",
      diseaseType: "测试", leadingPi: "PI", leadInstitution: "测试医院", plannedCenterCount: 1, plannedEnrollment: 10,
    });
    const risk = governance.createRisk(userA, project.id, { title: "入组偏慢", level: "高", status: "开放" });
    governance.createGoal(userB, project.id, { year: 2026, title: "完成首例入组", status: "进行中" });
    const budget = governance.createBudget(userA, project.id, { year: 2026, category: "检测费", budgetAmount: 123.45, spentAmount: 23.45 });

    expect(governance.listRisks(userB, project.id)[0].canEdit).toBe(true);
    expect(governance.listGoals(userA, project.id)[0].canEdit).toBe(true);
    expect((governance.listBudgets(userB, project.id)[0] as unknown as { budgetAmount: number }).budgetAmount).toBe(123.45);
    expect(governance.updateRisk(userB, risk.id, { status: "已解决", version: 1 }).canEdit).toBe(true);
    expect((governance.updateBudget(userB, budget.id, { budgetAmount: 200.01, version: 1 }) as unknown as { budgetAmount: number }).budgetAmount).toBe(200.01);
  });

  it("maintains one team-editable project-wide budget overview in wan", async () => {
    const userA = (await auth.createIdentity("Budget A", "team-secret")).user;
    const userB = (await auth.createIdentity("Budget B", "team-secret")).user;
    const project = projects.create(userA, {
      projectCode: "BUDGET-001", name: "预算测试", responsiblePerson: "Budget A", grade: "A",
      diseaseType: "测试", leadingPi: "PI", leadInstitution: "测试医院", plannedCenterCount: 0, plannedEnrollment: 10,
    });
    const row = governance.updateBudgetOverview(userA, project.id, { totalBudgetWan: 80, medicalBudgetWan: 50, salesBudgetWan: 30, salesAllocatedBudgetWan: 12 });
    expect((row as unknown as { totalBudgetWan: number }).totalBudgetWan).toBe(80);
    expect((governance.budgetOverview(userB, project.id) as unknown as { salesAllocatedBudgetWan: number; canEdit: boolean }).salesAllocatedBudgetWan).toBe(12);
    expect((governance.budgetOverview(userB, project.id) as unknown as { canEdit: boolean }).canEdit).toBe(true);
    expect((governance.updateBudgetOverview(userB, project.id, { totalBudgetWan: 81, medicalBudgetWan: 50, salesBudgetWan: 30, salesAllocatedBudgetWan: 12, version: 1 }) as unknown as { totalBudgetWan: number }).totalBudgetWan).toBe(81);
  });
});
