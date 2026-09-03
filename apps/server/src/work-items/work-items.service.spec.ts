import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database.service";
import { ProjectsService } from "../projects/projects.service";
import { WorkItemsService } from "./work-items.service";

describe("WorkItemsService", () => {
  let database: DatabaseService;
  let auth: AuthService;
  let projects: ProjectsService;
  let workItems: WorkItemsService;

  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.NODE_ENV = "test";
    process.env.TEAM_ACCESS_PASSWORD = "team-secret";
    database = new DatabaseService();
    database.onModuleInit();
    auth = new AuthService(database);
    const realtime = { projectChanged: vi.fn() } as never;
    projects = new ProjectsService(database, realtime);
    workItems = new WorkItemsService(database, realtime);
  });

  afterEach(() => database.onModuleDestroy());

  it("allows all internal users to maintain milestones and tasks", async () => {
    const userA = (await auth.createIdentity("User A", "team-secret")).user;
    const userB = (await auth.createIdentity("User B", "team-secret")).user;
    const project = projects.create(userA, {
      projectCode: "WORK-001", name: "工作项测试", responsiblePerson: "User A", grade: "A",
      diseaseType: "测试", leadingPi: "PI", leadInstitution: "测试医院",
      plannedCenterCount: 1, plannedEnrollment: 10,
    });
    const milestone = workItems.listMilestones(userA, project.id)[0];
    const task = workItems.createTask(userB, project.id, {
      title: "准备材料", assigneeName: "User B", status: "进行中", priority: "高", progress: 30,
    });

    expect(workItems.listMilestones(userA, project.id)).toHaveLength(12);
    expect(workItems.listMilestones(userB, project.id)[0].canEdit).toBe(true);
    expect(workItems.listTasks(userA, project.id)[0].canEdit).toBe(true);
    const completed = workItems.updateMilestone(userB, milestone.id, { plannedDate: "2026-08-10", actualDate: "2026-08-18", version: 1 });
    expect(completed.status).toBe("已完成");
    expect((workItems.updateTask(userA, task.id, { progress: 100, version: 1 }) as unknown as { progress: number }).progress).toBe(100);
  });
});
