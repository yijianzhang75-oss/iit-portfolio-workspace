import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database.service";
import { ProjectsService } from "../projects/projects.service";
import { ResearchService } from "./research.service";

describe("ResearchService", () => {
  let database: DatabaseService;
  let auth: AuthService;
  let projects: ProjectsService;
  let research: ResearchService;

  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.NODE_ENV = "test";
    process.env.TEAM_ACCESS_PASSWORD = "team-secret";
    database = new DatabaseService();
    database.onModuleInit();
    auth = new AuthService(database);
    const realtime = { projectChanged: vi.fn() } as never;
    projects = new ProjectsService(database, realtime);
    research = new ResearchService(database, realtime);
  });

  afterEach(() => database.onModuleDestroy());

  it("allows all internal users to maintain center and trend data", async () => {
    const userA = (await auth.createIdentity("Research A", "team-secret")).user;
    const userB = (await auth.createIdentity("Research B", "team-secret")).user;
    const project = projects.create(userA, {
      projectCode: "CENTER-001", name: "中心测试", responsiblePerson: "Research A", grade: "A",
      diseaseType: "测试", leadingPi: "PI", leadInstitution: "测试医院",
      plannedCenterCount: 2, plannedEnrollment: 30,
    });
    const center = research.createCenter(userA, project.id, {
      name: "第一中心", stage: "入组中", plannedEnrollment: 15,
      enrolledCount: 5, activeCount: 4, followupCompleteCount: 1,
    });
    const snapshot = research.createSnapshot(userB, project.id, {
      snapshotDate: "2026-08-18", enrolledCount: 5, activeCount: 4, followupCompleteCount: 1,
    });

    expect(research.listCenters(userB, project.id)[0].canEdit).toBe(true);
    expect(research.listSnapshots(userA, project.id)[0].canEdit).toBe(true);
    expect(research.updateCenter(userB, center.id, { stage: "已关闭", version: 1 }).canEdit).toBe(true);
    expect((research.updateSnapshot(userA, snapshot.id, { enrolledCount: 6, version: 1 }) as unknown as { enrolledCount: number }).enrolledCount).toBe(6);
    expect(() => research.createSnapshot(userA, project.id, {
      snapshotDate: "2026-08-18", enrolledCount: 6, activeCount: 5, followupCompleteCount: 1,
    })).toThrow(ConflictException);
  });

  it("stores yearly enrollment targets independently for every project year", async () => {
    const userA = (await auth.createIdentity("Target A", "team-secret")).user;
    const userB = (await auth.createIdentity("Target B", "team-secret")).user;
    const project = projects.create(userA, {
      projectCode: "TARGET-001", name: "年度目标测试", responsiblePerson: "Target A", grade: "A",
      diseaseType: "测试", leadingPi: "PI", leadInstitution: "测试医院", plannedCenterCount: 0, plannedEnrollment: 100,
    });
    const target = research.createAnnualTarget(userA, project.id, { year: 2026, targetEnrollment: 60, enrolledCount: 32, activeCount: 28, followupCompleteCount: 8, dropoutCount: 2 });
    expect((research.listAnnualTargets(userB, project.id)[0] as unknown as { canEdit: boolean; enrolledCount: number }).canEdit).toBe(true);
    expect((research.listAnnualTargets(userB, project.id)[0] as unknown as { enrolledCount: number }).enrolledCount).toBe(32);
    expect((research.updateAnnualTarget(userB, target.id, { enrolledCount: 33, version: 1 }) as unknown as { enrolledCount: number }).enrolledCount).toBe(33);
    expect(() => research.createAnnualTarget(userA, project.id, { year: 2026, targetEnrollment: 60, enrolledCount: 32, activeCount: 28, followupCompleteCount: 8, dropoutCount: 2 })).toThrow(ConflictException);
  });
});
