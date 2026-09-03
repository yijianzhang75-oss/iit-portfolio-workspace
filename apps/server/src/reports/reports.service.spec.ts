import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database.service";
import { ProjectsService } from "../projects/projects.service";
import { ReportsService } from "./reports.service";

describe("ReportsService", () => {
  let database: DatabaseService;
  let auth: AuthService;
  let projects: ProjectsService;
  let reports: ReportsService;

  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.NODE_ENV = "test";
    process.env.TEAM_ACCESS_PASSWORD = "team-secret";
    database = new DatabaseService();
    database.onModuleInit();
    auth = new AuthService(database);
    const realtime = { projectChanged: vi.fn() } as never;
    projects = new ProjectsService(database, realtime);
    reports = new ReportsService(database, realtime);
  });

  afterEach(() => database.onModuleDestroy());

  it("allows all internal users to maintain the project report", async () => {
    const owner = (await auth.createIdentity("Owner", "team-secret")).user;
    const viewer = (await auth.createIdentity("Viewer", "team-secret")).user;
    const project = projects.create(owner, {
      projectCode: "REPORT-001", name: "Report test", responsiblePerson: "Owner", grade: "A",
      diseaseType: "Test", leadingPi: "PI", leadInstitution: "Hospital", plannedCenterCount: 1, plannedEnrollment: 10,
    });

    expect(reports.get(viewer, project.id)).toMatchObject({ projectId: project.id, version: null, canEdit: true });
    const saved = reports.save(viewer, project.id, { completedWork: "Work done", nextPlan: "Next step" });
    expect(saved).toMatchObject({ completedWork: "Work done", nextPlan: "Next step", version: 1, canEdit: true });
    expect(reports.get(owner, project.id)).toMatchObject({ completedWork: "Work done", canEdit: true });
    expect(() => reports.save(owner, project.id, { version: 99, completedWork: "stale" })).toThrow(ConflictException);
  });
});
