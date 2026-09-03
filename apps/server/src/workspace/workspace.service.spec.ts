import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database.service";
import { GovernanceService } from "../governance/governance.service";
import { ProjectsService } from "../projects/projects.service";
import { ResearchService } from "../research/research.service";
import { WorkItemsService } from "../work-items/work-items.service";
import { WorkspaceService } from "./workspace.service";

describe("WorkspaceService", () => {
  let database: DatabaseService;

  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.NODE_ENV = "test";
    process.env.TEAM_ACCESS_PASSWORD = "team-secret";
    database = new DatabaseService();
    database.onModuleInit();
  });

  afterEach(() => database.onModuleDestroy());

  it("returns the complete workspace in one snapshot", async () => {
    const gateway = { projectChanged: vi.fn() } as never;
    const user = (await new AuthService(database).createIdentity("Workspace User", "team-secret")).user;
    const projects = new ProjectsService(database, gateway);
    const created = projects.create(user, {
      projectCode: "SNAPSHOT-001",
      name: "工作台快照测试项目",
      responsiblePerson: "Workspace User",
      grade: "A",
      diseaseType: "测试疾病",
      leadingPi: "测试 PI",
      leadInstitution: "测试机构",
      plannedCenterCount: 1,
      plannedEnrollment: 20,
      enrolledCount: 0,
      status: "筹备中",
    });
    const service = new WorkspaceService(
      projects,
      new WorkItemsService(database, gateway),
      new ResearchService(database, gateway),
      new GovernanceService(database, gateway),
    );

    const snapshot = service.snapshot(user);

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.projects[0].id).toBe(created.id);
    expect(snapshot.data.milestones).toHaveLength(12);
    expect(snapshot.data.budgetOverviews).toHaveLength(1);
    expect(snapshot.data.tasks).toHaveLength(0);
  });
});
