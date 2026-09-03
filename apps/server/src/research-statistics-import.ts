import ExcelJS from "exceljs";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { DatabaseService } from "./database.service";

type ImportOptions = { file: string; commit: boolean };
type RawRecord = Record<string, string | number | boolean | null>;

const sourceSheetName = "IIT研究统计";
const importIdentityName = "历史数据导入";
const milestones = ["方案沟通", "方案定稿", "科学性审查", "伦理审核", "合同签署", "入组"];

export async function importResearchStatistics(database: DatabaseService, options: ImportOptions) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(options.file);
  const sheet = workbook.getWorksheet(sourceSheetName) ?? workbook.worksheets[0];
  if (!sheet) throw new Error("Excel 中没有可读取的工作表");

  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => normalizeHeader(toScalar(value)));
  const required = ["研究题目", "方案编号", "目前进度"];
  const missingHeaders = required.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error(`未识别到研究统计表字段：${missingHeaders.join("、")}`);

  const records: Array<{ rowNumber: number; raw: RawRecord }> = [];
  let inheritedProjectGrade = "";
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: RawRecord = {};
    headers.forEach((header, index) => {
      if (header) raw[header] = toScalar(row.getCell(index + 1).value);
    });
    const projectGrade = text(raw["项目分级"]);
    if (projectGrade) inheritedProjectGrade = projectGrade;
    else if (inheritedProjectGrade) raw["项目分级"] = inheritedProjectGrade;
    if (text(raw["研究题目"]) || text(raw["方案编号"])) records.push({ rowNumber, raw });
  });

  const seen = new Set<string>();
  const preview = records.map(({ rowNumber, raw }) => {
    const sourceCode = text(raw["方案编号"]);
    const name = text(raw["研究题目"]);
    const projectCode = normalizedProjectCode(sourceCode, rowNumber);
    const errors: string[] = [];
    if (!name) errors.push("研究题目为空");
    if (!sourceCode) errors.push("方案编号为空");
    if (projectCode && seen.has(projectCode)) errors.push("文件内项目编号重复");
    if (projectCode) seen.add(projectCode);
    const existing = projectCode ? database.db.prepare("SELECT id FROM projects WHERE project_code = ? AND deleted_at IS NULL").get(projectCode) : null;
    if (existing) errors.push("系统中项目编号已存在");
    return { rowNumber, projectCode, sourceCode, name, errors, raw };
  });
  const valid = preview.filter((item) => item.errors.length === 0);
  const invalid = preview.filter((item) => item.errors.length > 0);

  if (options.commit && valid.length) {
    const owner = ensureImportIdentity(database);
    const batchId = randomUUID();
    const now = new Date().toISOString();
    const sourceSha256 = createHash("sha256").update(readFileSync(options.file)).digest("hex");
    database.transaction(() => {
      database.db.prepare(`
        INSERT INTO import_batches (id, source_file, source_sha256, sheet_name, owner_id, imported_count, skipped_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(batchId, basename(options.file), sourceSha256, sheet.name, owner.id, valid.length, invalid.length, now);
      for (const item of valid) insertRecord(database, item.raw, item.rowNumber, item.projectCode, batchId, owner.id, now);
    });
  }

  return {
    mode: options.commit ? "commit" : "dry-run",
    sheet: sheet.name,
    totalRows: preview.length,
    validRows: valid.length,
    skippedRows: invalid.length,
    publicEditable: true,
    errors: invalid.map(({ rowNumber, projectCode, sourceCode, name, errors }) => ({ rowNumber, projectCode, sourceCode, name, errors })),
    mappedColumns: headers.filter(Boolean),
  };
}

function ensureImportIdentity(database: DatabaseService) {
  const normalized = importIdentityName.toLocaleLowerCase("zh-CN");
  const existing = database.db.prepare(`SELECT id FROM users WHERE display_name_normalized = ?`).get(normalized) as { id: string } | undefined;
  if (existing) return existing;
  const id = randomUUID();
  const now = new Date().toISOString();
  database.db.prepare(`
    INSERT INTO users (id, display_name, display_name_normalized, status, last_login_at, created_at, updated_at)
    VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)
  `).run(id, importIdentityName, normalized, now, now, now);
  return { id };
}

function insertRecord(database: DatabaseService, raw: RawRecord, rowNumber: number, projectCode: string, batchId: string, ownerId: string, now: string) {
  const projectId = randomUUID();
  const projectGrade = text(raw["项目分级"]) || text(raw["研究分级"]) || "未分级";
  const stage = text(raw["目前进度"]);
  const summary = compact([
    text(raw["研究方向"]) && `研究方向：${text(raw["研究方向"])}`,
    text(raw["研究分级"]) && `研究分级：${text(raw["研究分级"])}`,
    text(raw["卫健委系统备案号"]) && `卫健委系统备案号：${text(raw["卫健委系统备案号"])}`,
    text(raw["问题反馈"]) && `当前问题/反馈：${text(raw["问题反馈"])}`,
    text(raw["是否配CRC"]) && `CRC：${text(raw["是否配CRC"])}`,
    text(raw["是否配EDC"]) && `EDC：${text(raw["是否配EDC"])}`,
    text(raw["赠药政策"]) && `赠药政策：${text(raw["赠药政策"])}`,
    text(raw["方案编号"]) === "NA" && "原方案编号：NA；系统已生成历史项目编号。",
  ]).join("\n");

  database.db.prepare(`
    INSERT INTO projects (
      id, project_code, name, short_name, responsible_person, grade, disease_type,
      region, province, leading_pi, lead_institution, planned_center_count,
      planned_enrollment, enrolled_count, current_stage, status, summary,
      owner_id, is_public_editable, version, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(
    projectId, projectCode, text(raw["研究题目"]), text(raw["负责人"]) || text(raw["医学部负责人"]) || "待确认", projectGrade,
    text(raw["疾病"]) || "未填写", nullableText(raw["区域"]), text(raw["主要研究者"]) || "待确认",
    text(raw["牵头单位"]) || "待确认", integer(raw["中心数"]), integer(raw["样本量"]), integer(raw["已入组"]),
    nullableText(stage), inferStatus(stage), nullableText(summary), ownerId, now, now,
  );

  seedMilestones(database, projectId, ownerId, now);
  const totalBudgetWan = number(raw["项目总预算"]);
  if (totalBudgetWan > 0) database.db.prepare(`
    INSERT INTO project_budget_overviews (project_id, total_budget_cents, medical_budget_cents, sales_budget_cents, sales_allocated_budget_cents, owner_id, version, created_at, updated_at)
    VALUES (?, ?, 0, 0, 0, ?, 1, ?, ?)
  `).run(projectId, wanToCents(totalBudgetWan), ownerId, now, now);
  const annualBudgetWan = number(raw["2026年预算"]);
  if (annualBudgetWan > 0) database.db.prepare(`
    INSERT INTO project_budgets (id, project_id, year, category, budget_amount_cents, spent_amount_cents, notes, owner_id, version, created_at, updated_at)
    VALUES (?, ?, 2026, '年度预算', ?, 0, '由研究统计表导入，原表单位按万元处理。', ?, 1, ?, ?)
  `).run(randomUUID(), projectId, wanToCents(annualBudgetWan), ownerId, now, now);

  database.db.prepare(`
    INSERT INTO project_import_sources (id, batch_id, project_id, source_row_number, source_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), batchId, projectId, rowNumber, JSON.stringify(raw), now);
  database.db.prepare(`
    INSERT INTO audit_logs (id, action, entity_type, entity_id, user_id, before_json, after_json, created_at)
    VALUES (?, 'IMPORT', 'PROJECT', ?, ?, NULL, ?, ?)
  `).run(randomUUID(), projectId, ownerId, JSON.stringify({ sourceRowNumber: rowNumber, projectCode, publicEditable: true }), now);
}

function seedMilestones(database: DatabaseService, projectId: string, ownerId: string, now: string) {
  const templates = database.db.prepare(`
    SELECT template_key AS templateKey, name, sort_order AS sortOrder
    FROM milestones WHERE project_id = ? AND template_key IS NOT NULL
    ORDER BY sort_order LIMIT 12
  `).all(projectId) as Array<{ templateKey: string; name: string; sortOrder: number }>;
  if (templates.length) return;
  const fallback = [
    ["protocol-finalized", "研究方案定稿时间"], ["scientific-review-approved", "科学性审查/立项通过时间"],
    ["ethics-approval", "伦理批件获取时间"], ["contract-signed", "合同签署时间"],
    ["study-started", "研究启动时间"], ["first-subject-enrolled", "首例入组时间"],
    ["enrollment-target", "入组完成计划时间"], ["followup-completed", "随访完成时间"],
    ["data-cleaning-completed", "数据清理完成时间"], ["statistical-analysis-completed", "统计分析完成时间"],
    ["manuscript-completed", "文章撰写完成时间"], ["center-closed", "中心关闭时间"],
  ];
  const insert = database.db.prepare(`
    INSERT INTO milestones (id, project_id, name, planned_date, actual_date, status, sort_order, owner_id, version, created_at, updated_at, template_key)
    VALUES (?, ?, ?, NULL, NULL, '未开始', ?, ?, 1, ?, ?, ?)
  `);
  fallback.forEach(([templateKey, name], index) => insert.run(randomUUID(), projectId, name, (index + 1) * 10, ownerId, now, now, templateKey));
}

function normalizedProjectCode(sourceCode: string, rowNumber: number) {
  return sourceCode && sourceCode.toUpperCase() !== "NA" ? sourceCode : sourceCode ? `IIT-LEGACY-260820-R${rowNumber}` : "";
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
  const header = text(value).replace(/\s+/g, "");
  if (header.includes("方案目前进度")) return "目前进度";
  return header;
}
function text(value: unknown) { return value === null || value === undefined ? "" : String(value).trim(); }
function nullableText(value: unknown) { const result = text(value); return result || null; }
function compact(values: Array<string | false>) { return values.filter((value): value is string => Boolean(value)); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }
function integer(value: unknown) { return Math.round(number(value)); }
function wanToCents(value: number) { return Math.round(value * 1_000_000); }
function inferStatus(stage: string) { return /入组|随访|启动/.test(stage) ? "进行中" : "筹备中"; }
