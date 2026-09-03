import { readFile } from "node:fs/promises";

const origin = process.env.SHOWCASE_ORIGIN ?? "http://127.0.0.1:3000";
const displayName = process.env.SHOWCASE_USER ?? "演示管理员";

async function localPassword() {
  if (process.env.SHOWCASE_PASSWORD) return process.env.SHOWCASE_PASSWORD;
  const content = await readFile(new URL("../.env", import.meta.url), "utf8").catch(() => "");
  return content.match(/^TEAM_ACCESS_PASSWORD=(.+)$/m)?.[1]?.trim();
}

const password = await localPassword();
if (!password) throw new Error("请先在 .env 中配置 TEAM_ACCESS_PASSWORD，或设置 SHOWCASE_PASSWORD");

let cookie = "";
async function request(path, init = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${response.status} ${JSON.stringify(body)}`);
  return { response, body };
}

const login = await request("/auth/enter", {
  method: "POST",
  body: JSON.stringify({ displayName, password }),
});
cookie = (login.response.headers.getSetCookie?.()[0] ?? login.response.headers.get("set-cookie") ?? "").split(";")[0];

const existing = await request("/projects");
if (existing.body.some((project) => String(project.projectCode).startsWith("DEMO-IIT-"))) {
  console.log("已存在 DEMO-IIT 演示项目，本次未重复创建。");
  process.exit(0);
}

const inputs = [
  {
    projectCode: "DEMO-IIT-2026-001",
    name: "IgA 肾病真实世界研究（演示）",
    shortName: "IgA-RWS",
    responsiblePerson: "项目经理 A",
    grade: "A",
    diseaseType: "IgA 肾病",
    region: "东区",
    province: "示例省",
    leadingPi: "演示 PI A",
    leadInstitution: "示例研究中心 A",
    plannedCenterCount: 8,
    plannedEnrollment: 120,
    enrolledCount: 46,
    currentStage: "入组与随访",
    status: "进行中",
    summary: "用于展示固定里程碑、目标预算、甘特图和多人协作能力的虚构项目。",
  },
  {
    projectCode: "DEMO-IIT-2026-002",
    name: "难治性膜性肾病队列研究（演示）",
    shortName: "MN-Cohort",
    responsiblePerson: "项目经理 B",
    grade: "B",
    diseaseType: "膜性肾病",
    region: "北区",
    province: "样例省",
    leadingPi: "演示 PI B",
    leadInstitution: "示例研究中心 B",
    plannedCenterCount: 5,
    plannedEnrollment: 80,
    enrolledCount: 12,
    currentStage: "伦理与合同",
    status: "进行中",
    summary: "用于展示延期识别和关键节点提醒的虚构项目。",
  },
];

const projects = [];
for (const input of inputs) {
  projects.push((await request("/projects", { method: "POST", body: JSON.stringify(input) })).body);
}

const milestoneDates = [
  [
    ["2026-01-15", "2026-01-18"], ["2026-02-10", "2026-02-12"], ["2026-03-05", "2026-03-20"],
    ["2026-03-28", "2026-04-02"], ["2026-04-15", "2026-04-15"], ["2026-05-20", "2026-05-27"],
    ["2026-09-30", null], ["2027-01-31", null], ["2027-02-28", null], ["2027-03-20", null],
    ["2027-04-15", null], ["2027-05-15", null],
  ],
  [
    ["2026-04-20", "2026-04-18"], ["2026-05-20", "2026-05-25"], ["2026-06-30", "2026-07-08"],
    ["2026-08-20", null], ["2026-09-30", null], ["2026-11-15", null], ["2027-03-31", null],
    ["2027-06-30", null], ["2027-07-31", null], ["2027-08-31", null], ["2027-10-31", null], ["2027-12-15", null],
  ],
];

for (let projectIndex = 0; projectIndex < projects.length; projectIndex += 1) {
  const milestones = (await request(`/projects/${projects[projectIndex].id}/milestones`)).body;
  for (let index = 0; index < milestones.length; index += 1) {
    const [plannedDate, actualDate] = milestoneDates[projectIndex][index];
    await request(`/milestones/${milestones[index].id}`, {
      method: "PATCH",
      body: JSON.stringify({ version: milestones[index].version, plannedDate, actualDate }),
    });
  }
}

await request(`/projects/${projects[0].id}/annual-targets`, {
  method: "POST",
  body: JSON.stringify({ year: 2026, targetEnrollment: 60, enrolledCount: 46, activeCount: 38, followupCompleteCount: 18, dropoutCount: 3 }),
});
await request(`/projects/${projects[0].id}/budget-overview`, {
  method: "PATCH",
  body: JSON.stringify({ totalBudgetWan: 280, medicalBudgetWan: 170, salesBudgetWan: 110, salesAllocatedBudgetWan: 56 }),
});
await request(`/projects/${projects[0].id}/budgets`, {
  method: "POST",
  body: JSON.stringify({ year: 2026, category: "年度执行预算", budgetAmount: 120, spentAmount: 62, notes: "虚构演示数据" }),
});
await request(`/projects/${projects[0].id}/tasks`, {
  method: "POST",
  body: JSON.stringify({ title: "完成阶段性入组复盘", assigneeName: displayName, status: "进行中", priority: "高", phaseName: "入组与随访", startDate: "2026-08-25", dueDate: "2026-09-12", progress: 65, notes: "虚构演示事项" }),
});
await request(`/projects/${projects[0].id}/report`, {
  method: "PUT",
  body: JSON.stringify({
    completedWork: "完成首批中心启动及阶段性入组复盘，累计入组 46 例。",
    risksAndIssues: "两家演示中心入组速度低于计划，需进一步确认筛选路径。",
    nextPlan: "完成重点中心沟通，并在下一节点前完成入组节奏校准。",
    supportNeeded: "需要医学与区域团队共同协调演示中心资源。",
  }),
});

console.log(`已创建 ${projects.length} 个完全虚构的 GitHub 展示项目。`);
