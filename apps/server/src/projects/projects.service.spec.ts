import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database.service";
import { AuthService } from "../auth/auth.service";
import { ProjectsService } from "./projects.service";

describe("ProjectsService ownership", () => {
  let database: DatabaseService;
  let auth: AuthService;
  let projects: ProjectsService;

  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.NODE_ENV = "test";
    process.env.TEAM_ACCESS_PASSWORD = "team-secret";
    database = new DatabaseService();
    database.onModuleInit();
    auth = new AuthService(database);
    projects = new ProjectsService(database, { projectChanged: vi.fn() } as never);
  });

  afterEach(() => database.onModuleDestroy());

  it("allows every internal user to view and update project master data", async () => {
    const owner = (await auth.createIdentity("Owner", "team-secret")).user;
    const viewer = (await auth.createIdentity("Viewer", "team-secret")).user;
    const created = projects.create(owner, {
      projectCode: "TEST-001",
      name: "测试项目",
      responsiblePerson: "Owner",
      grade: "A",
      diseaseType: "测试",
      leadingPi: "PI",
      leadInstitution: "测试医院",
      plannedCenterCount: 2,
      plannedEnrollment: 20,
    });

    expect(projects.list(viewer)).toHaveLength(1);
    expect(projects.listFavoriteIds(viewer)).toEqual([]);
    projects.addFavorite(viewer, created.id);
    expect(projects.listFavoriteIds(viewer)).toEqual([created.id]);
    projects.removeFavorite(viewer, created.id);
    expect(projects.listFavoriteIds(viewer)).toEqual([]);
    const updated = projects.update(viewer, created.id, { name: "团队修改", enrolledCount: 5, version: 1 });
    expect(updated.version).toBe(2);
    expect(() => projects.update(owner, created.id, { enrolledCount: 8, version: 1 })).toThrow(
      ConflictException,
    );
    expect(projects.remove(viewer, created.id, { version: 2 })).toEqual({ ok: true, projectId: created.id, recoverable: true });
    expect(projects.list(owner)).toHaveLength(0);
    expect(() => projects.get(owner, created.id)).toThrow(NotFoundException);
    expect(projects.create(owner, {
      projectCode: "TEST-001",
      name: "重新建立的项目",
      responsiblePerson: "Owner",
      grade: "A",
      diseaseType: "测试",
      leadingPi: "PI",
      leadInstitution: "测试医院",
      plannedCenterCount: 2,
      plannedEnrollment: 20,
    }).projectCode).toBe("TEST-001");
  });
});
