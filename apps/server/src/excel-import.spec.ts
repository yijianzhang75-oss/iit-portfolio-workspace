import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthService } from "./auth/auth.service";
import { DatabaseService } from "./database.service";
import { importExcel } from "./excel-import";

describe("Excel import", () => {
  let database: DatabaseService;
  let directory: string;

  beforeEach(async () => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.NODE_ENV = "test";
    process.env.TEAM_ACCESS_PASSWORD = "team-secret";
    directory = await mkdtemp(join(tmpdir(), "iit-excel-import-"));
    database = new DatabaseService();
    database.onModuleInit();
  });

  afterEach(async () => {
    database.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  });

  it("maps the original 36-column workbook without modifying it", async () => {
    const auth = new AuthService(database);
    await auth.createIdentity("导入负责人", "team-secret");
    const file = join(directory, "synthetic-import.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    const milestoneHeaders = [
      "研究方案定稿时间", "科学性审查/立项通过时间", "伦理批件获取时间", "合同签署时间",
      "研究启动时间", "首例入组时间", "入组完成计划时间", "随访完成时间",
      "数据清理完成时间", "统计分析完成时间", "文章撰写完成时间", "中心关闭时间",
    ];
    const headers = [
      "项目编码", "项目名称", "项目负责人", "课题分级", "疾病类型", "区域", "省份", "Leading-PI", "组长单位", "中心数", "总例数", "已入组例数",
      ...milestoneHeaders,
      "2026年目标", "2026年预算（万元）", "当前在组例数（访视期/随访中例数）", "当前完成随访例数", "赠药政策",
      "项目总预算（万元）", ...Array.from({ length: 6 }, (_, index) => `演示扩展字段${index + 1}`),
    ];
    const values: Record<string, string | number> = {
      "项目编码": "DEMO-IIT-2026-001", "项目名称": "虚构导入测试项目", "项目负责人": "项目经理 A", "课题分级": "A", "疾病类型": "演示疾病",
      "区域": "东区", "省份": "示例省", "Leading-PI": "演示 PI", "组长单位": "示例研究中心", "中心数": 3, "总例数": 18, "已入组例数": 4,
      "研究方案定稿时间": "2026-07-01", "科学性审查/立项通过时间": "2026-08-01", "2026年目标": "完成 10 例入组", "2026年预算（万元）": 9.36, "项目总预算（万元）": 26.5,
      "当前在组例数（访视期/随访中例数）": 4, "当前完成随访例数": 0, "赠药政策": "虚构演示",
    };
    sheet.addRow(headers);
    sheet.addRow(headers.map((header) => values[header] ?? null));
    await workbook.xlsx.writeFile(file);
    const preview = await importExcel(database, { file, ownerName: "导入负责人", commit: false });
    expect(preview.validRows).toBe(1);
    expect(preview.mappedColumns).toHaveLength(36);

    const result = await importExcel(database, { file, ownerName: "导入负责人", commit: true });
    expect(result.validRows).toBe(1);
    const project = database.db.prepare("SELECT project_code AS code, planned_enrollment AS planned FROM projects").get() as { code: string; planned: number };
    expect(project).toEqual({ code: "DEMO-IIT-2026-001", planned: 18 });
    const milestones = database.db.prepare("SELECT name, planned_date AS plannedDate FROM milestones ORDER BY sort_order").all() as Array<{ name: string; plannedDate: string }>;
    expect(milestones.slice(0, 2)).toEqual([
      { name: "研究方案定稿时间", plannedDate: "2026-07-01" },
      { name: "科学性审查/立项通过时间", plannedDate: "2026-08-01" },
    ]);
    const budget = database.db.prepare("SELECT budget_amount_cents AS cents FROM project_budgets").get() as { cents: number };
    expect(budget.cents).toBe(9_360_000);
    const source = database.db.prepare("SELECT source_json AS sourceJson FROM project_import_sources").get() as { sourceJson: string };
    expect(JSON.parse(source.sourceJson)["项目总预算（万元）"]).toBe(26.5);
  });
});
