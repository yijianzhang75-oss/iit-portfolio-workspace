import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer, Form, Input, InputNumber, Modal, Select, message } from "antd";
import { io } from "socket.io-client";
import { api } from "./api";
import type { AnnualProjectTarget, EnrollmentSnapshot, Milestone, Project, ProjectBudget, ProjectBudgetOverview, ProjectReport, ProjectRisk, ResearchCenter, Task, User } from "./types";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { ProjectResearchSummary } from "./ProjectResearchPanel";
import { ResearchStatisticsBoard } from "./ResearchStatisticsBoard";
import { dateDifferenceLabel, getProjectHealth, milestoneRuntimeStatus, projectStage, today } from "./project-progress";

type View = "overview" | "research" | "project" | "gantt" | "tasks";
type WorkspaceData = {
  tasks: Task[];
  milestones: Milestone[];
  risks: ProjectRisk[];
  budgets: ProjectBudget[];
  targets: AnnualProjectTarget[];
  budgetOverviews: ProjectBudgetOverview[];
  centers: ResearchCenter[];
  snapshots: EnrollmentSnapshot[];
};

const emptyWorkspace: WorkspaceData = { tasks: [], milestones: [], risks: [], budgets: [], targets: [], budgetOverviews: [], centers: [], snapshots: [] };
const dateLabel = (value?: string | null) => value ? value.replace(/(\d{4})-(\d{2})-\d{2}/, "$1.$2") : "待排期";
const percent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
let activeUser: User | undefined;

function healthOf(project: Project, data: WorkspaceData) {
  const tasks = data.tasks.filter((item) => item.projectId === project.id);
  const milestones = data.milestones.filter((item) => item.projectId === project.id);
  return getProjectHealth(project, milestones, tasks).value;
}

function HealthTag({ value }: { value: string }) {
  const tone = value === "已延期" ? "red" : value === "需关注" ? "amber" : value === "待完善" ? "blue" : "green";
  return <span className={`demo-tag ${tone}`}>{value}</span>;
}

type WorkspaceSnapshot = { projects: Project[]; data: WorkspaceData };

function useWorkspaceSnapshot() {
  return useQuery({
    queryKey: ["workspace-snapshot"],
    queryFn: () => api<WorkspaceSnapshot>("/workspace/snapshot"),
    // Socket.IO 负责即时刷新；轻量轮询作为代理或防火墙阻断 WebSocket 时的兜底。
    refetchInterval: 5_000,
    refetchOnWindowFocus: "always",
  });
}

function ProjectEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => api<Project>("/projects", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => { message.success("项目已创建"); await client.invalidateQueries({ queryKey: ["workspace-snapshot"] }); onClose(); },
    onError: (error) => message.error((error as Error).message),
  });
  return <Modal open={open} title="创建项目" okText="创建项目" cancelText="取消" onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate({ ...values, status: "筹备中", plannedCenterCount: values.plannedCenterCount ?? 0, plannedEnrollment: values.plannedEnrollment ?? 0, enrolledCount: 0 })}>
      <Form.Item name="projectCode" label="项目编码" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="name" label="项目名称" rules={[{ required: true }]}><Input /></Form.Item>
      <div className="demo-form-grid"><Form.Item name="responsiblePerson" label="项目负责人" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="grade" label="课题分级" rules={[{ required: true }]}><Select placeholder="请选择分级" options={["S", "A", "B", "C", "D"].map((value) => ({ value, label: value }))} /></Form.Item></div>
      <div className="demo-form-grid"><Form.Item name="diseaseType" label="疾病类型" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="leadingPi" label="Leading-PI" rules={[{ required: true }]}><Input /></Form.Item></div>
      <Form.Item name="leadInstitution" label="组长单位" rules={[{ required: true }]}><Input /></Form.Item>
      <div className="demo-form-grid"><Form.Item name="region" label="区域"><Select allowClear placeholder="请选择区域" options={["东区", "西区", "南区", "北区", "中区"].map((value) => ({ value, label: value }))} /></Form.Item><Form.Item name="province" label="省份"><Input placeholder="例如：山东、江苏" /></Form.Item></div>
      <div className="demo-form-grid"><Form.Item name="plannedCenterCount" label="计划中心数"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item><Form.Item name="plannedEnrollment" label="计划总例数"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></div>
    </Form>
  </Modal>;
}

function ReportEditor({ projectId, report, open, onClose }: { projectId: string; report?: ProjectReport; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => api<ProjectReport>(`/projects/${projectId}/report`, { method: "PUT", body: JSON.stringify({ ...values, version: report?.version ?? undefined }) }),
    onSuccess: async () => { message.success("本期汇报已保存"); await Promise.all([client.invalidateQueries({ queryKey: ["report", projectId] }), client.invalidateQueries({ queryKey: ["audit", projectId] })]); onClose(); },
    onError: (error) => message.error((error as Error).message),
  });
  useEffect(() => { if (open) form.setFieldsValue(report); }, [form, open, report]);
  return <Modal open={open} width={720} title="编辑本期汇报" okText="保存汇报" cancelText="取消" onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
      <Form.Item name="completedWork" label="本期完成工作"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="risksAndIssues" label="问题与风险"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="nextPlan" label="下一阶段计划"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="supportNeeded" label="需要协调支持"><Input.TextArea rows={4} /></Form.Item>
    </Form>
  </Modal>;
}

function TaskEditor({ task, projectId, open, onClose }: { task?: Task; projectId: string; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const client = useQueryClient();
  const readOnly = Boolean(task && !task.canEdit);
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => task
      ? api<Task>(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ ...values, version: task.version }) })
      : api<Task>(`/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => { message.success(task ? "事项已更新" : "事项已创建"); await client.invalidateQueries({ queryKey: ["workspace-snapshot"] }); await client.invalidateQueries({ queryKey: ["tasks", projectId] }); onClose(); },
    onError: (error) => message.error((error as Error).message),
  });
  useEffect(() => { if (open) { form.resetFields(); form.setFieldsValue(task ?? { status: "未开始", priority: "中", progress: 0 }); } }, [form, open, task]);
  return <Modal open={open} width={680} title={readOnly ? "查看事项" : task ? "编辑事项" : "新建事项"} okText={readOnly ? "关闭" : "保存"} cancelText="取消" onCancel={onClose} onOk={readOnly ? onClose : () => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" disabled={readOnly} onFinish={(values) => mutation.mutate(values)}>
      <Form.Item name="title" label="事项名称" rules={[{ required: true }]}><Input /></Form.Item>
      <div className="demo-form-grid"><Form.Item name="phaseName" label="所属阶段"><Input placeholder="例如：伦理与合同" /></Form.Item><Form.Item name="assigneeName" label="负责人" rules={[{ required: true }]}><Input /></Form.Item></div>
      <div className="demo-form-grid"><Form.Item name="status" label="状态"><Select options={["未开始", "进行中", "已阻塞", "已完成", "已取消"].map((value) => ({ value }))} /></Form.Item><Form.Item name="priority" label="优先级"><Select options={["低", "中", "高", "紧急"].map((value) => ({ value }))} /></Form.Item></div>
      <div className="demo-form-grid"><Form.Item name="startDate" label="开始日期"><Input type="date" /></Form.Item><Form.Item name="dueDate" label="计划完成日期"><Input type="date" /></Form.Item></div>
      <Form.Item name="progress" label="完成进度"><InputNumber min={0} max={100} addonAfter="%" style={{ width: "100%" }} /></Form.Item>
      <Form.Item name="notes" label="备注"><Input.TextArea rows={3} /></Form.Item>
    </Form>
  </Modal>;
}

function LegacyOverview({ projects, data, user, onProject, onCreate }: { projects: Project[]; data: WorkspaceData; user: User; onProject: (project: Project) => void; onCreate: () => void }) {
  const [search, setSearch] = useState(""); const [stage, setStage] = useState(""); const [owner, setOwner] = useState(""); const [risk, setRisk] = useState("");
  const health = (project: Project) => healthOf(project, data);
  const filtered = projects.filter((project) => (!search || `${project.name} ${project.projectCode}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && (!stage || project.currentStage === stage) && (!owner || project.responsiblePerson === owner) && (!risk || health(project) === risk));
  const enrolled = projects.reduce((sum, item) => sum + item.enrolledCount, 0); const planned = projects.reduce((sum, item) => sum + item.plannedEnrollment, 0);
  const upcoming = data.milestones.filter((item) => item.plannedDate && item.plannedDate >= today() && item.plannedDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) && item.status !== "已完成");
  const attention = projects.filter((project) => ["关注", "高风险"].includes(health(project))).length;
  const annualBudget = data.budgets.filter((item) => item.year === new Date().getFullYear()).reduce((sum, item) => sum + item.budgetAmount, 0);
  const stages = Array.from(new Set(projects.map((item) => item.currentStage).filter(Boolean))) as string[];
  const owners = Array.from(new Set(projects.map((item) => item.responsiblePerson)));
  const reminders = [
    ...upcoming.slice(0, 3).map((item) => ({ title: `${item.name} 即将到期`, code: projects.find((project) => project.id === item.projectId)?.projectCode ?? "", date: item.plannedDate! })),
    ...data.tasks.filter((item) => item.dueDate && item.dueDate < today() && !["已完成", "已取消"].includes(item.status)).slice(0, 2).map((item) => ({ title: `${item.title} 已延期`, code: projects.find((project) => project.id === item.projectId)?.projectCode ?? "", date: "需关注" })),
  ].slice(0, 4);
  return <>
    <div className="demo-page-head"><div><h1>项目组合总览</h1><p>快速查看全部 IIT 项目的进展、入组、关键节点与风险。</p></div><div className="demo-head-actions"><button className="demo-btn" onClick={() => window.print()}>打印 / PDF</button><button className="demo-btn primary" onClick={onCreate}>＋ 创建项目</button></div></div>
    <div className="demo-kpi-grid">
      <Kpi label="项目总数" value={projects.length} suffix="个" icon="项" foot={`我创建 ${projects.filter((item) => item.canEdit).length} 个`} />
      <Kpi label="进行中" value={projects.filter((item) => item.status === "进行中").length} suffix="个" icon="▶" foot={`占全部项目 ${projects.length ? Math.round(projects.filter((item) => item.status === "进行中").length / projects.length * 100) : 0}%`} />
      <Kpi label="总体入组" value={enrolled} suffix={`/ ${planned}例`} icon="人" foot={`${planned ? (enrolled / planned * 100).toFixed(1) : 0}% 总体完成率`} />
      <Kpi label="近期里程碑" value={upcoming.length} suffix="项" icon="旗" foot="未来30天内待完成" />
      <Kpi label="需关注" value={attention} suffix="项" icon="!" foot="风险、阻塞或延期项目" tone="warn" />
      <Kpi label="年度预算" value={(annualBudget / 10000).toFixed(1)} suffix="万元" icon="¥" foot="按当前年度预算记录汇总" />
    </div>
    <div className="demo-grid-12">
      <section className="demo-card span-5"><div className="demo-card-head"><div><h2>项目阶段分布</h2><p>按当前主要研究阶段统计</p></div><span className="demo-tag green">{projects.length}个项目</span></div><div className="demo-card-body demo-pipeline">{stages.length ? stages.map((item) => { const count = projects.filter((project) => project.currentStage === item).length; return <div className="demo-pipeline-row" key={item}><strong>{item}</strong><div className="demo-bar-track"><i style={{ width: `${projects.length ? count / projects.length * 100 : 0}%` }} /></div><span>{count}</span></div>; }) : <div className="demo-empty">项目填写当前阶段后将在此汇总</div>}</div></section>
      <section className="demo-card span-3"><div className="demo-card-head"><div><h2>项目状态</h2><p>组合健康度</p></div></div><div className="demo-card-body demo-health-list">{["正常", "提醒", "关注", "高风险"].map((item) => <div key={item}><HealthTag value={item} /><strong>{projects.filter((project) => health(project) === item).length}</strong></div>)}</div></section>
      <section className="demo-card span-4"><div className="demo-card-head"><div><h2>近期提醒</h2><p>里程碑、延期与入组风险</p></div></div><div className="demo-card-body demo-mini-list">{reminders.length ? reminders.map((item, index) => <div className="demo-mini-item" key={`${item.title}-${index}`}><i className={index > 1 ? "danger" : ""} /><div><strong>{item.title}</strong><small>{item.code}</small></div><time>{item.date}</time></div>) : <div className="demo-empty">当前没有近期提醒</div>}</div></section>
    </div>
    <section className="demo-card demo-project-table"><div className="demo-toolbar"><div className="demo-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索项目名称或编码" /><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="">全部阶段</option>{stages.map((item) => <option key={item}>{item}</option>)}</select><select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">全部负责人</option>{owners.map((item) => <option key={item}>{item}</option>)}</select><select value={risk} onChange={(event) => setRisk(event.target.value)}><option value="">全部风险</option>{["正常", "提醒", "关注", "高风险"].map((item) => <option key={item}>{item}</option>)}</select></div><button className="demo-btn small" title="增强版将提供Excel导出">⇩ 导出 Excel</button></div>
      <div className="demo-table-wrap"><table><thead><tr><th>项目</th><th>负责人</th><th>分级</th><th>区域</th><th>当前阶段</th><th>中心</th><th>入组</th><th>完成率</th><th>风险</th><th>最近更新</th></tr></thead><tbody>{filtered.map((project) => { const p = project.plannedEnrollment ? percent(project.enrolledCount / project.plannedEnrollment * 100) : 0; return <tr key={project.id} className="demo-clickable" onClick={() => onProject(project)}><td className="demo-project-name"><strong>{project.name}</strong><small>{project.projectCode}</small></td><td>{project.responsiblePerson}</td><td><span className="demo-tag green">{project.grade}</span></td><td>{[project.region, project.province].filter(Boolean).join(" · ") || "—"}</td><td><span className="demo-tag amber">{project.currentStage || "待确认"}</span></td><td>— / {project.plannedCenterCount}</td><td>{project.enrolledCount} / {project.plannedEnrollment}</td><td><div className="demo-progress"><div className="demo-bar-track"><i style={{ width: `${p}%` }} /></div><strong>{p}%</strong></div></td><td><HealthTag value={health(project)} /></td><td>{new Date(project.updatedAt).toLocaleDateString("zh-CN")}</td></tr>; })}</tbody></table>{!filtered.length && <div className="demo-empty">没有符合当前筛选条件的项目</div>}</div><div className="demo-table-foot"><span>显示 {filtered.length} 个项目</span><span>点击任意项目进入汇报总览 →</span></div>
    </section>
  </>;
}

type PortfolioRow = { project: Project; milestones: Milestone[]; tasks: Task[]; risks: ProjectRisk[]; health: ReturnType<typeof getProjectHealth>; stage: string };

function Overview({ projects, data, user, onProject, onCreate }: { projects: Project[]; data: WorkspaceData; user: User; onProject: (project: Project) => void; onCreate: () => void }) {
  const [search, setSearch] = useState(""); const [stageFilter, setStageFilter] = useState(""); const [owner, setOwner] = useState(""); const [healthFilter, setHealthFilter] = useState(""); const [regionFilter, setRegionFilter] = useState(""); const [gradeFilter, setGradeFilter] = useState(""); const [quickFilter, setQuickFilter] = useState<"" | "missing" | "upcoming" | "late" | "recent">("");
  const rows = projects.map((project): PortfolioRow => { const milestones = data.milestones.filter((item) => item.projectId === project.id); const tasks = data.tasks.filter((item) => item.projectId === project.id); const risks = data.risks.filter((item) => item.projectId === project.id && item.status !== "已解决"); return { project, milestones, tasks, risks, health: getProjectHealth(project, milestones, tasks), stage: projectStage(milestones, project.currentStage) }; });
  const matchesQuickFilter = ({ project, milestones }: PortfolioRow) => {
    if (quickFilter === "missing") return milestones.some((item) => !item.plannedDate);
    if (quickFilter === "upcoming") return milestones.some((item) => item.plannedDate && item.plannedDate >= today() && item.plannedDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) && !item.actualDate);
    if (quickFilter === "late") return milestones.some((item) => item.plannedDate && item.plannedDate < today() && !item.actualDate);
    if (quickFilter === "recent") return project.updatedAt.slice(0, 7) === today().slice(0, 7);
    return true;
  };
  const filtered = rows.filter(({ project, stage, health, milestones, tasks, risks }) => (!search || `${project.name} ${project.projectCode}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && (!stageFilter || stage === stageFilter) && (!owner || project.responsiblePerson === owner) && (!healthFilter || health.value === healthFilter) && (!regionFilter || project.region === regionFilter) && (!gradeFilter || project.grade === gradeFilter) && matchesQuickFilter({ project, stage, health, milestones, tasks, risks })).sort((left, right) => {
    const priority: Record<string, number> = { "已延期": 0, "需关注": 1, "待完善": 2, "正常": 3 };
    const priorityDifference = (priority[left.health.value] ?? 4) - (priority[right.health.value] ?? 4);
    if (priorityDifference) return priorityDifference;
    const leftDate = left.milestones.find((item) => milestoneRuntimeStatus(item) !== "已完成")?.plannedDate || "9999-12-31";
    const rightDate = right.milestones.find((item) => milestoneRuntimeStatus(item) !== "已完成")?.plannedDate || "9999-12-31";
    return leftDate.localeCompare(rightDate);
  });
  const stages = Array.from(new Set(rows.map((item) => item.stage))); const owners = Array.from(new Set(projects.map((item) => item.responsiblePerson)));
  const normal = rows.filter((item) => item.health.value === "正常").length; const attention = rows.filter((item) => item.health.value === "需关注").length; const delayed = rows.filter((item) => item.health.value === "已延期").length; const upcomingCount = rows.reduce((sum, item) => sum + item.health.upcoming, 0);
  const attentionItems = rows.flatMap((row) => {
    const overdue = row.milestones.filter((item) => milestoneRuntimeStatus(item) === "已延期").map((item) => ({ project: row.project, title: item.name, detail: `计划 ${item.plannedDate}，尚未填写实际完成日期`, tone: "danger" }));
    const dueSoon = row.milestones.filter((item) => item.plannedDate && item.plannedDate >= today() && item.plannedDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) && !item.actualDate).map((item) => ({ project: row.project, title: item.name, detail: `计划 ${item.plannedDate}，即将到期`, tone: "" }));
    return [...overdue, ...dueSoon];
  }).sort((left, right) => left.tone === "danger" ? -1 : right.tone === "danger" ? 1 : 0).slice(0, 6);
  void user;
  return <>
    <div className="demo-page-head"><div><h1>项目组合驾驶舱</h1><p>优先处理延期、近期到期和信息不完整项目；正常项目保持安静。</p></div><div className="demo-head-actions"><button className="demo-btn" onClick={() => window.print()}>打印 / PDF</button><button className="demo-btn primary" onClick={onCreate}>＋ 创建项目</button></div></div>
    <div className="demo-kpi-grid demo-kpi-grid-focus"><Kpi label="全部项目" value={projects.length} suffix="个" icon="项" foot={`我创建 ${projects.filter((item) => item.canEdit).length} 个`} /><Kpi label="正常项目" value={normal} suffix="个" icon="✓" foot="当前没有延期或高风险" /><Kpi label="需关注" value={attention} suffix="个" icon="!" foot="近期节点、偏差或高风险" tone="warn" /><Kpi label="已延期" value={delayed} suffix="个" icon="!" foot="存在未完成逾期节点" tone="warn" /></div>
    <div className="demo-grid-12"><section className="demo-card span-7"><div className="demo-card-head"><div><h2>优先处理</h2><p>延期在前；其次为未来 30 天内到期的固定里程碑。</p></div><span className="demo-tag amber">{attentionItems.length} 项待关注</span></div><div className="demo-card-body demo-attention-list">{attentionItems.length ? attentionItems.map((item, index) => <button className="demo-attention-item" key={`${item.project.id}-${item.title}-${index}`} onClick={() => onProject(item.project)}><i className={item.tone} /><div><strong>{item.title}</strong><small>{item.project.projectCode} · {item.project.name}</small></div><span>{item.detail}</span><b>查看 →</b></button>) : <div className="demo-empty">当前没有延期或近期到期的里程碑</div>}</div></section><section className="demo-card span-5"><div className="demo-card-head"><div><h2>项目状态分布</h2><p>依据里程碑计划/实际日期自动判断。</p></div></div><div className="demo-card-body demo-health-list">{(["正常", "需关注", "已延期", "待完善"] as const).map((item) => <div key={item}><HealthTag value={item} /><strong>{rows.filter((row) => row.health.value === item).length}</strong></div>)}<div className="demo-status-note"><strong>{upcomingCount}</strong> 个节点将在未来 30 天内到期</div></div></section></div>
    <div className="demo-management-table-title"><div><h2>项目组合管理表</h2><p>集中查看负责人、当前阶段、下一关键节点和需关注原因；点击项目可进入汇报总览。</p></div><span className="demo-tag green">{filtered.length} 个项目</span></div>
    <section className="demo-card demo-project-table"><div className="portfolio-filter-panel"><div className="demo-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索项目名称或编码" /><select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="">全部区域</option>{["东区", "西区", "南区", "北区", "中区"].map((item) => <option key={item}>{item}</option>)}</select><select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}><option value="">全部分级</option>{["S", "A", "B", "C", "D"].map((item) => <option key={item}>{item}</option>)}</select><select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">全部负责人</option>{owners.map((item) => <option key={item}>{item}</option>)}</select><select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">全部阶段</option>{stages.map((item) => <option key={item}>{item}</option>)}</select><select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}><option value="">全部状态</option>{["正常", "需关注", "已延期", "待完善"].map((item) => <option key={item}>{item}</option>)}</select></div><div className="portfolio-filter-chips"><strong>快速查看</strong><button className={quickFilter === "missing" ? "active" : ""} onClick={() => setQuickFilter(quickFilter === "missing" ? "" : "missing")}>待补计划日期</button><button className={quickFilter === "upcoming" ? "active" : ""} onClick={() => setQuickFilter(quickFilter === "upcoming" ? "" : "upcoming")}>近30天到期</button><button className={quickFilter === "late" ? "active" : ""} onClick={() => setQuickFilter(quickFilter === "late" ? "" : "late")}>已延期</button><button className={quickFilter === "recent" ? "active" : ""} onClick={() => setQuickFilter(quickFilter === "recent" ? "" : "recent")}>本月更新</button><button onClick={() => { setSearch(""); setRegionFilter(""); setGradeFilter(""); setOwner(""); setStageFilter(""); setHealthFilter(""); setQuickFilter(""); }}>清空筛选</button><span>{filtered.length} 个项目</span></div></div><div className="demo-table-wrap"><table><thead><tr><th>项目</th><th>区域 / 分级</th><th>负责人</th><th>当前阶段</th><th>里程碑</th><th>下个关键节点</th><th>状态</th><th>最近更新</th></tr></thead><tbody>{filtered.map((row) => { const next = row.milestones.find((item) => milestoneRuntimeStatus(item) !== "已完成"); return <tr key={row.project.id} className="demo-clickable" onClick={() => onProject(row.project)}><td className="demo-project-name"><strong>{row.project.name}</strong><small>{row.project.projectCode}</small></td><td><strong>{row.project.region || "待归类"}</strong><small>{row.project.grade || "待分级"}</small></td><td>{row.project.responsiblePerson}</td><td><span className="demo-tag blue">{row.stage}</span></td><td>{row.milestones.filter((item) => milestoneRuntimeStatus(item) === "已完成").length} / {row.milestones.length || 12}</td><td>{next ? <><strong>{next.name}</strong><small>{next.plannedDate || "待排期"}</small></> : "全部完成"}</td><td><HealthTag value={row.health.value} /><small className="demo-health-reason">{row.health.reason}</small></td><td>{new Date(row.project.updatedAt).toLocaleDateString("zh-CN")}</td></tr>; })}</tbody></table>{!filtered.length && <div className="demo-empty">没有符合当前筛选条件的项目</div>}</div><div className="demo-table-foot"><span>显示 {filtered.length} 个项目</span><span>点击项目进入项目工作台 →</span></div></section>
  </>;
}

function PortfolioRoadmap({ rows, onProject }: { rows: PortfolioRow[]; onProject: (project: Project) => void }) {
  const scheduled = rows.flatMap((row) => row.milestones.filter((item) => item.plannedDate).map((item) => new Date(`${item.plannedDate}T00:00:00`).getTime())); const day = 86_400_000; const min = scheduled.length ? Math.min(...scheduled) - day * 21 : Date.now() - day * 30; const max = scheduled.length ? Math.max(...scheduled) + day * 45 : Date.now() + day * 90; const span = Math.max(max - min, day); const labels = Array.from({ length: 7 }, (_, index) => { const date = new Date(min + span * index / 6); return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`; }); const now = (Date.now() - min) / span * 100; const position = (value: string) => Math.max(0, Math.min(100, (new Date(`${value}T00:00:00`).getTime() - min) / span * 100));
  return <section className="demo-card demo-portfolio-roadmap"><div className="demo-card-head"><div><h2>项目组合路线图</h2><p>圆点为固定里程碑；红色表示延期；竖线表示今天。</p></div><div className="demo-roadmap-legend"><span>● 已完成</span><span>● 待完成</span><span>● 已延期</span></div></div><div className="demo-roadmap-scroll"><div className="demo-roadmap"><div className="demo-roadmap-head"><div>项目 / 当前阶段</div><div>{labels.map((label) => <span key={label}>{label}</span>)}</div></div>{rows.map((row) => { const milestones = row.milestones.filter((item) => item.plannedDate); const first = milestones[0]?.plannedDate; const last = milestones.at(-1)?.plannedDate; return <button className="demo-roadmap-row" key={row.project.id} onClick={() => onProject(row.project)}><div><strong>{row.project.projectCode}</strong><small>{row.project.responsiblePerson} · {row.stage}</small></div><div className="demo-roadmap-track">{now >= 0 && now <= 100 && <i className="demo-roadmap-today" style={{ left: `${now}%` }} />}{first && last && <b className={`demo-roadmap-line ${row.health.value === "已延期" ? "late" : ""}`} style={{ left: `${position(first)}%`, width: `${Math.max(2, position(last) - position(first))}%` }} />} {milestones.map((item) => <em className={`demo-roadmap-marker ${milestoneRuntimeStatus(item) === "已完成" ? "done" : milestoneRuntimeStatus(item) === "已延期" ? "late" : ""}`} key={item.id} style={{ left: `${position(item.plannedDate!)}%` }} title={`${item.name}：${item.plannedDate}${item.actualDate ? `，实际 ${item.actualDate}` : ""}`} />)} {!milestones.length && <span className="demo-roadmap-empty">尚未排期</span>}</div></button>; })}</div></div></section>;
}

function Kpi({ label, value, suffix, icon, foot, tone }: { label: string; value: string | number; suffix: string; icon: string; foot: string; tone?: "warn" }) { return <div className={`demo-kpi ${tone ?? ""}`}><div><span>{label}</span><b>{icon}</b></div><strong>{value}<small>{suffix}</small></strong><p>{foot}</p></div>; }

function LegacyProjectReportView({ project, data, onGantt }: { project: Project; data: WorkspaceData; onGantt: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const onManage = () => setManageOpen(true);
  const reportQuery = useQuery({ queryKey: ["report", project.id], queryFn: () => api<ProjectReport>(`/projects/${project.id}/report`) });
  const milestones = data.milestones.filter((item) => item.projectId === project.id); const tasks = data.tasks.filter((item) => item.projectId === project.id); const centers = data.centers.filter((item) => item.projectId === project.id); const snapshots = data.snapshots.filter((item) => item.projectId === project.id); const budgets = data.budgets.filter((item) => item.projectId === project.id); const risks = data.risks.filter((item) => item.projectId === project.id && item.status !== "已解决");
  const latest = snapshots.at(-1); const enrolled = latest?.enrolledCount ?? project.enrolledCount; const taskProgress = tasks.length ? Math.round(tasks.filter((item) => item.status !== "已取消").reduce((sum, item) => sum + item.progress, 0) / Math.max(tasks.filter((item) => item.status !== "已取消").length, 1)) : 0; const annual = budgets.filter((item) => item.year === new Date().getFullYear()).reduce((sum, item) => sum + item.budgetAmount, 0); const totalBudget = budgets.reduce((sum, item) => sum + item.budgetAmount, 0); const centerEnrolled = centers.reduce((sum, item) => sum + item.enrolledCount, 0);
  const report = reportQuery.data;
  const health = getProjectHealth(project, milestones, tasks); const derivedStage = projectStage(milestones, project.currentStage); const nextMilestone = milestones.find((item) => milestoneRuntimeStatus(item) !== "已完成"); const lateCompleted = milestones.filter((item) => (dateDifferenceLabel(item) || "").startsWith("延期")).length;
  return <>
    <ReportDecisionSummary health={health} stage={derivedStage} nextMilestone={nextMilestone} lateCompleted={lateCompleted} />
    <section className="demo-project-hero"><div className="demo-hero-top"><div><span>{project.projectCode} · 项目汇报总览</span><h1>{project.name}</h1><div className="demo-hero-tags"><i>{project.grade}级课题</i><i>{project.diseaseType}</i><i>当前：{project.currentStage || "待确认"}</i></div></div><div className="demo-hero-actions">{report?.canEdit && <button className="demo-btn" onClick={() => setEditOpen(true)}>编辑本期汇报</button>}<button className="demo-btn" onClick={onManage}>项目资料维护</button><button className="demo-btn" onClick={() => window.print()}>汇报模式 / PDF</button></div></div><div className="demo-hero-meta"><div><small>项目负责人</small><strong>{project.responsiblePerson}</strong></div><div><small>Leading-PI</small><strong>{project.leadingPi}</strong></div><div><small>组长单位</small><strong>{project.leadInstitution}</strong></div><div><small>区域 / 省份</small><strong>{[project.region, project.province].filter(Boolean).join(" / ") || "—"}</strong></div><div><small>计划中心</small><strong>{project.plannedCenterCount}个中心</strong></div><div><small>计划总例数</small><strong>{project.plannedEnrollment}例</strong></div></div></section>
    <div className="demo-metric-strip"><Metric label="项目总体完成率" value={taskProgress} suffix="%" /><Metric label="里程碑完成率" value={milestones.filter((item) => item.status === "已完成").length} suffix={`/ ${milestones.length}`} /><Metric label="入组完成率" value={enrolled} suffix={`/ ${project.plannedEnrollment}例`} /><Metric label="中心启动率" value={centers.filter((item) => !["待启动", "启动中"].includes(item.stage)).length} suffix={`/ ${project.plannedCenterCount}`} /><Metric label={`${new Date().getFullYear()}年度预算`} value={(annual / 10000).toFixed(2)} suffix="万元" /><Metric label="风险 / 延期" value={risks.length} suffix="项提醒" tone="warn" /></div>
    <section className="demo-card"><div className="demo-card-head"><div><h2>固定里程碑路线图</h2><p>计划日期与实际完成日期；状态由系统自动计算</p></div><div className="demo-legend"><span>● 已完成</span><span>● 当前/延期</span><span>● 未开始</span></div></div><div className="demo-card-body demo-milestone-wrap"><div className="demo-milestone-track">{milestones.length ? milestones.map((item, index) => <div className={`demo-milestone ${item.status === "已完成" ? "done" : item.status === "进行中" || item.status === "已延期" ? "current" : ""}`} key={item.id}><b>{item.status === "已完成" ? "✓" : index + 1}</b><strong>{item.name}</strong><small>计划 {dateLabel(item.plannedDate)}</small><small>实际 {dateLabel(item.actualDate)}</small></div>) : <div className="demo-empty">固定里程碑正在加载</div>}</div></div></section>
    <div className="demo-grid-12"><section className="demo-card span-7"><div className="demo-card-head"><div><h2>计划与实际入组趋势</h2><p>基于历史入组快照</p></div></div><div className="demo-card-body"><EnrollmentChart snapshots={snapshots} target={project.plannedEnrollment} /></div></section><section className="demo-card span-5"><div className="demo-card-head"><div><h2>中心进展</h2><p>中心阶段与入组完成情况</p></div></div><div className="demo-card-body demo-center-list">{centers.length ? centers.slice(0, 5).map((item) => <div className="demo-center-row" key={item.id}><div><strong>{item.name}</strong><small>PI：{item.principalInvestigator || "—"} · {item.province || "—"}</small></div><span className="demo-tag amber">{item.stage}</span><div className="demo-bar-track"><i style={{ width: `${item.plannedEnrollment ? percent(item.enrolledCount / item.plannedEnrollment * 100) : 0}%` }} /></div><b>{item.enrolledCount} / {item.plannedEnrollment}</b></div>) : <div className="demo-empty">暂无中心记录</div>}<div className="demo-center-summary">计划中心 {project.plannedCenterCount} 个，当前已录入 {centers.length} 个；中心累计入组 {centerEnrolled} 例。</div></div></section>
      <section className="demo-card span-8"><div className="demo-card-head"><div><h2>本期汇报摘要</h2><p>项目创建人可维护的汇报文字</p></div>{report?.canEdit && <button className="demo-btn small" onClick={() => setEditOpen(true)}>编辑</button>}</div><div className="demo-card-body demo-report-block"><ReportBlock title="本期完成工作" value={report?.completedWork} fallback="尚未填写本期完成工作。" list /><ReportBlock title="下一阶段计划" value={report?.nextPlan} fallback="尚未填写下一阶段计划。" /><ReportBlock title="问题与风险" value={report?.risksAndIssues} fallback={risks.length ? risks.map((item) => item.title).join("；") : "当前没有新增风险说明。"} risk /><ReportBlock title="需要协调支持" value={report?.supportNeeded} fallback="尚未填写需要协调支持事项。" /></div></section>
      <section className="demo-card span-4"><div className="demo-card-head"><div><h2>预算概况</h2><p>单位：万元</p></div><span className="demo-tag green">{new Date().getFullYear()}</span></div><div className="demo-card-body"><div className="demo-budget-total"><div><span>项目预算合计</span><strong>{(totalBudget / 10000).toFixed(2)}</strong></div><span className="demo-tag blue">年度预算 {(annual / 10000).toFixed(2)}</span></div><div className="demo-bar-track tall"><i style={{ width: `${totalBudget ? percent(annual / totalBudget * 100) : 0}%` }} /></div><p className="demo-budget-note">年度预算占预算合计 {totalBudget ? (annual / totalBudget * 100).toFixed(1) : 0}%</p></div></section>
    </div>
    <div className="demo-report-footer"><button className="demo-btn primary" onClick={onGantt}>查看项目进度与甘特图 →</button></div>
    <ReportEditor projectId={project.id} report={report} open={editOpen} onClose={() => setEditOpen(false)} />
    <Drawer title="项目资料维护" placement="right" width="96vw" open={manageOpen} onClose={() => setManageOpen(false)} destroyOnHidden><ProjectDetail project={project} onBack={() => setManageOpen(false)} /></Drawer>
  </>;
}

function ProjectReportView({ project, data, onGantt }: { project: Project; data: WorkspaceData; onGantt: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const reportQuery = useQuery({ queryKey: ["report", project.id], queryFn: () => api<ProjectReport>(`/projects/${project.id}/report`) });
  const milestones = data.milestones.filter((item) => item.projectId === project.id);
  const tasks = data.tasks.filter((item) => item.projectId === project.id);
  const targets = data.targets.filter((item) => item.projectId === project.id);
  const annualTarget = targets.find((item) => item.year === new Date().getFullYear()) ?? targets[0];
  const overview = data.budgetOverviews.find((item) => item.projectId === project.id);
  const annualBudgetWan = data.budgets.filter((item) => item.projectId === project.id && item.year === new Date().getFullYear()).reduce((sum, item) => sum + item.budgetAmount / 10000, 0);
  const taskProgress = tasks.length ? Math.round(tasks.filter((item) => item.status !== "已取消").reduce((sum, item) => sum + item.progress, 0) / Math.max(tasks.filter((item) => item.status !== "已取消").length, 1)) : 0;
  const health = getProjectHealth(project, milestones, tasks);
  const stage = projectStage(milestones, project.currentStage);
  const nextMilestone = milestones.find((item) => milestoneRuntimeStatus(item) !== "已完成");
  const lateCompleted = milestones.filter((item) => (dateDifferenceLabel(item) || "").startsWith("延期")).length;
  const enrollmentRate = annualTarget?.targetEnrollment ? percent(annualTarget.enrolledCount / annualTarget.targetEnrollment * 100) : 0;
  const report = reportQuery.data;
  return <>
    <ReportDecisionSummary health={health} stage={stage} nextMilestone={nextMilestone} lateCompleted={lateCompleted} />
    <section className="demo-project-hero"><div className="demo-hero-top"><div><span>{project.projectCode} · 项目汇报总览</span><h1>{project.name}</h1><div className="demo-hero-tags"><i>{project.grade}级课题</i><i>{project.diseaseType}</i><i>当前：{stage}</i></div></div><div className="demo-hero-actions">{report?.canEdit && <button className="demo-btn" onClick={() => setEditOpen(true)}>编辑本期汇报</button>}<button className="demo-btn" onClick={() => setManageOpen(true)}>项目资料维护</button><button className="demo-btn" onClick={() => window.print()}>汇报模式 / PDF</button></div></div><div className="demo-hero-meta"><div><small>项目负责人</small><strong>{project.responsiblePerson}</strong></div><div><small>Leading-PI</small><strong>{project.leadingPi}</strong></div><div><small>组长单位</small><strong>{project.leadInstitution}</strong></div><div><small>年度目标</small><strong>{annualTarget ? `${annualTarget.year} · ${annualTarget.targetEnrollment}例` : "待填写"}</strong></div><div><small>项目总预算</small><strong>{overview ? `${overview.totalBudgetWan.toFixed(2)} 万元` : "待填写"}</strong></div></div></section>
    <ProjectResearchSummary project={project} />
    <div className="demo-metric-strip"><Metric label="项目总体完成率" value={taskProgress} suffix="%" /><Metric label="里程碑完成" value={milestones.filter((item) => milestoneRuntimeStatus(item) === "已完成").length} suffix={`/ ${milestones.length || 12}`} /><Metric label="年度已入组" value={annualTarget?.enrolledCount ?? 0} suffix={`/ ${annualTarget?.targetEnrollment ?? 0}例`} /><Metric label="当前在组" value={annualTarget?.activeCount ?? 0} suffix="例" /><Metric label="完成随访" value={annualTarget?.followupCompleteCount ?? 0} suffix="例" /><Metric label="年度预算" value={annualBudgetWan.toFixed(2)} suffix="万元" /></div>
    <section className="demo-card"><div className="demo-card-head"><div><h2>固定里程碑路线图</h2><p>计划日期与实际完成日期；状态和提前/延期自动计算</p></div><div className="demo-legend"><span>● 已完成</span><span>● 当前 / 延期</span><span>○ 未开始</span></div></div><div className="demo-card-body demo-milestone-wrap"><div className="demo-milestone-track">{milestones.length ? milestones.map((item, index) => <div className={`demo-milestone ${milestoneRuntimeStatus(item) === "已完成" ? "done" : milestoneRuntimeStatus(item) === "已延期" ? "current" : ""}`} key={item.id}><b>{milestoneRuntimeStatus(item) === "已完成" ? "✓" : index + 1}</b><strong>{item.name}</strong><small>计划 {dateLabel(item.plannedDate)}</small><small>实际 {dateLabel(item.actualDate)}</small><small className="demo-milestone-variance">{dateDifferenceLabel(item) || "—"}</small></div>) : <div className="demo-empty">固定里程碑正在加载</div>}</div></div></section>
    <div className="demo-grid-12"><section className="demo-card span-7"><div className="demo-card-head"><div><h2>年度目标与入组进度</h2><p>按项目周期逐年维护，不固定为 2026 年</p></div><span className="demo-tag green">{annualTarget?.year ?? "待新增"}</span></div><div className="demo-card-body"><div className="target-progress-summary"><div><strong>{annualTarget?.targetEnrollment ?? 0}</strong><span>年度目标（例）</span></div><div><strong>{annualTarget?.enrolledCount ?? 0}</strong><span>已入组</span></div><div><strong>{annualTarget?.activeCount ?? 0}</strong><span>当前在组</span></div><div><strong>{annualTarget?.followupCompleteCount ?? 0}</strong><span>完成随访</span></div><div><strong>{annualTarget?.dropoutCount ?? 0}</strong><span>脱落/出组</span></div></div><div className="demo-bar-track tall"><i style={{ width: `${enrollmentRate}%` }} /></div><p className="demo-budget-note">年度目标完成率 {enrollmentRate}%；在“项目资料维护 → 目标与预算”中可新增或编辑其他年度。</p></div></section><section className="demo-card span-5"><div className="demo-card-head"><div><h2>预算概况</h2><p>项目全周期累计 + 按年度预算</p></div></div><div className="demo-card-body"><div className="demo-budget-total"><div><span>项目总预算</span><strong>{(overview?.totalBudgetWan ?? 0).toFixed(2)}</strong></div><span className="demo-tag blue">年度 {annualBudgetWan.toFixed(2)} 万元</span></div><div className="budget-mini-list"><span>医学预算 <b>{(overview?.medicalBudgetWan ?? 0).toFixed(2)} 万元</b></span><span>销售预算 <b>{(overview?.salesBudgetWan ?? 0).toFixed(2)} 万元</b></span><span>销售已划拨 <b>{(overview?.salesAllocatedBudgetWan ?? 0).toFixed(2)} 万元</b></span></div><div className="demo-bar-track tall"><i style={{ width: `${overview?.salesBudgetWan ? percent((overview.salesAllocatedBudgetWan / overview.salesBudgetWan) * 100) : 0}%` }} /></div></div></section><section className="demo-card span-12"><div className="demo-card-head"><div><h2>本期汇报摘要</h2><p>项目创建人可维护的汇报文字</p></div>{report?.canEdit && <button className="demo-btn small" onClick={() => setEditOpen(true)}>编辑</button>}</div><div className="demo-card-body demo-report-block"><ReportBlock title="本期完成工作" value={report?.completedWork} fallback="尚未填写本期完成工作。" list /><ReportBlock title="下一阶段计划" value={report?.nextPlan} fallback="尚未填写下一阶段计划。" /><ReportBlock title="问题与需协调事项" value={report?.risksAndIssues} fallback="尚未填写问题或需要协调事项。" risk /><ReportBlock title="需要协调支持" value={report?.supportNeeded} fallback="尚未填写需要协调支持事项。" /></div></section></div>
    <div className="demo-report-footer"><button className="demo-btn primary" onClick={onGantt}>查看项目进度与甘特图 →</button></div>
    <ReportEditor projectId={project.id} report={report} open={editOpen} onClose={() => setEditOpen(false)} />
    <Drawer title="项目资料维护" placement="right" width="96vw" open={manageOpen} onClose={() => setManageOpen(false)} destroyOnHidden><ProjectDetail project={project} onBack={() => setManageOpen(false)} /></Drawer>
  </>;
}

function ReportDecisionSummary({ health, stage, nextMilestone, lateCompleted }: { health: ReturnType<typeof getProjectHealth>; stage: string; nextMilestone?: Milestone; lateCompleted: number }) {
  const next = nextMilestone ? `${nextMilestone.name}${nextMilestone.plannedDate ? ` · ${nextMilestone.plannedDate}` : " · 待排期"}` : "全部固定里程碑均已完成";
  const conclusion = health.value === "已延期" ? `存在延期节点：${health.reason}。请优先补充实际完成日期或更新后续计划。` : health.value === "需关注" ? `项目总体可控，但${health.reason}。建议在本期汇报中明确责任人与处理计划。` : health.value === "待完善" ? `尚未形成完整排期：${health.reason}。建议优先填写 12 个固定里程碑的计划日期。` : "项目总体按计划推进，当前未发现延期节点或高风险事项。";
  return <section className="demo-report-decision"><div className="demo-report-decision-state"><HealthTag value={health.value} /><strong>{conclusion}</strong></div><div><small>当前阶段</small><strong>{stage}</strong></div><div><small>下个关键节点</small><strong>{next}</strong></div><div><small>已完成偏差</small><strong>{lateCompleted ? `${lateCompleted} 个节点延期完成` : "暂无延期完成"}</strong></div></section>;
}

function Metric({ label, value, suffix, tone }: { label: string; value: string | number; suffix: string; tone?: "warn" }) { return <div className={`demo-metric ${tone ?? ""}`}><span>{label}</span><strong>{value}<small>{suffix}</small></strong></div>; }
function ReportBlock({ title, value, fallback, risk, list }: { title: string; value?: string | null; fallback: string; risk?: boolean; list?: boolean }) { const output = value || fallback; return <article className={`demo-report-note ${risk ? "risk" : ""}`}><h3>{title}</h3>{list ? <ul>{output.split(/\n|；/).filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>{output}</p>}</article>; }

function EnrollmentChart({ snapshots, target }: { snapshots: EnrollmentSnapshot[]; target: number }) {
  if (!snapshots.length) return <div className="demo-chart-empty">记录入组快照后，这里会显示真实的计划与实际趋势。</div>;
  const width = 620; const height = 220; const pad = { left: 42, right: 20, top: 20, bottom: 28 }; const max = Math.max(target, ...snapshots.map((item) => item.enrolledCount), 1); const point = (value: number, index: number) => `${pad.left + ((width - pad.left - pad.right) * (snapshots.length === 1 ? .5 : index / (snapshots.length - 1)))},${pad.top + (height - pad.top - pad.bottom) * (1 - value / max)}`;
  return <svg className="demo-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="入组趋势"><defs><linearGradient id="demoArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#23b884" stopOpacity=".25" /><stop offset="1" stopColor="#23b884" stopOpacity="0" /></linearGradient></defs>{[0, .25, .5, .75, 1].map((ratio) => { const y = pad.top + (height - pad.top - pad.bottom) * (1 - ratio); return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={y} y2={y} /><text x={pad.left - 8} y={y + 3}>{Math.round(max * ratio)}</text></g>; })}<polyline className="demo-chart-plan" points={`${point(0, 0)} ${point(target, snapshots.length - 1)}`} /><polygon className="demo-chart-area" points={`${point(0, 0)} ${snapshots.map((item, index) => point(item.enrolledCount, index)).join(" ")} ${point(0, snapshots.length - 1)}`} /><polyline className="demo-chart-line" points={snapshots.map((item, index) => point(item.enrolledCount, index)).join(" ")} />{snapshots.map((item, index) => { const [x] = point(item.enrolledCount, index).split(","); return <text key={item.id} x={x} y={height - 7} textAnchor="middle">{item.snapshotDate.slice(5)}</text>; })}</svg>;
}

function LegacyGanttView({ project, data, onProject }: { project: Project; data: WorkspaceData; onProject: () => void }) {
  const [status, setStatus] = useState(""); const [assignee, setAssignee] = useState(""); const [scale, setScale] = useState("周");
  const tasks = data.tasks.filter((item) => item.projectId === project.id); const milestones = data.milestones.filter((item) => item.projectId === project.id); const people = Array.from(new Set(tasks.map((item) => item.assigneeName)));
  const rows = tasks.filter((item) => (!status || item.status === status) && (!assignee || item.assigneeName === assignee)); const dated = [...rows.filter((item) => item.startDate || item.dueDate).map((item) => ({ id: item.id, title: item.title, phase: item.phaseName || project.currentStage || "未分阶段", status: item.status, assignee: item.assigneeName, start: item.startDate || item.dueDate!, end: item.dueDate || item.startDate!, actual: undefined as string | undefined, progress: item.progress })), ...milestones.filter((item) => item.plannedDate || item.actualDate).map((item) => ({ id: `m-${item.id}`, title: item.name, phase: "固定里程碑", status: item.status, assignee: item.owner.displayName, start: item.plannedDate || item.actualDate!, end: item.plannedDate || item.actualDate!, actual: item.actualDate, progress: item.status === "已完成" ? 100 : 0 }))];
  const range = useMemo(() => { const dates = dated.flatMap((item) => [new Date(item.start).getTime(), new Date(item.end).getTime(), ...(item.actual ? [new Date(item.actual).getTime()] : [])]); const day = 86400000; const min = dates.length ? Math.min(...dates) - day * 7 : Date.now() - day * 30; const max = dates.length ? Math.max(...dates) + day * 30 : Date.now() + day * 90; return { min, max, span: Math.max(max - min, day) }; }, [dated.map((item) => `${item.start}-${item.end}-${item.actual ?? ""}`).join(",")]);
  const groups = Array.from(new Set(dated.map((item) => item.phase)));
  return <><div className="demo-page-head"><div><h1>项目进度与甘特图</h1><p>{project.projectCode} · 计划、实际进度与延期风险。</p></div><div className="demo-head-actions"><button className="demo-btn" onClick={() => window.print()}>打印甘特图</button><button className="demo-btn primary" onClick={onProject}>返回项目汇报</button></div></div><div className="demo-task-summary"><TaskStat value={`${tasks.length ? Math.round(tasks.reduce((sum, item) => sum + item.progress, 0) / tasks.length) : 0}%`} label="总体进度" note="根据有效事项计算" /><TaskStat value={`${milestones.filter((item) => item.status === "已完成").length}/${milestones.length}`} label="里程碑完成" note={project.currentStage || "当前阶段待确认"} /><TaskStat value={tasks.filter((item) => item.dueDate && item.dueDate >= today() && item.dueDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).length} label="即将到期" note="未来30天" tone="warn" /><TaskStat value={tasks.filter((item) => item.dueDate && item.dueDate < today() && !["已完成", "已取消"].includes(item.status)).length} label="已延期" note="需要优先处理" tone="danger" /></div><section className="demo-card"><div className="demo-gantt-toolbar"><div className="demo-filters"><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">全部负责人</option>{people.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{["未开始", "进行中", "已阻塞", "已完成", "已取消"].map((item) => <option key={item}>{item}</option>)}</select></div><div className="demo-segmented">{["日", "周", "月"].map((item) => <button key={item} className={scale === item ? "active" : ""} onClick={() => setScale(item)}>{item}</button>)}</div></div><div className="demo-gantt-scroll"><div className="demo-gantt"><div className="demo-gantt-head"><div>阶段 / 事项</div><div>{Array.from({ length: 8 }, (_, index) => { const d = new Date(range.min + range.span * index / 7); return <span key={index}>{scale === "日" ? `${d.getMonth() + 1}/${d.getDate()}` : scale === "周" ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}` : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`}</span>; })}</div></div>{groups.length ? groups.map((group) => <GanttGroup key={group} group={group} items={dated.filter((item) => item.phase === group)} range={range} />) : <div className="demo-empty">事项填写日期后将生成甘特图</div>}</div></div><div className="demo-table-foot"><span>当前尺度：{scale}；红线表示今天。</span><span>点击项目汇报可继续维护事项</span></div></section></>;
}

function LegacyStatusGanttView({ project, data, onProject }: { project: Project; data: WorkspaceData; onProject: () => void }) {
  const [status, setStatus] = useState(""); const [assignee, setAssignee] = useState(""); const [scale, setScale] = useState<"月" | "季">("月");
  const milestones = data.milestones.filter((item) => item.projectId === project.id && (item.plannedDate || item.actualDate));
  const tasks = data.tasks.filter((item) => item.projectId === project.id && (item.startDate || item.dueDate));
  const people = Array.from(new Set(tasks.map((item) => item.assigneeName)));
  const taskRows = tasks.filter((item) => (!status || item.status === status) && (!assignee || item.assigneeName === assignee));
  const dated = [...milestones.map((item) => ({ date: item.plannedDate || item.actualDate!, actual: item.actualDate })), ...taskRows.map((item) => ({ date: item.startDate || item.dueDate!, actual: item.dueDate }))];
  const range = useMemo(() => { const day = 86_400_000; const dates = dated.flatMap((item) => [new Date(item.date).getTime(), ...(item.actual ? [new Date(item.actual).getTime()] : [])]); const min = dates.length ? Math.min(...dates) - day * 21 : Date.now() - day * 30; const max = dates.length ? Math.max(...dates) + day * 35 : Date.now() + day * 120; return { min, max, span: Math.max(max - min, day) }; }, [dated.map((item) => `${item.date}-${item.actual ?? ""}`).join(",")]);
  const count = scale === "月" ? 9 : 6; const labels = Array.from({ length: count }, (_, index) => { const value = new Date(range.min + range.span * index / (count - 1)); return scale === "月" ? `${value.getFullYear()}.${String(value.getMonth() + 1).padStart(2, "0")}` : `${value.getFullYear()} Q${Math.floor(value.getMonth() / 3) + 1}`; });
  const position = (value: string) => Math.max(0, Math.min(100, (new Date(value).getTime() - range.min) / range.span * 100)); const todayPosition = position(today());
  const milestoneDone = milestones.filter((item) => milestoneRuntimeStatus(item) === "已完成").length;
  return <><div className="demo-page-head"><div><h1>项目进度与甘特图</h1><p>{project.projectCode} · 计划以横条展示，固定里程碑以节点展示，避免短任务文字被截断。</p></div><div className="demo-head-actions"><button className="demo-btn" onClick={() => window.print()}>打印甘特图</button><button className="demo-btn primary" onClick={onProject}>返回项目汇报</button></div></div><div className="demo-task-summary"><TaskStat value={`${taskRows.length ? Math.round(taskRows.reduce((sum, item) => sum + item.progress, 0) / taskRows.length) : 0}%`} label="事项总体进度" note="按当前筛选事项计算" /><TaskStat value={`${milestoneDone}/${milestones.length}`} label="里程碑完成" note="固定关键节点" /><TaskStat value={milestones.filter((item) => milestoneRuntimeStatus(item) === "已延期").length} label="延期节点" note="需优先处理" tone="danger" /><TaskStat value={taskRows.filter((item) => item.dueDate && item.dueDate < today() && !["已完成", "已取消"].includes(item.status)).length} label="延期事项" note="需优先处理" tone="danger" /></div><section className="demo-card"><div className="demo-gantt-toolbar"><div className="demo-filters"><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">全部负责人</option>{people.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部事项状态</option>{["未开始", "进行中", "已阻塞", "已完成", "已取消"].map((item) => <option key={item}>{item}</option>)}</select></div><div className="demo-segmented">{(["月", "季"] as const).map((item) => <button key={item} className={scale === item ? "active" : ""} onClick={() => setScale(item)}>{item}</button>)}</div></div><div className="report-gantt-scroll"><div className="report-gantt"><div className="report-gantt-head"><div>关键节点 / 事项</div><div>{labels.map((label) => <span key={label}>{label}</span>)}</div></div><div className="report-gantt-section">固定里程碑 <small>● 按计划　◎ 实际完成</small></div>{milestones.map((item) => { const planned = item.plannedDate || item.actualDate!; const statusValue = milestoneRuntimeStatus(item); return <div className="report-gantt-row" key={item.id}><div><strong>{item.name}</strong><small>计划：{item.plannedDate || "待填写"}　实际：{item.actualDate || "未完成"}</small></div><div className="report-gantt-track">{todayPosition >= 0 && todayPosition <= 100 && <i className="report-gantt-today" style={{ left: `${todayPosition}%` }} />}<b className={`report-gantt-node ${statusValue === "已完成" ? "done" : statusValue === "已延期" ? "late" : ""}`} style={{ left: `${position(planned)}%` }} title={`${item.name} · 计划 ${planned}`} />{item.actualDate && <em className="report-gantt-actual" style={{ left: `${position(item.actualDate)}%` }} title={`实际完成：${item.actualDate}`} />}</div></div>; })}<div className="report-gantt-section">项目事项 <small>横条为计划周期，深色部分为完成进度</small></div>{taskRows.length ? taskRows.map((item) => { const start = item.startDate || item.dueDate!; const end = item.dueDate || item.startDate!; const left = position(start); const width = Math.max(2, position(end) - left + .8); const late = Boolean(item.dueDate && item.dueDate < today() && !["已完成", "已取消"].includes(item.status)); return <div className="report-gantt-row" key={item.id}><div><strong>{item.title}</strong><small>{item.assigneeName} · {item.status} · 计划 {start} 至 {end}</small></div><div className="report-gantt-track">{todayPosition >= 0 && todayPosition <= 100 && <i className="report-gantt-today" style={{ left: `${todayPosition}%` }} />}<b className={`report-gantt-bar ${late ? "late" : ""} ${item.status === "已完成" ? "done" : ""}`} style={{ left: `${left}%`, width: `${width}%` }}><i style={{ width: `${item.progress}%` }} /></b></div></div>; }) : <div className="demo-empty">当前筛选条件下没有填写日期的项目事项</div>}</div></div><div className="report-gantt-legend"><span><i className="node" />计划里程碑</span><span><i className="actual" />实际完成</span><span><i className="bar" />事项计划 / 完成进度</span><span><i className="late" />延期</span><span><i className="today" />今天</span></div></section></>;
}

function GarbledGanttView({ project, data, onProject }: { project: Project; data: WorkspaceData; onProject: () => void }) {
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [scale, setScale] = useState<"\u65e5" | "\u5468" | "\u6708">("\u6708");
  const allMilestones = data.milestones.filter((item) => item.projectId === project.id && (item.plannedDate || item.actualDate));
  const people = Array.from(new Set(allMilestones.map((item) => item.owner.displayName).filter(Boolean)));
  const statusOptions = ["\u672a\u5f00\u59cb", "\u8fdb\u884c\u4e2d", "\u5df2\u5b8c\u6210", "\u5df2\u5ef6\u671f"];
  const milestones = allMilestones.filter((item) => {
    const currentStatus = milestoneRuntimeStatus(item);
    return (!status || currentStatus === status) && (!assignee || item.owner.displayName === assignee);
  });
  const range = useMemo(() => {
    const day = 86_400_000;
    const dates = allMilestones.flatMap((item) => [item.plannedDate, item.actualDate].filter(Boolean).map((value) => new Date(value!).getTime()));
    const min = dates.length ? Math.min(...dates) - day * 45 : Date.now() - day * 30;
    const max = dates.length ? Math.max(...dates) + day * 75 : Date.now() + day * 120;
    return { min, max, span: Math.max(max - min, day) };
  }, [allMilestones.map((item) => `${item.plannedDate ?? ""}-${item.actualDate ?? ""}`).join(",")]);
  const labelCount = scale === "\u65e5" ? 11 : scale === "\u5468" ? 10 : 9;
  const labels = Array.from({ length: labelCount }, (_, index) => {
    const value = new Date(range.min + range.span * index / (labelCount - 1));
    if (scale === "\u65e5") return `${value.getMonth() + 1}/${value.getDate()}`;
    if (scale === "\u5468") return `${value.getMonth() + 1}/${value.getDate()} \u5468`;
    return `${value.getFullYear()}.${String(value.getMonth() + 1).padStart(2, "0")}`;
  });
  const position = (value: string) => Math.max(0, Math.min(100, (new Date(value).getTime() - range.min) / range.span * 100));
  const todayPosition = position(today());
  const counts = {
    done: allMilestones.filter((item) => milestoneRuntimeStatus(item) === "\u5df2\u5b8c\u6210").length,
    active: allMilestones.filter((item) => milestoneRuntimeStatus(item) === "\u8fdb\u884c\u4e2d").length,
    late: allMilestones.filter((item) => milestoneRuntimeStatus(item) === "\u5df2\u5ef6\u671f").length,
  };
  const barInfo = (item: typeof allMilestones[number]) => {
    const visualStatus = milestoneRuntimeStatus(item);
    const plannedPosition = position(item.plannedDate || item.actualDate!);
    const actualPosition = item.actualDate ? position(item.actualDate) : plannedPosition;
    const left = Math.min(94, Math.max(2, Math.min(plannedPosition, actualPosition)));
    const duration = item.actualDate ? Math.abs(actualPosition - plannedPosition) + 4.8 : 5.6;
    const width = Math.min(28, Math.max(5.6, duration));
    const tone = visualStatus === "\u5df2\u5b8c\u6210" ? "done" : visualStatus === "\u8fdb\u884c\u4e2d" ? "active" : visualStatus === "\u5df2\u5ef6\u671f" ? "late" : "pending";
    const progress = tone === "done" ? 100 : tone === "active" ? 52 : tone === "late" ? 45 : 0;
    const label = tone === "done" ? "\u5df2\u5b8c\u6210" : tone === "active" ? "\u8fdb\u884c\u4e2d" : tone === "late" ? "\u5df2\u5ef6\u671f" : "\u8ba1\u5212\u4efb\u52a1";
    return { left, width, tone, progress, label, visualStatus };
  };
  return <>
    <div className="demo-page-head"><div><h1>\u9879\u76ee\u8fdb\u5ea6\u4e0e\u7518\u7279\u56fe</h1><p>{project.projectCode} \u00b7 \u56fa\u5b9a\u91cc\u7a0b\u7891\u6309\u72b6\u6001\u6761\u5f62\u5c55\u793a\uff0c\u53ef\u5feb\u901f\u8bc6\u522b\u5b8c\u6210\u3001\u63a8\u8fdb\u548c\u5ef6\u671f\u8282\u70b9\u3002</p></div><div className="demo-head-actions"><button className="demo-btn" onClick={() => window.print()}>\u6253\u5370\u7518\u7279\u56fe</button><button className="demo-btn primary" onClick={onProject}>\u8fd4\u56de\u9879\u76ee\u6c47\u62a5</button></div></div>
    <div className="demo-task-summary"><TaskStat value={`${counts.done}/${allMilestones.length}`} label="\u5df2\u5b8c\u6210\u91cc\u7a0b\u7891" note="\u6309\u5b9e\u9645\u5b8c\u6210\u65e5\u671f\u5224\u5b9a" /><TaskStat value={counts.active} label="\u63a8\u8fdb\u4e2d" note="\u5df2\u5230\u8ba1\u5212\u65e5\u671f\u4f46\u672a\u5b8c\u6210" tone="warn" /><TaskStat value={counts.late} label="\u5df2\u5ef6\u671f" note="\u9700\u8981\u4f18\u5148\u8ddf\u8fdb" tone="danger" /><TaskStat value={allMilestones.length - counts.done} label="\u672a\u5b8c\u6210" note="\u56fa\u5b9a\u5173\u952e\u8282\u70b9" /></div>
    <section className="demo-card milestone-bar-gantt-card"><div className="demo-gantt-toolbar"><div className="demo-filters"><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">\u5168\u90e8\u8d1f\u8d23\u4eba</option>{people.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">\u5168\u90e8\u72b6\u6001</option>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></div><div className="demo-segmented">{(["\u65e5", "\u5468", "\u6708"] as const).map((item) => <button key={item} className={scale === item ? "active" : ""} onClick={() => setScale(item)}>{item}</button>)}</div></div>
      <div className="milestone-bar-gantt-scroll"><div className="milestone-bar-gantt"><div className="milestone-bar-gantt-head"><div>\u56fa\u5b9a\u91cc\u7a0b\u7891</div><div>{labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div></div>{milestones.length ? milestones.map((item) => { const bar = barInfo(item); return <div className="milestone-bar-gantt-row" key={item.id}><div className="milestone-bar-gantt-info"><strong>{item.name}</strong><small>\u8d1f\u8d23\u4eba\uff1a{item.owner.displayName} \u00b7 {bar.visualStatus} \u00b7 \u8ba1\u5212 {item.plannedDate || "\u5f85\u586b\u5199"}{item.actualDate ? ` \u00b7 \u5b9e\u9645 ${item.actualDate}` : ""}</small></div><div className="milestone-bar-gantt-track">{todayPosition >= 0 && todayPosition <= 100 && <i className="milestone-bar-gantt-today" style={{ left: `${todayPosition}%` }} />}<b className={`milestone-bar-gantt-bar ${bar.tone}`} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} title={`${item.name}\uff1a${bar.label}`}><i style={{ width: `${bar.progress}%` }} /><span>{bar.label}</span></b></div></div>; }) : <div className="demo-empty">\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6ca1\u6709\u91cc\u7a0b\u7891\u3002</div>}</div></div>
      <div className="milestone-bar-gantt-legend"><span><i className="done" />\u5df2\u5b8c\u6210</span><span><i className="active" />\u8fdb\u884c\u4e2d\uff08\u6df1\u6d45\u8868\u793a\u5b8c\u6210\u7a0b\u5ea6\uff09</span><span><i className="pending" />\u5c1a\u672a\u5f00\u59cb</span><span><i className="late" />\u5df2\u5ef6\u671f</span><span><i className="today" />\u4eca\u65e5</span></div></section>
  </>;
}

function GanttView({ project, data, onProject }: { project: Project; data: WorkspaceData; onProject: () => void }) {
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [scale, setScale] = useState<"日" | "周" | "月">("月");
  const allMilestones = data.milestones.filter((item) => item.projectId === project.id && (item.plannedDate || item.actualDate));
  const people = Array.from(new Set(allMilestones.map((item) => item.owner.displayName).filter(Boolean)));
  const statusOptions = ["未开始", "进行中", "已完成", "已延期"];
  const milestones = allMilestones.filter((item) => (!status || milestoneRuntimeStatus(item) === status) && (!assignee || item.owner.displayName === assignee));
  const range = useMemo(() => {
    const day = 86_400_000;
    const dates = allMilestones.flatMap((item) => [item.plannedDate, item.actualDate].filter(Boolean).map((value) => new Date(value!).getTime()));
    const min = dates.length ? Math.min(...dates) - day * 45 : Date.now() - day * 30;
    const max = dates.length ? Math.max(...dates) + day * 75 : Date.now() + day * 120;
    return { min, max, span: Math.max(max - min, day) };
  }, [allMilestones.map((item) => `${item.plannedDate ?? ""}-${item.actualDate ?? ""}`).join(",")]);
  const labelCount = scale === "日" ? 11 : scale === "周" ? 10 : 9;
  const labels = Array.from({ length: labelCount }, (_, index) => {
    const value = new Date(range.min + range.span * index / (labelCount - 1));
    return scale === "日" ? `${value.getMonth() + 1}/${value.getDate()}` : scale === "周" ? `${value.getMonth() + 1}/${value.getDate()} 周` : `${value.getFullYear()}.${String(value.getMonth() + 1).padStart(2, "0")}`;
  });
  const position = (value: string) => Math.max(0, Math.min(100, (new Date(value).getTime() - range.min) / range.span * 100));
  const todayPosition = position(today());
  const counts = { done: allMilestones.filter((item) => milestoneRuntimeStatus(item) === "已完成").length, active: allMilestones.filter((item) => milestoneRuntimeStatus(item) === "进行中").length, late: allMilestones.filter((item) => milestoneRuntimeStatus(item) === "已延期").length };
  const barInfo = (item: typeof allMilestones[number]) => {
    const currentStatus = milestoneRuntimeStatus(item);
    const plannedPosition = position(item.plannedDate || item.actualDate!);
    const actualPosition = item.actualDate ? position(item.actualDate) : plannedPosition;
    const left = Math.min(94, Math.max(2, Math.min(plannedPosition, actualPosition)));
    const width = Math.min(28, Math.max(5.6, item.actualDate ? Math.abs(actualPosition - plannedPosition) + 4.8 : 5.6));
    const tone = currentStatus === "已完成" ? "done" : currentStatus === "进行中" ? "active" : currentStatus === "已延期" ? "late" : "pending";
    return { left, width, tone, progress: tone === "done" ? 100 : tone === "active" ? 52 : tone === "late" ? 45 : 0, label: tone === "done" ? "已完成" : tone === "active" ? "进行中" : tone === "late" ? "已延期" : "计划任务", currentStatus };
  };
  return <>
    <div className="demo-page-head"><div><h1>项目进度与甘特图</h1><p>{project.projectCode} · 固定里程碑按状态条形展示，可快速识别完成、推进和延期节点。</p></div><div className="demo-head-actions"><button className="demo-btn" onClick={() => window.print()}>打印甘特图</button><button className="demo-btn primary" onClick={onProject}>返回项目汇报</button></div></div>
    <div className="demo-task-summary"><TaskStat value={`${counts.done}/${allMilestones.length}`} label="已完成里程碑" note="按实际完成日期判定" /><TaskStat value={counts.active} label="推进中" note="已到计划日期但未完成" tone="warn" /><TaskStat value={counts.late} label="已延期" note="需要优先跟进" tone="danger" /><TaskStat value={allMilestones.length - counts.done} label="未完成" note="固定关键节点" /></div>
    <section className="demo-card milestone-bar-gantt-card"><div className="demo-gantt-toolbar"><div className="demo-filters"><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">全部负责人</option>{people.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></div><div className="demo-segmented">{(["日", "周", "月"] as const).map((item) => <button key={item} className={scale === item ? "active" : ""} onClick={() => setScale(item)}>{item}</button>)}</div></div>
      <div className="milestone-bar-gantt-scroll"><div className="milestone-bar-gantt"><div className="milestone-bar-gantt-head"><div>固定里程碑</div><div>{labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div></div>{milestones.length ? milestones.map((item) => { const bar = barInfo(item); return <div className="milestone-bar-gantt-row" key={item.id}><div className="milestone-bar-gantt-info"><strong>{item.name}</strong><small>负责人：{item.owner.displayName} · {bar.currentStatus} · 计划 {item.plannedDate || "待填写"}{item.actualDate ? ` · 实际 ${item.actualDate}` : ""}</small></div><div className="milestone-bar-gantt-track">{todayPosition >= 0 && todayPosition <= 100 && <i className="milestone-bar-gantt-today" style={{ left: `${todayPosition}%` }} />}<b className={`milestone-bar-gantt-bar ${bar.tone}`} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} title={`${item.name}：${bar.label}`}><i style={{ width: `${bar.progress}%` }} /><span>{bar.label}</span></b></div></div>; }) : <div className="demo-empty">当前筛选条件下没有里程碑。</div>}</div></div>
      <div className="milestone-bar-gantt-legend"><span><i className="done" />已完成</span><span><i className="active" />进行中（深浅表示完成程度）</span><span><i className="pending" />尚未开始</span><span><i className="late" />已延期</span><span><i className="today" />今日</span></div></section>
  </>;
}

function TaskStat({ value, label, note, tone }: { value: string | number; label: string; note: string; tone?: "warn" | "danger" }) { return <div className={`demo-task-stat ${tone ?? ""}`}><b>{value}</b><div><strong>{label}</strong><span>{note}</span></div></div>; }
function GanttGroup({ group, items, range }: { group: string; items: Array<{ id: string; title: string; status: string; assignee: string; start: string; end: string; actual?: string | null; progress: number }>; range: { min: number; max: number; span: number } }) { const start = Math.min(...items.map((item) => new Date(item.start).getTime())); const end = Math.max(...items.map((item) => new Date(item.end).getTime())); const phaseProgress = Math.round(items.reduce((sum, item) => sum + item.progress, 0) / Math.max(items.length, 1)); return <>{<div className="demo-gantt-row phase"><div><strong>▾ {group}</strong><small>完成率 {phaseProgress}%</small></div><GanttBar start={start} end={end} progress={phaseProgress} status="phase" range={range} /></div>}{items.map((item) => <div className="demo-gantt-row" key={item.id}><div><strong>　{item.title}</strong><small>负责人：{item.assignee} · {item.status}{item.actual ? ` · 实际 ${item.actual}` : ""}</small></div><GanttBar start={new Date(item.start).getTime()} end={new Date(item.end).getTime()} actual={item.actual ? new Date(item.actual).getTime() : undefined} progress={item.progress} status={item.status} range={range} /></div>)}</> }
function GanttBar({ start, end, actual, progress, status, range }: { start: number; end: number; actual?: number; progress: number; status: string; range: { min: number; max: number; span: number } }) { const left = percent((start - range.min) / range.span * 100); const width = Math.max(2, percent((end - start + 86400000) / range.span * 100)); const now = (Date.now() - range.min) / range.span * 100; const actualLeft = actual === undefined ? undefined : percent((actual - range.min) / range.span * 100); return <div className="demo-gantt-timeline"><i className="demo-gantt-today" style={{ left: `${now}%` }} /><b className={`demo-gantt-bar ${status === "已阻塞" ? "blocked" : status === "已完成" ? "done" : status === "phase" ? "phase" : ""}`} style={{ left: `${left}%`, width: `${width}%` }}><i style={{ width: `${progress}%` }} /><span>{progress ? `${progress}%` : "计划"}</span></b>{actualLeft !== undefined && <em className="demo-gantt-actual" style={{ left: `${actualLeft}%` }} title="实际完成日期" />}</div>; }

function MyTasksOld({ projects, data, user }: { projects: Project[]; data: WorkspaceData; user: User }) {
  const [scope, setScope] = useState("all"); const [status, setStatus] = useState(""); const [projectId, setProjectId] = useState(""); const [editing, setEditing] = useState<Task>(); const [createOpen, setCreateOpen] = useState(false); const [createProjectId, setCreateProjectId] = useState(""); const [creating, setCreating] = useState(false);
  void user; void creating; void setCreating;
  const projectMap = new Map(projects.map((project) => [project.id, project])); const related = data.tasks.filter((item) => item.canEdit || item.assigneeName === user.displayName); const tasks = related.filter((item) => (!scope || scope === "all" || (scope === "editable" ? item.canEdit : !item.canEdit)) && (!status || item.status === status) && (!projectId || item.projectId === projectId)); const upcoming = related.filter((item) => item.dueDate && item.dueDate >= today() && item.dueDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length; const overdue = related.filter((item) => item.dueDate && item.dueDate < today() && !["已完成", "已取消"].includes(item.status)).length;
  return <><div className="demo-page-head"><div><h1>我的事项</h1><p>同时区分“我拥有编辑权”和“我负责但只读”的工作。</p></div><div className="demo-head-actions"><button className="demo-btn primary" onClick={() => { setCreateProjectId(projects[0]?.id ?? ""); setCreateOpen(true); }}>＋ 新建事项</button></div></div><div className="demo-task-summary"><TaskStat value={related.length} label="全部相关" note="当前项目中全部事项" /><TaskStat value={related.filter((item) => item.canEdit).length} label="我可编辑" note="我是创建者" /><TaskStat value={upcoming} label="即将到期" note="未来7天" tone="warn" /><TaskStat value={overdue} label="已延期" note="需要优先处理" tone="danger" /></div><section className="demo-card"><div className="demo-toolbar"><div className="demo-filters"><select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">全部事项</option><option value="editable">我可编辑</option><option value="readonly">我负责/只读</option></select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{["未开始", "进行中", "已阻塞", "已完成", "已取消"].map((item) => <option key={item}>{item}</option>)}</select><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">全部项目</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.projectCode}</option>)}</select></div><span className="demo-tag blue">负责人 ≠ 编辑权限所有者</span></div><div className="demo-task-list">{tasks.length ? tasks.map((task) => { const project = projectMap.get(task.projectId); const overdueTask = task.dueDate && task.dueDate < today() && !["已完成", "已取消"].includes(task.status); return <div className={`demo-task-item ${task.status === "已完成" ? "done" : ""}`} key={task.id}><button className="demo-task-check" disabled={!task.canEdit} onClick={() => task.canEdit && setEditing(task)}>✓</button><div><strong>{task.title}</strong><small>{project?.projectCode} · {task.phaseName || project?.currentStage || "未分阶段"}</small></div><div className="demo-task-owner"><strong>所有者：{task.owner.displayName}</strong><small>负责人：{task.assigneeName} · {task.canEdit ? "可编辑" : "只读"}</small></div><time>{overdueTask ? "已延期" : task.dueDate ? `截止 ${task.dueDate.slice(5)}` : "待排期"}</time><span className={`demo-tag ${task.status === "已阻塞" || overdueTask ? "red" : task.status === "进行中" ? "amber" : task.status === "已完成" ? "green" : "blue"}`}>{task.status}</span><button className="demo-btn small" onClick={() => setEditing(task)}>{task.canEdit ? "编辑" : "查看"}</button></div>; }) : <div className="demo-empty">暂无符合条件的事项</div>}</div></section><Modal open={createOpen} title="新建事项" onCancel={() => setCreateOpen(false)} footer={null}><label className="demo-select-label">所属项目</label><Select value={createProjectId} style={{ width: "100%", marginBottom: 16 }} onChange={setCreateProjectId} options={projects.map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} /><button className="demo-btn primary" onClick={() => { setCreateOpen(false); setEditing(undefined); }}>在下方填写事项</button><p className="demo-modal-hint">选择项目后将打开事项表单。</p></Modal>{(editing || (createOpen === false && createProjectId && false)) && <TaskEditor task={editing} projectId={editing?.projectId ?? createProjectId} open={Boolean(editing)} onClose={() => setEditing(undefined)} />}</>;
}

function MyProjectsPanel({ projects, data, onProject }: { projects: Project[]; data: WorkspaceData; onProject: (project: Project) => void }) {
  const client = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const favoritesQuery = useQuery({ queryKey: ["favorite-projects"], queryFn: () => api<string[]>("/projects/favorites/mine") });
  const favoriteIds = favoritesQuery.data ?? [];
  const favoriteSet = new Set(favoriteIds);
  const favorites = favoriteIds.map((id) => projects.find((item) => item.id === id)).filter(Boolean) as Project[];
  const available = projects.filter((item) => !favoriteSet.has(item.id));
  const add = useMutation({ mutationFn: (projectId: string) => api(`/projects/favorites/${projectId}`, { method: "POST" }), onSuccess: async () => { message.success("已加入我的项目"); await client.invalidateQueries({ queryKey: ["favorite-projects"] }); setPickerOpen(false); setSelectedId(""); }, onError: (error) => message.error((error as Error).message) });
  const remove = useMutation({ mutationFn: (projectId: string) => api(`/projects/favorites/${projectId}`, { method: "DELETE" }), onSuccess: async () => { message.success("已从我的项目移除"); await client.invalidateQueries({ queryKey: ["favorite-projects"] }); }, onError: (error) => message.error((error as Error).message) });
  return <section className="demo-card my-projects-panel"><div className="demo-card-head"><div><h2>我的项目</h2><p>从已有项目中加入个人关注列表，不改变项目负责人或项目归属。</p></div><button className="demo-btn primary small" onClick={() => { setSelectedId(available[0]?.id ?? ""); setPickerOpen(true); }}>＋ 添加已有项目</button></div><div className="my-project-cards">{favorites.length ? favorites.map((project) => { const milestones = data.milestones.filter((item) => item.projectId === project.id).sort((a, b) => a.sortOrder - b.sortOrder); const completed = milestones.filter((item) => item.actualDate).length; const next = milestones.find((item) => !item.actualDate && item.plannedDate); const late = milestones.filter((item) => item.plannedDate && item.plannedDate < today() && !item.actualDate).length; return <article className="my-project-card" key={project.id} onClick={() => onProject(project)}><div><span className={`demo-tag ${late ? "red" : "green"}`}>{late ? `${late} 个延期` : "进度正常"}</span><button className="my-project-remove" title="从我的项目移除" onClick={(event) => { event.stopPropagation(); remove.mutate(project.id); }}>×</button></div><strong>{project.name}</strong><small>{project.projectCode} · {project.region || "待归类"} · {project.grade || "待分级"}</small><p>里程碑 {completed}/12</p><div><span>{next ? `下一节点：${next.name}` : completed === 12 ? "全部完成" : "待补计划日期"}</span><time>{next?.plannedDate || "—"}</time></div></article>; }) : <div className="demo-empty">尚未添加项目。点击“添加已有项目”，从导入项目或手工项目中选择。</div>}</div><Modal open={pickerOpen} title="添加已有项目" okText="加入我的项目" cancelText="取消" onCancel={() => setPickerOpen(false)} onOk={() => selectedId && add.mutate(selectedId)} confirmLoading={add.isPending} okButtonProps={{ disabled: !selectedId }}><p className="demo-modal-hint">这里只建立个人关注关系，不会修改项目负责人。</p><Select showSearch optionFilterProp="label" value={selectedId || undefined} placeholder="搜索项目名称或编码" style={{ width: "100%" }} onChange={setSelectedId} options={available.map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} />{!available.length && <div className="demo-empty">所有项目都已经加入</div>}</Modal></section>;
}

function MyTasks({ projects, data, user, onProject }: { projects: Project[]; data: WorkspaceData; user?: User; onProject: (project: Project) => void }) {
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState("");
  const [projectId, setProjectId] = useState("");
  const [editing, setEditing] = useState<Task>();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createProjectId, setCreateProjectId] = useState("");
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const viewer = user ?? activeUser;
  const related = data.tasks.filter((item) => item.owner.id === viewer?.id || item.assigneeName === viewer?.displayName);
  const tasks = related.filter((item) => (!scope || scope === "all" || (scope === "created" ? item.owner.id === viewer?.id : item.assigneeName === viewer?.displayName)) && (!status || item.status === status) && (!projectId || item.projectId === projectId));
  const upcoming = related.filter((item) => item.dueDate && item.dueDate >= today() && item.dueDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length;
  const overdue = related.filter((item) => item.dueDate && item.dueDate < today() && !["已完成", "已取消"].includes(item.status)).length;
  return <>
    <div className="demo-page-head"><div><h1>我的工作台</h1><p>集中查看我关注的项目，以及我创建或被指定负责的个人事项。</p></div><div className="demo-head-actions"><button className="demo-btn primary" onClick={() => { setCreateProjectId(projects[0]?.id ?? ""); setCreateOpen(true); }}>＋ 新建事项</button></div></div>
    <MyProjectsPanel projects={projects} data={data} onProject={onProject} />
    <div className="demo-task-summary"><TaskStat value={related.length} label="全部相关事项" note="我创建或我负责" /><TaskStat value={related.filter((item) => item.owner.id === viewer?.id).length} label="我创建" note="个人维护事项" /><TaskStat value={upcoming} label="即将到期" note="未来 7 天" tone="warn" /><TaskStat value={overdue} label="已延期" note="需要优先处理" tone="danger" /></div>
    <section className="demo-card"><div className="demo-toolbar"><div className="demo-filters"><select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">全部相关事项</option><option value="created">我创建</option><option value="assigned">我负责</option></select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{["未开始", "进行中", "已阻塞", "已完成", "已取消"].map((item) => <option key={item}>{item}</option>)}</select><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">全部项目</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.projectCode}</option>)}</select></div><span className="demo-tag blue">个人事项与项目资料分开维护</span></div>
      <div className="demo-task-list">{tasks.length ? tasks.map((task) => { const project = projectMap.get(task.projectId); const late = task.dueDate && task.dueDate < today() && !["已完成", "已取消"].includes(task.status); return <div className={`demo-task-item ${task.status === "已完成" ? "done" : ""}`} key={task.id}><button className="demo-task-check" disabled={!task.canEdit} onClick={() => task.canEdit && setEditing(task)}>✓</button><div><strong>{task.title}</strong><small>{project?.projectCode} · {task.phaseName || project?.currentStage || "未分阶段"}</small></div><div className="demo-task-owner"><strong>所有者：{task.owner.displayName}</strong><small>负责人：{task.assigneeName} · {task.canEdit ? "可编辑" : "只读"}</small></div><time>{late ? "已延期" : task.dueDate ? `截止 ${task.dueDate.slice(5)}` : "待排期"}</time><span className={`demo-tag ${task.status === "已阻塞" || late ? "red" : task.status === "进行中" ? "amber" : task.status === "已完成" ? "green" : "blue"}`}>{task.status}</span><button className="demo-btn small" onClick={() => setEditing(task)}>{task.canEdit ? "编辑" : "查看"}</button></div>; }) : <div className="demo-empty">暂无符合条件的事项</div>}</div>
    </section>
    <Modal open={createOpen} title="新建事项" onCancel={() => setCreateOpen(false)} footer={null}><label className="demo-select-label">所属项目</label><Select showSearch optionFilterProp="label" value={createProjectId} style={{ width: "100%", marginBottom: 16 }} onChange={setCreateProjectId} options={projects.map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} /><button className="demo-btn primary" disabled={!createProjectId} onClick={() => { setCreateOpen(false); setCreating(true); }}>继续填写事项</button><p className="demo-modal-hint">可关联任意已有项目，事项只出现在创建者或负责人工作台中。</p></Modal>
    {(editing || creating) && <TaskEditor task={editing} projectId={editing?.projectId ?? createProjectId} open={Boolean(editing) || creating} onClose={() => { setEditing(undefined); setCreating(false); }} />}
  </>;
}

export function DemoWorkspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  activeUser = user;
  const [view, setView] = useState<View>("overview"); const [selectedProject, setSelectedProject] = useState<Project>(); const [createOpen, setCreateOpen] = useState(false); const client = useQueryClient();
  const workspaceQuery = useWorkspaceSnapshot(); const projects = workspaceQuery.data?.projects ?? []; const data = workspaceQuery.data?.data ?? emptyWorkspace;
  useEffect(() => {
    if (!selectedProject && projects[0]) { setSelectedProject(projects[0]); return; }
    if (selectedProject) {
      const latest = projects.find((item) => item.id === selectedProject.id);
      if (latest && latest.version !== selectedProject.version) setSelectedProject(latest);
      if (!latest && workspaceQuery.isFetched) { setSelectedProject(undefined); setView("overview"); }
    }
  }, [projects, workspaceQuery.isFetched, selectedProject]);
  useEffect(() => { const socket = io("/", { withCredentials: true }); socket.on("project.changed", () => { ["workspace-snapshot", "report", "tasks", "milestones", "annual-targets", "budget-overview", "budgets", "attachments", "audit"].forEach((key) => client.invalidateQueries({ queryKey: [key] })); message.info("检测到项目更新，已同步最新数据"); }); return () => { socket.disconnect(); }; }, [client]);
  const selectProject = (project: Project, destination: View = "project") => { setSelectedProject(project); setView(destination); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const title: Record<View, string> = { overview: "全部项目", research: "研究统计看板", project: "项目工作台", gantt: "项目工作台", tasks: "我的工作台" };
  return <div className="demo-shell"><aside className="demo-sidebar"><div className="demo-brand"><b>IIT</b><div><strong>研究项目管理</strong><small>IIT Portfolio Workspace</small></div></div><span className="demo-nav-label">工作台</span><nav>{([ ["overview", "▦", "全部项目"], ["project", "◉", "项目工作台"], ["tasks", "✓", "我的工作台"] ] as Array<[View, string, string]>).map(([key, icon, label]) => <button className={view === key ? "active" : ""} key={key} onClick={() => { if (key === "project" && !selectedProject) return; setView(key); }}><i>{icon}</i><span>{label}</span>{key === "overview" && <b>{projects.length}</b>}{key === "tasks" && <b>{data.tasks.filter((item) => item.owner.id === user.id || item.assigneeName === user.displayName).length}</b>}</button>)}</nav><div className="demo-side-foot">多人实时协作 · V1.0 内部版</div></aside><main className="demo-main"><header className="demo-topbar"><div><span>IIT 项目管理</span><strong>{title[view]}</strong></div><div><button className="demo-btn small" onClick={() => window.print()}>打印当前页</button><span className="demo-sync"><i />已同步到服务器</span><button className="demo-user" onClick={onLogout}><b>{user.displayName.slice(0, 1)}</b>{user.displayName}<small>退出</small></button></div></header><div className="demo-content"><div className="demo-banner"><span><strong>内部协同空间：</strong>所有数据来自服务器；保存后，其他在线成员会自动刷新。</span><span>数据截止：{new Date().toLocaleString("zh-CN")}</span></div>{workspaceQuery.isLoading ? <div className="demo-loading">正在加载项目数据…</div> : workspaceQuery.isError ? <div className="demo-empty">项目加载失败：{(workspaceQuery.error as Error).message}</div> : view === "overview" ? <Overview projects={projects} data={data} user={user} onProject={(project) => selectProject(project)} onCreate={() => setCreateOpen(true)} /> : view === "research" ? <ResearchStatisticsBoard projects={projects} data={data} onProject={(project) => selectProject(project)} /> : !selectedProject ? <div className="demo-empty">请先在全部项目中选择一个项目</div> : view === "project" ? <ProjectWorkspace project={selectedProject} data={data} /> : view === "gantt" ? <ProjectWorkspace project={selectedProject} data={data} initialSection="gantt" /> : <MyTasks projects={projects} data={data} user={user} onProject={(project) => selectProject(project)} />}</div></main><ProjectEditor open={createOpen} onClose={() => setCreateOpen(false)} /></div>;
}
