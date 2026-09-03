import ExcelJS from "exceljs";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { DatabaseService } from "./database.service";

type ImportOptions = { file: string; ownerName: string; commit: boolean };
type RawRecord = Record<string, string | number | boolean | null>;

const milestoneHeaders = [
  "研究方案定稿时间", "科学性审查/立项通过时间", "伦理批件获取时间", "合同签署时间",
  "研究启动时间", "首例入组时间", "入组完成计划时间", "随访完成时间",
  "数据清理完成时间", "统计分析完成时间", "文章撰写完成时间", "中心关闭时间",
];

export async function importExcel(database: DatabaseService, options: ImportOptions) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(options.file);
  const sheet = workbook.getWorksheet("Sheet1") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("Excel 中没有工作表");
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => normalizeHeader(toScalar(value)));
  const records: Array<{ rowNumber: number; raw: RawRecord }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: RawRecord = {};
    headers.forEach((header, index) => { if (header) raw[header] = toScalar(row.getCell(index + 1).value); });
    if (text(raw["项目编码"]) || text(raw["项目名称"])) records.push({ rowNumber, raw });
  });

  const owner = database.db.prepare(`
    SELECT id, display_name AS displayName FROM users
    WHERE display_name_normalized = ? AND status = 'ACTIVE'
  `).get(normalizeName(options.ownerName)) as { id: string; displayName: string } | undefined;
  if (!owner) throw new Error(`未找到可用系统用户“${options.ownerName}”，请先用该姓名进入系统一次`);

  const seen = new Set<string>();
  const preview = records.map(({ rowNumber, raw }) => {
    const projectCode = text(raw["项目编码"]);
    const name = text(raw["项目名称"]);
    const errors: string[] = [];
    if (!projectCode) errors.push("项目编码为空");
    if (!name) errors.push("项目名称为空");
    if (projectCode && seen.has(projectCode)) errors.push("文件内项目编码重复");
    if (projectCode) seen.add(projectCode);
    const existing = projectCode ? database.db.prepare("SELECT id FROM projects WHERE project_code = ?").get(projectCode) : null;
    if (existing) errors.push("系统中项目编码已存在");
    return { rowNumber, projectCode, name, errors, raw };
  });
  const valid = preview.filter((item) => item.errors.length === 0);
  const invalid = preview.filter((item) => item.errors.length > 0);

  if (options.commit && valid.length) {
    const batchId = randomUUID();
    const now = new Date().toISOString();
    const sourceSha256 = createHash("sha256").update(readFileSync(options.file)).digest("hex");
    database.transaction(() => {
      database.db.prepare(`
        INSERT INTO import_batches (id, source_file, source_sha256, sheet_name, owner_id, imported_count, skipped_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(batchId, basename(options.file), sourceSha256, sheet.name, owner.id, valid.length, invalid.length, now);
      for (const item of valid) insertRecord(database, item.raw, item.rowNumber, batchId, owner.id, now);
    });
  }
  return {
    mode: options.commit ? "commit" : "dry-run",
    sheet: sheet.name,
    owner: owner.displayName,
    totalRows: preview.length,
    validRows: valid.length,
    skippedRows: invalid.length,
    errors: invalid.map(({ rowNumber, projectCode, name, errors }) => ({ rowNumber, projectCode, name, errors })),
    mappedColumns: headers.filter(Boolean),
  };
}

function insertRecord(database: DatabaseService, raw: RawRecord, rowNumber: number, batchId: string, ownerId: string, now: string) {
  const projectId = randomUUID();
  const stage = text(raw["中心所处阶段/进展（SSU、入组、随访、关中心）"]);
  const enrolled = integer(raw["已入组例数"]);
  const summaryParts = [
    text(raw["赠药政策"]) ? `赠药政策：${text(raw["赠药政策"])}` : "",
    `原始 Excel 第 ${rowNumber} 行导入`,
  ].filter(Boolean);
  database.db.prepare(`
    INSERT INTO projects (
      id, project_code, name, short_name, responsible_person, grade, disease_type,
      region, province, leading_pi, lead_institution, planned_center_count,
      planned_enrollment, enrolled_count, current_stage, status, summary,
      owner_id, version, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    projectId, text(raw["项目编码"]), text(raw["项目名称"]), text(raw["项目负责人"]) || "待确认",
    text(raw["课题分级"]) || "未分级", text(raw["疾病类型"]) || "未填写", nullableText(raw["区域"]),
    nullableText(raw["省份"]), text(raw["Leading-PI"]) || "未填写", text(raw["组长单位"]) || "未填写",
    integer(raw["中心数"]), integer(raw["总例数"]), enrolled, nullableText(stage), inferStatus(stage),
    summaryParts.join("；"), ownerId, now, now,
  );

  milestoneHeaders.forEach((header, index) => {
    const plannedDate = toPlannedDate(raw[header]);
    if (!plannedDate) return;
    database.db.prepare(`
      INSERT INTO milestones (id, project_id, name, planned_date, actual_date, status, sort_order, owner_id, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, '未开始', ?, ?, 1, ?, ?)
    `).run(randomUUID(), projectId, header, plannedDate, index, ownerId, now, now);
  });

  const goal = text(raw["2026年目标"]);
  if (goal) database.db.prepare(`
    INSERT INTO annual_goals (id, project_id, year, title, status, planned_date, completion_notes, owner_id, version, created_at, updated_at)
    VALUES (?, ?, 2026, ?, '未开始', NULL, '由原始 Excel 导入', ?, 1, ?, ?)
  `).run(randomUUID(), projectId, goal, ownerId, now, now);

  const annualBudgetWan = number(raw["2026年预算（万元）"]);
  if (annualBudgetWan > 0) database.db.prepare(`
    INSERT INTO project_budgets (id, project_id, year, category, budget_amount_cents, spent_amount_cents, notes, owner_id, version, created_at, updated_at)
    VALUES (?, ?, 2026, '年度预算（原表导入）', ?, 0, '原表单位为万元，系统已换算为元', ?, 1, ?, ?)
  `).run(randomUUID(), projectId, Math.round(annualBudgetWan * 10_000 * 100), ownerId, now, now);

  const active = integer(raw["当前在组例数（访视期/随访中例数）"]);
  const followup = integer(raw["当前完成随访例数"]);
  if (enrolled || active || followup) database.db.prepare(`
    INSERT INTO enrollment_snapshots (id, project_id, snapshot_date, enrolled_count, active_count, followup_complete_count, notes, owner_id, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '由原始 Excel 导入', ?, 1, ?, ?)
  `).run(randomUUID(), projectId, now.slice(0, 10), enrolled, active, followup, ownerId, now, now);

  database.db.prepare(`
    INSERT INTO project_import_sources (id, batch_id, project_id, source_row_number, source_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), batchId, projectId, rowNumber, JSON.stringify(raw), now);
  database.db.prepare(`
    INSERT INTO audit_logs (id, action, entity_type, entity_id, user_id, before_json, after_json, created_at)
    VALUES (?, 'IMPORT', 'PROJECT', ?, ?, NULL, ?, ?)
  `).run(randomUUID(), projectId, ownerId, JSON.stringify({ sourceRowNumber: rowNumber, projectCode: text(raw["项目编码"]) }), now);
}

function toScalar(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    const object = value as { result?: unknown; text?: string; richText?: Array<{ text: string }> };
    if (object.result !== undefined) return toScalar(object.result);
    if (object.text !== undefined) return object.text;
    if (object.richText) return object.richText.map((item) => item.text).join("");
  }
  return String(value);
}

function normalizeHeader(value: string | number | boolean | null) {
  return text(value).replace(/\s+/g, "").replace("当前在组例数（访视期/随访中例数）", "当前在组例数（访视期/随访中例数）");
}
function normalizeName(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN"); }
function text(value: unknown) { return value === null || value === undefined ? "" : String(value).trim(); }
function nullableText(value: unknown) { const result = text(value); return result || null; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }
function integer(value: unknown) { return Math.round(number(value)); }
function inferStatus(stage: string) {
  if (/关中心|关闭|完成/.test(stage)) return "已完成";
  if (/入组|随访|启动/.test(stage)) return "进行中";
  return "筹备中";
}
function toPlannedDate(value: unknown) {
  if (!value) return null;
  const stringValue = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) return stringValue;
  const match = stringValue.match(/^(20\d{2})[.\-/年](\d{1,2})(?:月)?$/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return `${match[1]}-${String(month).padStart(2, "0")}-01`;
  }
  if (typeof value === "number" && value >= 2000 && value < 2100) {
    const year = Math.floor(value);
    const month = Math.round((value - year) * 10);
    if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, "0")}-01`;
  }
  return null;
}
