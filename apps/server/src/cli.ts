import "./env";
import argon2 from "argon2";
import { backup } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { DatabaseService } from "./database.service";
import { importExcel } from "./excel-import";
import { importResearchStatistics } from "./research-statistics-import";
import { milestoneStatus, projectMilestoneTemplates } from "./work-items/milestone-template";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  if (command === "password:hash") {
    const password = process.env.NEW_TEAM_ACCESS_PASSWORD;
    if (!password || password.length < 8) throw new Error("请先设置 NEW_TEAM_ACCESS_PASSWORD，且至少 8 个字符");
    console.log(await argon2.hash(password, { type: argon2.argon2id }));
    return;
  }

  const database = new DatabaseService();
  database.onModuleInit();
  try {
    if (command === "users:list") {
      console.table(database.db.prepare(`SELECT display_name AS name, status, last_login_at AS lastLoginAt, created_at AS createdAt FROM users ORDER BY created_at`).all());
      return;
    }
    if (command === "user:disable" || command === "user:enable") {
      const name = option("--name");
      if (!name) throw new Error("缺少 --name 姓名");
      const status = command === "user:disable" ? "DISABLED" : "ACTIVE";
      const normalized = normalizeName(name);
      const row = database.db.prepare("SELECT id FROM users WHERE display_name_normalized = ?").get(normalized) as { id: string } | undefined;
      if (!row) throw new Error(`未找到用户“${name}”`);
      database.transaction(() => {
        database.db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), row.id);
        if (status === "DISABLED") database.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
      });
      console.log(`${name}: ${status}`);
      return;
    }
    if (command === "recovery-code") {
      const name = option("--name");
      if (!name) throw new Error("缺少 --name 姓名");
      const user = database.db.prepare("SELECT id, status FROM users WHERE display_name_normalized = ?").get(normalizeName(name)) as { id: string; status: string } | undefined;
      if (!user || user.status !== "ACTIVE") throw new Error(`未找到可恢复的用户“${name}”`);
      const code = randomBytes(6).toString("base64url").toUpperCase();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60_000);
      database.db.prepare(`
        INSERT INTO identity_recovery_codes (id, code_hash, user_id, expires_at, used_at, created_at)
        VALUES (?, ?, ?, ?, NULL, ?)
      `).run(randomUUID(), createHash("sha256").update(code).digest("hex"), user.id, expiresAt.toISOString(), now.toISOString());
      console.log(`恢复码：${code}`);
      console.log(`有效期至：${expiresAt.toLocaleString("zh-CN", { hour12: false })}`);
      return;
    }
    if (command === "excel:import") {
      const file = option("--file");
      const ownerName = option("--owner-name");
      if (!file || !ownerName) throw new Error("用法：excel:import --file <xlsx> --owner-name <系统姓名> [--commit]");
      const result = await importExcel(database, { file: resolve(file), ownerName, commit: process.argv.includes("--commit") });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "statistics:import") {
      const file = option("--file");
      if (!file) throw new Error("用法：statistics:import --file <xlsx> [--commit]");
      const result = await importResearchStatistics(database, { file: resolve(file), commit: process.argv.includes("--commit") });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "backup:create") {
      const output = option("--output");
      if (!output) throw new Error("缺少 --output 备份目录");
      const base = isAbsolute(output) ? output : resolve(process.cwd(), output);
      mkdirSync(base, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const target = resolve(base, `iit-pm-backup-${stamp}`);
      if (existsSync(target)) throw new Error(`备份目标已存在：${target}`);
      mkdirSync(target, { recursive: false });
      await backup(database.db, resolve(target, "database.sqlite"));
      const configuredAttachments = process.env.ATTACHMENT_PATH ?? "./data/attachments";
      const attachments = isAbsolute(configuredAttachments) ? configuredAttachments : resolve(process.cwd(), configuredAttachments);
      if (existsSync(attachments)) cpSync(attachments, resolve(target, "attachments"), { recursive: true, errorOnExist: true });
      console.log(`备份完成：${target}`);
      return;
    }
    if (command === "projects:clear") {
      const rows = database.db.prepare(`
        SELECT id, project_code AS projectCode, name, version
        FROM projects WHERE deleted_at IS NULL ORDER BY project_code
      `).all() as Array<{ id: string; projectCode: string; name: string; version: number }>;
      const commit = process.argv.includes("--commit");
      if (!commit) {
        console.log(JSON.stringify({ mode: "dry-run", activeProjects: rows.length, projects: rows }, null, 2));
        return;
      }
      const operatorName = option("--operator-name");
      if (!operatorName) throw new Error("正式清空前必须提供 --operator-name <系统姓名>");
      const operator = database.db.prepare(`
        SELECT id FROM users WHERE display_name_normalized = ? AND status = 'ACTIVE'
      `).get(normalizeName(operatorName)) as { id: string } | undefined;
      if (!operator) throw new Error(`未找到可用操作人“${operatorName}”`);
      const now = new Date().toISOString();
      database.transaction(() => {
        const update = database.db.prepare(`
          UPDATE projects SET project_code = ?, deleted_at = ?, updated_at = ?, version = version + 1
          WHERE id = ? AND version = ? AND deleted_at IS NULL
        `);
        const audit = database.db.prepare(`
          INSERT INTO audit_logs (id, action, entity_type, entity_id, user_id, before_json, after_json, created_at)
          VALUES (?, 'DELETE', 'PROJECT', ?, ?, ?, ?, ?)
        `);
        for (const row of rows) {
          const deletedCode = `${row.projectCode}__deleted__${row.id}`;
          const result = update.run(deletedCode, now, now, row.id, row.version);
          if (Number(result.changes) !== 1) throw new Error(`项目在清理期间发生变化：${row.projectCode}`);
          audit.run(randomUUID(), row.id, operator.id, JSON.stringify(row), JSON.stringify({ deletedAt: now, recoverable: true, reason: "replace-from-statistics-workbook" }), now);
        }
      });
      console.log(JSON.stringify({ mode: "commit", deletedProjects: rows.length, recoverable: true, deletedAt: now }, null, 2));
      return;
    }
    if (command === "demo:seed-milestones") {
      if (process.env.NODE_ENV === "production") throw new Error("演示数据命令不能在生产环境执行");
      const existing = database.db.prepare("SELECT id FROM projects WHERE project_code = ? AND deleted_at IS NULL").get("DEMO-IIT-2026-001");
      if (existing) {
        console.log("演示项目已存在：DEMO-IIT-2026-001");
        return;
      }
      const owner = database.db.prepare("SELECT id FROM users WHERE status = 'ACTIVE' ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
      if (!owner) throw new Error("请先注册并登录一个本地账号，再创建演示项目");
      const now = new Date().toISOString();
      const projectId = randomUUID();
      const dates = [
        ["2026-01-15", "2026-01-18"], ["2026-02-10", "2026-02-12"], ["2026-03-05", "2026-03-20"],
        ["2026-03-28", "2026-04-02"], ["2026-04-15", "2026-04-15"], ["2026-05-20", "2026-05-27"],
        ["2026-09-30", null], ["2027-01-31", null], ["2027-02-28", null], ["2027-03-20", null],
        ["2027-04-15", null], ["2027-05-15", null],
      ] as const;
      database.transaction(() => {
        database.db.prepare(`
          INSERT INTO projects (
            id, project_code, name, short_name, responsible_person, grade, disease_type,
            region, province, leading_pi, lead_institution, planned_center_count,
            planned_enrollment, enrolled_count, current_stage, status, summary,
            owner_id, is_public_editable, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
        `).run(
          projectId, "DEMO-IIT-2026-001", "【演示】IIT 项目全流程测试", "甘特图与汇报演示", "项目经理 A", "A", "IgA 肾病",
          "东区", "上海", "李明（演示）", "示例大学附属医院", 8, 120, 38, "入组阶段", "进行中",
          "本项目为功能展示样例，用于测试固定里程碑、计划与实际日期、甘特图、目标预算和本期汇报；不代表真实临床研究。", owner.id, now, now,
        );
        const insert = database.db.prepare(`
          INSERT INTO milestones (
            id, project_id, name, planned_date, actual_date, status, sort_order,
            owner_id, version, created_at, updated_at, template_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `);
        projectMilestoneTemplates.forEach((template, index) => {
          const [plannedDate, actualDate] = dates[index];
          insert.run(randomUUID(), projectId, template.name, plannedDate, actualDate, milestoneStatus(plannedDate, actualDate), template.sortOrder, owner.id, now, now, template.key);
        });
      });
      console.log("已创建本地演示项目：DEMO-IIT-2026-001");
      return;
    }
    if (command === "demo:seed-planning") {
      if (process.env.NODE_ENV === "production") throw new Error("演示数据命令不能在生产环境执行");
      const project = database.db.prepare("SELECT id, owner_id AS ownerId FROM projects WHERE project_code = ? AND deleted_at IS NULL").get("DEMO-IIT-2026-001") as { id: string; ownerId: string } | undefined;
      if (!project) throw new Error("请先执行 demo:seed-milestones 创建演示项目");
      const now = new Date().toISOString();
      database.transaction(() => {
        database.db.prepare(`
          INSERT INTO project_budget_overviews (project_id, total_budget_cents, medical_budget_cents, sales_budget_cents, sales_allocated_budget_cents, owner_id, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET total_budget_cents=excluded.total_budget_cents, medical_budget_cents=excluded.medical_budget_cents, sales_budget_cents=excluded.sales_budget_cents, sales_allocated_budget_cents=excluded.sales_allocated_budget_cents, version=project_budget_overviews.version+1, updated_at=excluded.updated_at
        `).run(project.id, 2_800_000_000, 1_700_000_000, 1_100_000_000, 560_000_000, project.ownerId, now, now);
        database.db.prepare(`
          INSERT INTO annual_project_targets (id, project_id, year, target_enrollment, enrolled_count, active_count, followup_complete_count, dropout_count, owner_id, version, created_at, updated_at)
          VALUES (?, ?, 2026, 60, 38, 31, 12, 3, ?, 1, ?, ?)
          ON CONFLICT(project_id, year) DO UPDATE SET target_enrollment=excluded.target_enrollment, enrolled_count=excluded.enrolled_count, active_count=excluded.active_count, followup_complete_count=excluded.followup_complete_count, dropout_count=excluded.dropout_count, version=annual_project_targets.version+1, updated_at=excluded.updated_at
        `).run(randomUUID(), project.id, project.ownerId, now, now);
        database.db.prepare(`
          INSERT INTO annual_project_targets (id, project_id, year, target_enrollment, enrolled_count, active_count, followup_complete_count, dropout_count, owner_id, version, created_at, updated_at)
          VALUES (?, ?, 2027, 60, 0, 0, 0, 0, ?, 1, ?, ?)
          ON CONFLICT(project_id, year) DO NOTHING
        `).run(randomUUID(), project.id, project.ownerId, now, now);
        const annual = database.db.prepare("SELECT id FROM project_budgets WHERE project_id=? AND year=2026 AND category='年度预算' AND deleted_at IS NULL").get(project.id) as { id: string } | undefined;
        if (annual) database.db.prepare("UPDATE project_budgets SET budget_amount_cents=?, spent_amount_cents=0, updated_at=?, version=version+1 WHERE id=?").run(1_400_000_000, now, annual.id);
        else database.db.prepare("INSERT INTO project_budgets (id, project_id, year, category, budget_amount_cents, spent_amount_cents, notes, owner_id, version, created_at, updated_at) VALUES (?, ?, 2026, '年度预算', ?, 0, '本地演示数据', ?, 1, ?, ?)").run(randomUUID(), project.id, 1_400_000_000, project.ownerId, now, now);
        database.db.prepare("INSERT INTO project_budgets (id, project_id, year, category, budget_amount_cents, spent_amount_cents, notes, owner_id, version, created_at, updated_at) SELECT ?, ?, 2027, '年度预算', ?, 0, '本地演示数据', ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM project_budgets WHERE project_id=? AND year=2027 AND category='年度预算' AND deleted_at IS NULL)").run(randomUUID(), project.id, 1_400_000_000, project.ownerId, now, now, project.id);
        database.db.prepare(`
          INSERT INTO project_reports (id, project_id, completed_work, risks_and_issues, next_plan, support_needed, owner_id, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET completed_work=excluded.completed_work, risks_and_issues=excluded.risks_and_issues, next_plan=excluded.next_plan, support_needed=excluded.support_needed, version=project_reports.version+1, updated_at=excluded.updated_at
        `).run(
          randomUUID(), project.id,
          "已完成方案定稿、科学性审查、伦理审批、合同签署、研究启动及首例入组。",
          "当前入组速度略低于月度目标，需要加强中心启动后的筛选跟进。",
          "未来一个月完成新增中心启动，并推动累计入组达到 45 例。",
          "需要医学部协助组织一次区域研究者沟通会。",
          project.ownerId, now, now,
        );
      });
      console.log("已补充演示项目的年度目标与跨年度预算数据");
      return;
    }
    throw new Error("可用命令：users:list | user:disable | user:enable | recovery-code | password:hash | excel:import | statistics:import | backup:create | projects:clear | demo:seed-milestones | demo:seed-planning");
  } finally {
    database.onModuleDestroy();
  }
}

function normalizeName(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN"); }

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
