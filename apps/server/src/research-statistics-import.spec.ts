import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService } from "./auth/auth.service";
import { DatabaseService } from "./database.service";
import { ProjectsService } from "./projects/projects.service";
import { importResearchStatistics } from "./research-statistics-import";

describe("research statistics import", () => {
  let database: DatabaseService;
  let directory = "";

  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.NODE_ENV = "test";
    process.env.TEAM_ACCESS_PASSWORD = "team-secret";
    database = new DatabaseService();
    database.onModuleInit();
  });

  afterEach(async () => {
    database.onModuleDestroy();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("imports complete rows as team-editable projects without inventing milestone dates", async () => {
    directory = await mkdtemp(join(tmpdir(), "iit-statistics-"));
    const file = join(directory, "统计表.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("IIT研究统计");
    sheet.addRow(["项目分级", "区域", "疾病", "医学部负责人", "研究题目", "研究分级", "牵头单位", "主要研究者", "方案编号", "中心数", "样本量", "(请勿修改)方案目前进度", "问题反馈", "项目总预算", "2026年预算", "是否配CRC", "是否配EDC", "赠药政策", "已入组"]);
    sheet.addRow(["A级项目", "东区", "IgA", "张三", "IgA 真实世界研究", "A", "示例医院", "李医生", "STAT-001", 3, 60, "科学性审查", "等待上会", 23.5, 9.4, "否", "是", "全赠", 8]);
    sheet.addRow(["A级项目", "东区", "IgA", "张三", "", "A", "示例医院", "李医生", "STAT-002", 1, 10, "方案沟通", "", 0, 0, "否", "否", "", 0]);
    await workbook.xlsx.writeFile(file);

    const preview = await importResearchStatistics(database, { file, commit: false });
    expect(preview).toMatchObject({ validRows: 1, skippedRows: 1, publicEditable: true });

    const result = await importResearchStatistics(database, { file, commit: true });
    expect(result.validRows).toBe(1);
    const project = database.db.prepare("SELECT id, project_code AS projectCode, responsible_person AS responsiblePerson, enrolled_count AS enrolledCount, is_public_editable AS isPublicEditable FROM projects WHERE project_code = 'STAT-001'").get() as { id: string; projectCode: string; responsiblePerson: string; enrolledCount: number; isPublicEditable: number };
    expect(project).toMatchObject({ projectCode: "STAT-001", responsiblePerson: "张三", enrolledCount: 8, isPublicEditable: 1 });
    expect(database.db.prepare("SELECT count(*) AS count FROM milestones WHERE project_id = ? AND planned_date IS NULL AND actual_date IS NULL").get(project.id)).toMatchObject({ count: 12 });
    expect(database.db.prepare("SELECT total_budget_cents AS cents FROM project_budget_overviews WHERE project_id = ?").get(project.id)).toMatchObject({ cents: 23_500_000 });

    const auth = new AuthService(database);
    const viewer = (await auth.enterByName("团队成员", "team-secret")).user;
    const projects = new ProjectsService(database, { projectChanged: vi.fn() } as never);
    expect(projects.get(viewer, project.id).canEdit).toBe(true);
    expect((projects.update(viewer, project.id, { currentStage: "伦理审核", version: 1 }) as unknown as { currentStage: string }).currentStage).toBe("伦理审核");
  });
});
