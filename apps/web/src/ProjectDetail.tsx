import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  EditOutlined,
  FlagOutlined,
  PlusOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import { api } from "./api";
import type { EnrollmentSnapshot, Milestone, Project, ResearchCenter, Task } from "./types";
import { GovernancePanel, GovernanceSummary, useGovernanceData } from "./GovernancePanel";
import { AttachmentsPanel, AuditPanel, ImportSourcePanel } from "./ProjectRecordsPanel";
import { ProjectResearchPanel, ProjectResearchSummary } from "./ProjectResearchPanel";
import { dateDifferenceLabel, milestoneRuntimeStatus, today } from "./project-progress";

const milestoneColors: Record<string, string> = {
  未开始: "default",
  进行中: "processing",
  已完成: "success",
  已延期: "error",
};

const taskColors: Record<string, string> = {
  未开始: "default",
  进行中: "processing",
  已阻塞: "error",
  已完成: "success",
  已取消: "default",
};

function MilestoneModal({ item, open, onClose }: { item?: Milestone; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api<Milestone>(`/milestones/${item!.id}`, { method: "PATCH", body: JSON.stringify({ ...values, version: item!.version }) }),
    onSuccess: async () => {
      message.success("里程碑日期已更新");
      await queryClient.invalidateQueries({ queryKey: ["milestones", item!.projectId] });
      onClose();
    },
    onError: (error) => message.error((error as Error).message),
  });

  return (
    <Modal open={open} title="填写里程碑日期" okText="保存" cancelText="取消" confirmLoading={mutation.isPending} onCancel={onClose} onOk={() => form.submit()} destroyOnHidden afterOpenChange={(visible) => { if (visible) { form.resetFields(); form.setFieldsValue(item); } }}>
      <Form form={form} layout="vertical" disabled={!item?.canEdit} onFinish={(values) => mutation.mutate(values)}>
        <Form.Item label="固定里程碑"><Input value={item?.name} disabled /></Form.Item>
        <Row gutter={14}>
          <Col span={12}><Form.Item name="plannedDate" label="计划日期"><Input type="date" /></Form.Item></Col>
          <Col span={12}><Form.Item name="actualDate" label="实际完成日期"><Input type="date" /></Form.Item></Col>
        </Row>
        <Typography.Text type="secondary">状态由系统根据计划与实际日期自动计算。</Typography.Text>
      </Form>
    </Modal>
  );
}

function LegacyProjectTimelineGantt({ milestones, tasks }: { milestones: Milestone[]; tasks: Task[] }) {
  const rows = [
    ...milestones.filter((item) => item.plannedDate).map((item) => ({ id: `m-${item.id}`, title: item.name, subtitle: "固定里程碑", start: item.plannedDate!, end: item.plannedDate!, actual: item.actualDate, progress: milestoneRuntimeStatus(item) === "已完成" ? 100 : 0, late: milestoneRuntimeStatus(item) === "已延期" })),
    ...tasks.filter((item) => item.startDate || item.dueDate).map((item) => ({ id: item.id, title: item.title, subtitle: item.assigneeName, start: item.startDate || item.dueDate!, end: item.dueDate || item.startDate!, actual: undefined as string | null | undefined, progress: item.progress, late: Boolean(item.dueDate && item.dueDate < today() && !["已完成", "已取消"].includes(item.status)) })),
  ];
  const range = useMemo(() => {
    const day = 86_400_000; const dates = rows.flatMap((item) => [new Date(item.start).getTime(), new Date(item.end).getTime(), ...(item.actual ? [new Date(item.actual).getTime()] : [])]);
    const min = dates.length ? Math.min(...dates) - day * 21 : Date.now() - day * 30; const max = dates.length ? Math.max(...dates) + day * 45 : Date.now() + day * 90;
    return { min, max, span: Math.max(max - min, day) };
  }, [rows.map((item) => `${item.start}-${item.end}-${item.actual ?? ""}`).join(",")]);
  const labels = Array.from({ length: 7 }, (_, index) => { const value = new Date(range.min + range.span * index / 6); return `${value.getFullYear()}.${String(value.getMonth() + 1).padStart(2, "0")}`; });
  const place = (date: string) => Math.max(0, Math.min(100, (new Date(date).getTime() - range.min) / range.span * 100)); const todayPlace = place(today());
  if (!rows.length) return <Empty description="填写里程碑计划日期或事项日期后，将生成项目甘特图" />;
  return <div className="timeline-gantt-shell"><div className="timeline-gantt-head"><span>阶段 / 事项</span><div>{labels.map((label) => <small key={label}>{label}</small>)}</div></div>{rows.map((item) => { const left = place(item.start); const end = place(item.end); const width = Math.max(1.4, end - left + 1); const actual = item.actual ? place(item.actual) : null; return <div className="timeline-gantt-row" key={item.id}><div><strong>{item.title}</strong><small>{item.subtitle}</small></div><div className="timeline-gantt-track">{todayPlace >= 0 && todayPlace <= 100 && <i className="timeline-gantt-today" style={{ left: `${todayPlace}%` }} />}<b className={`timeline-gantt-bar ${item.late ? "late" : ""} ${item.progress === 100 ? "done" : ""}`} style={{ left: `${left}%`, width: `${width}%` }}><i style={{ width: `${item.progress}%` }} /></b>{actual !== null && <em className="timeline-gantt-actual" style={{ left: `${actual}%` }} title={`实际完成：${item.actual}`} />}</div></div>; })}<div className="timeline-gantt-legend"><span><i className="done" />完成进度</span><span><i className="late" />延期 / 逾期</span><span><i className="actual" />实际完成日期</span><span><i className="today" />今天</span></div></div>;
}

function ProjectTimelineGantt({ milestones }: { milestones: Milestone[]; tasks?: Task[] }) {
  const rows = milestones.filter((item) => item.plannedDate || item.actualDate);
  const range = useMemo(() => {
    const day = 86_400_000;
    const dates = rows.flatMap((item) => [item.plannedDate, item.actualDate].filter(Boolean).map((date) => new Date(date!).getTime()));
    const min = dates.length ? Math.min(...dates) - day * 45 : Date.now() - day * 30;
    const max = dates.length ? Math.max(...dates) + day * 75 : Date.now() + day * 120;
    return { min, max, span: Math.max(max - min, day) };
  }, [rows.map((item) => `${item.plannedDate ?? ""}-${item.actualDate ?? ""}`).join(",")]);
  const labels = Array.from({ length: 9 }, (_, index) => { const value = new Date(range.min + range.span * index / 8); return `${value.getFullYear()}.${String(value.getMonth() + 1).padStart(2, "0")}`; });
  const place = (date: string) => Math.max(0, Math.min(100, (new Date(date).getTime() - range.min) / range.span * 100));
  const todayPlace = place(today());
  if (!rows.length) return <Empty description="填写固定里程碑的计划日期或实际完成日期后，将生成甘特图" />;
  return <div className="milestone-bar-gantt-scroll"><div className="milestone-bar-gantt"><div className="milestone-bar-gantt-head"><div>固定里程碑</div><div>{labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div></div>{rows.map((item) => {
    const currentStatus = milestoneRuntimeStatus(item);
    const planned = item.plannedDate || item.actualDate!;
    const plannedPosition = place(planned); const actualPosition = item.actualDate ? place(item.actualDate) : plannedPosition;
    const left = Math.min(94, Math.max(2, Math.min(plannedPosition, actualPosition)));
    const width = Math.min(28, Math.max(5.6, item.actualDate ? Math.abs(actualPosition - plannedPosition) + 4.8 : 5.6));
    const tone = currentStatus === "已完成" ? "done" : currentStatus === "进行中" ? "active" : currentStatus === "已延期" ? "late" : "pending";
    const progress = tone === "done" ? 100 : tone === "active" ? 52 : tone === "late" ? 45 : 0;
    const label = tone === "done" ? "已完成" : tone === "active" ? "进行中" : tone === "late" ? "已延期" : "计划任务";
    return <div className="milestone-bar-gantt-row" key={item.id}><div className="milestone-bar-gantt-info"><strong>{item.name}</strong><small>负责人：{item.owner.displayName} · {currentStatus} · 计划 {item.plannedDate || "待填写"}{item.actualDate ? ` · 实际 ${item.actualDate}` : ""}</small></div><div className="milestone-bar-gantt-track">{todayPlace >= 0 && todayPlace <= 100 && <i className="milestone-bar-gantt-today" style={{ left: `${todayPlace}%` }} />}<b className={`milestone-bar-gantt-bar ${tone}`} style={{ left: `${left}%`, width: `${width}%` }} title={`${item.name}：${label}`}><i style={{ width: `${progress}%` }} /><span>{label}</span></b></div></div>;
  })}</div><div className="milestone-bar-gantt-legend"><span><i className="done" />已完成</span><span><i className="active" />进行中（深浅表示完成程度）</span><span><i className="pending" />尚未开始</span><span><i className="late" />已延期</span><span><i className="today" />今日</span></div></div>;
}

export function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const [milestoneOpen, setMilestoneOpen] = useState(false); const [taskOpen, setTaskOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone>(); const [editingTask, setEditingTask] = useState<Task>();
  const milestonesQuery = useQuery({ queryKey: ["milestones", project.id], queryFn: () => api<Milestone[]>(`/projects/${project.id}/milestones`) });
  const tasksQuery = useQuery({ queryKey: ["tasks", project.id], queryFn: () => api<Task[]>(`/projects/${project.id}/tasks`) });
  const governance = useGovernanceData(project.id); const milestones = milestonesQuery.data ?? []; const tasks = tasksQuery.data ?? [];
  const activeTarget = governance.targets.find((item) => item.year === new Date().getFullYear()) ?? governance.targets[0];
  const taskProgress = tasks.length ? Math.round(tasks.reduce((sum, item) => sum + item.progress, 0) / tasks.length) : 0;
  const milestoneTable = <Card bordered={false} title="项目固定里程碑"><Table rowKey="id" dataSource={milestones} pagination={false} scroll={{ x: 850 }} columns={[
    { title: "顺序", dataIndex: "sortOrder", width: 70 }, { title: "里程碑", dataIndex: "name", width: 220 }, { title: "计划日期", dataIndex: "plannedDate", render: (value) => value || "—" }, { title: "实际日期", dataIndex: "actualDate", render: (value) => value || "—" },
    { title: "进度偏差", width: 110, render: (_, item) => dateDifferenceLabel(item) || "—" }, { title: "状态", dataIndex: "status", width: 90, render: (value) => <Tag color={milestoneColors[value]}>{value}</Tag> },
    { title: "操作", width: 90, render: (_, item) => item.canEdit ? <Button type="link" icon={<EditOutlined />} onClick={() => { setEditingMilestone(item); setMilestoneOpen(true); }}>填写日期</Button> : <Typography.Text type="secondary">只读</Typography.Text> },
  ]} /></Card>;
  const taskTable = <Card bordered={false} title="项目事项" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingTask(undefined); setTaskOpen(true); }}>新增事项</Button>}><Table rowKey="id" dataSource={tasks} pagination={false} scroll={{ x: 940 }} columns={[
    { title: "事项", dataIndex: "title", width: 240 }, { title: "阶段", dataIndex: "phaseName", width: 130, render: (value) => value || "—" }, { title: "负责人", dataIndex: "assigneeName", width: 100 }, { title: "计划完成", dataIndex: "dueDate", width: 110, render: (value) => value || "—" }, { title: "状态", dataIndex: "status", width: 90 }, { title: "进度", dataIndex: "progress", width: 150, render: (value) => <Progress percent={value} size="small" /> }, { title: "操作", width: 80, render: (_, item) => item.canEdit ? <Button type="link" onClick={() => { setEditingTask(item); setTaskOpen(true); }}>编辑</Button> : <Typography.Text type="secondary">只读</Typography.Text> },
  ]} /></Card>;
  const report = <><Row gutter={16} className="detail-metrics"><Col span={6}><Card><Statistic title="事项总体进度" value={taskProgress} suffix="%" /><Progress percent={taskProgress} showInfo={false} strokeColor="#0a956d" /></Card></Col><Col span={6}><Card><Statistic title="里程碑完成" value={milestones.filter((item) => milestoneRuntimeStatus(item) === "已完成").length} suffix={`/ ${milestones.length || 12}`} /></Card></Col><Col span={6}><Card><Statistic title="年度目标" value={activeTarget?.targetEnrollment ?? 0} suffix="例" /></Card></Col><Col span={6}><Card><Statistic title="已入组 / 当前在组" value={`${activeTarget?.enrolledCount ?? 0} / ${activeTarget?.activeCount ?? 0}`} suffix="例" /></Card></Col></Row><ProjectResearchSummary project={project} /><GovernanceSummary data={governance} /><Card className="report-card" title="近期工作与进度">{tasks.length ? tasks.slice(0, 5).map((task) => <div className="report-task" key={task.id}><div><strong>{task.title}</strong><small>{task.assigneeName} · {task.dueDate || "未设置日期"}</small></div><Progress percent={task.progress} size="small" style={{ width: 180 }} /></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无事项" />}</Card></>;
  return <><Button className="back-button" type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>返回项目汇报</Button><div className="project-hero-live"><div><span className="project-hero-code">{project.projectCode} · 项目资料维护</span><Typography.Title level={2}>{project.name}</Typography.Title><Space wrap><Tag>{project.grade}</Tag><Tag>{project.diseaseType}</Tag><Tag>{project.status}</Tag></Space></div><div className="project-hero-owner"><small>项目负责人</small><strong>{project.responsiblePerson}</strong><span>编辑权限：{project.owner.displayName}</span><Button className="hero-print-button" ghost icon={<PrinterOutlined />} onClick={() => window.print()}>打印 / 导出 PDF</Button></div></div><Tabs className="project-tabs" defaultActiveKey="report" items={[{ key: "report", label: "汇报总览", children: report }, { key: "milestones", label: `里程碑 ${milestones.length}`, children: milestoneTable }, { key: "research", label: "研究与执行", children: <ProjectResearchPanel project={project} /> }, { key: "tasks", label: `事项 ${tasks.length}`, children: taskTable }, { key: "targets-budget", label: "目标与预算", children: <GovernancePanel projectId={project.id} data={governance} /> }, { key: "gantt", label: <Space><CalendarOutlined />甘特图</Space>, children: <Card bordered={false} title="项目计划与实际进度" extra={<Button icon={<PrinterOutlined />} onClick={() => window.print()}>打印</Button>}><ProjectTimelineGantt milestones={milestones} tasks={tasks} /></Card> }, { key: "attachments", label: "项目文件", children: <AttachmentsPanel projectId={project.id} /> }, { key: "audit", label: "修改记录", children: <AuditPanel projectId={project.id} /> }, { key: "import-source", label: "原表字段", children: <ImportSourcePanel projectId={project.id} /> }]} /><MilestoneModal item={editingMilestone} open={milestoneOpen} onClose={() => { setMilestoneOpen(false); setEditingMilestone(undefined); }} /><TaskModal projectId={project.id} item={editingTask} open={taskOpen} onClose={() => { setTaskOpen(false); setEditingTask(undefined); }} /></>;
}

function TaskModal({ projectId, item, open, onClose }: { projectId: string; item?: Task; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      item
        ? api<Task>(`/tasks/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...values, version: item.version }) })
        : api<Task>(`/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      message.success(item ? "事项已更新" : "事项已创建");
      await queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      onClose();
    },
    onError: (error) => message.error((error as Error).message),
  });

  return (
    <Modal open={open} width={680} title={item ? "编辑事项" : "新增事项"} okText="保存" cancelText="取消" confirmLoading={mutation.isPending} onCancel={onClose} onOk={() => form.submit()} destroyOnHidden afterOpenChange={(visible) => { if (visible) { form.resetFields(); form.setFieldsValue(item ?? { status: "未开始", priority: "中", progress: 0 }); } }}>
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Form.Item name="title" label="事项名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Row gutter={14}>
          <Col span={12}><Form.Item name="phaseName" label="所属阶段"><Input placeholder="例如：启动准备、入组随访" /></Form.Item></Col>
          <Col span={12}><Form.Item name="assigneeName" label="负责人" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={6}><Form.Item name="priority" label="优先级"><Select options={["低", "中", "高", "紧急"].map((value) => ({ value }))} /></Form.Item></Col>
          <Col span={6}><Form.Item name="status" label="状态"><Select options={["未开始", "进行中", "已阻塞", "已完成", "已取消"].map((value) => ({ value }))} /></Form.Item></Col>
          <Col span={8}><Form.Item name="startDate" label="开始日期"><Input type="date" /></Form.Item></Col>
          <Col span={8}><Form.Item name="dueDate" label="计划完成日期"><Input type="date" /></Form.Item></Col>
          <Col span={8}><Form.Item name="progress" label="完成进度"><InputNumber min={0} max={100} precision={0} addonAfter="%" style={{ width: "100%" }} /></Form.Item></Col>
        </Row>
        <Form.Item name="notes" label="备注"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>
  );
}

function CenterModal({ projectId, item, open, onClose }: { projectId: string; item?: ResearchCenter; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => item
      ? api<ResearchCenter>(`/centers/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...values, version: item.version }) })
      : api<ResearchCenter>(`/projects/${projectId}/centers`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      message.success(item ? "研究中心已更新" : "研究中心已创建");
      await queryClient.invalidateQueries({ queryKey: ["centers", projectId] });
      onClose();
    },
    onError: (error) => message.error((error as Error).message),
  });
  return <Modal open={open} width={720} title={item ? "编辑研究中心" : "新增研究中心"} okText="保存" cancelText="取消" confirmLoading={mutation.isPending} onCancel={onClose} onOk={() => form.submit()} destroyOnHidden afterOpenChange={(visible) => { if (visible) { form.resetFields(); form.setFieldsValue(item ?? { stage: "待启动", plannedEnrollment: 0, enrolledCount: 0, activeCount: 0, followupCompleteCount: 0 }); } }}>
    <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
      <Row gutter={14}>
        <Col span={8}><Form.Item name="centerCode" label="中心编码"><Input /></Form.Item></Col>
        <Col span={16}><Form.Item name="name" label="中心名称" rules={[{ required: true }]}><Input /></Form.Item></Col>
        <Col span={8}><Form.Item name="province" label="省份"><Input /></Form.Item></Col>
        <Col span={8}><Form.Item name="principalInvestigator" label="中心 PI"><Input /></Form.Item></Col>
        <Col span={8}><Form.Item name="stage" label="中心阶段"><Select options={["待启动", "启动中", "已启动", "入组中", "随访中", "已关闭"].map((value) => ({ value }))} /></Form.Item></Col>
        <Col span={6}><Form.Item name="plannedEnrollment" label="计划例数"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={6}><Form.Item name="enrolledCount" label="已入组"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={6}><Form.Item name="activeCount" label="当前在组"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={6}><Form.Item name="followupCompleteCount" label="完成随访"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
      </Row>
    </Form>
  </Modal>;
}

function SnapshotModal({ projectId, item, open, onClose }: { projectId: string; item?: EnrollmentSnapshot; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => item
      ? api<EnrollmentSnapshot>(`/enrollment-snapshots/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...values, version: item.version }) })
      : api<EnrollmentSnapshot>(`/projects/${projectId}/enrollment-snapshots`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      message.success(item ? "入组快照已更新" : "入组快照已记录");
      await queryClient.invalidateQueries({ queryKey: ["snapshots", projectId] });
      onClose();
    },
    onError: (error) => message.error((error as Error).message),
  });
  return <Modal open={open} width={620} title={item ? "编辑入组快照" : "记录入组快照"} okText="保存" cancelText="取消" confirmLoading={mutation.isPending} onCancel={onClose} onOk={() => form.submit()} destroyOnHidden afterOpenChange={(visible) => { if (visible) { form.resetFields(); form.setFieldsValue(item ?? { snapshotDate: new Date().toISOString().slice(0, 10), enrolledCount: 0, activeCount: 0, followupCompleteCount: 0 }); } }}>
    <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
      <Row gutter={14}>
        <Col span={12}><Form.Item name="snapshotDate" label="统计日期" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
        <Col span={12}><Form.Item name="enrolledCount" label="累计入组" rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={12}><Form.Item name="activeCount" label="当前在组"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={12}><Form.Item name="followupCompleteCount" label="完成随访"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
      </Row>
      <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
    </Form>
  </Modal>;
}

function EnrollmentTrend({ snapshots, target }: { snapshots: EnrollmentSnapshot[]; target: number }) {
  if (!snapshots.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="记录入组快照后将形成趋势图" />;
  const width = 760;
  const height = 240;
  const padding = { left: 44, right: 18, top: 20, bottom: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(target, ...snapshots.flatMap((item) => [item.enrolledCount, item.activeCount, item.followupCompleteCount]), 1);
  const point = (value: number, index: number) => {
    const x = padding.left + (snapshots.length === 1 ? chartWidth / 2 : chartWidth * index / (snapshots.length - 1));
    const y = padding.top + chartHeight - value / maxValue * chartHeight;
    return `${x},${y}`;
  };
  const series = [
    { key: "enrolledCount" as const, label: "累计入组", color: "#08765a" },
    { key: "activeCount" as const, label: "当前在组", color: "#2f86a6" },
    { key: "followupCompleteCount" as const, label: "完成随访", color: "#d69732" },
  ];
  return <div className="trend-chart-wrap">
    <div className="trend-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="入组趋势图">
      {[0, .25, .5, .75, 1].map((ratio) => { const y = padding.top + chartHeight - ratio * chartHeight; return <g key={ratio}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="trend-grid" /><text x={padding.left - 8} y={y + 4} textAnchor="end" className="trend-axis-text">{Math.round(maxValue * ratio)}</text></g>; })}
      {series.map((item) => <polyline key={item.key} points={snapshots.map((snapshot, index) => point(snapshot[item.key], index)).join(" ")} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
      {snapshots.map((snapshot, index) => { const [x] = point(snapshot.enrolledCount, index).split(","); return <text key={snapshot.id} x={x} y={height - 12} textAnchor="middle" className="trend-axis-text">{snapshot.snapshotDate.slice(5)}</text>; })}
    </svg>
  </div>;
}

function Gantt({ tasks }: { tasks: Task[] }) {
  const scheduled = tasks.filter((task) => task.startDate && task.dueDate);
  const range = useMemo(() => {
    if (!scheduled.length) return null;
    const dates = scheduled.flatMap((task) => [new Date(task.startDate!).getTime(), new Date(task.dueDate!).getTime()]);
    const day = 86_400_000;
    const min = Math.min(...dates) - day * 3;
    const max = Math.max(...dates) + day * 3;
    return { min, max, span: Math.max(max - min, day) };
  }, [scheduled]);

  if (!range) return <Empty description="事项填写开始和完成日期后，将自动生成甘特图" />;
  const labels = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(range.min + (range.span * index) / 5);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
  const todayLeft = ((Date.now() - range.min) / range.span) * 100;

  return (
    <div className="gantt-shell">
      <div className="gantt-header"><div>事项 / 负责人</div><div className="gantt-month-labels">{labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div></div>
      {scheduled.map((task) => {
        const left = ((new Date(task.startDate!).getTime() - range.min) / range.span) * 100;
        const width = Math.max(((new Date(task.dueDate!).getTime() - new Date(task.startDate!).getTime()) / range.span) * 100, 2);
        return <div className="gantt-task-row" key={task.id}>
          <div className="gantt-task-label"><strong>{task.title}</strong><small>{task.assigneeName} · {task.status} · {task.progress}%</small></div>
          <div className="gantt-track">
            {todayLeft >= 0 && todayLeft <= 100 && <span className="gantt-today-line" style={{ left: `${todayLeft}%` }} />}
            <div className={`gantt-task-bar ${task.status === "已阻塞" ? "blocked" : task.status === "已完成" ? "done" : ""}`} style={{ left: `${left}%`, width: `${width}%` }}><i style={{ width: `${task.progress}%` }} /><span>{task.progress}%</span></div>
          </div>
        </div>;
      })}
    </div>
  );
}

function LegacyProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone>();
  const [editingTask, setEditingTask] = useState<Task>();
  const [centerOpen, setCenterOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<ResearchCenter>();
  const [editingSnapshot, setEditingSnapshot] = useState<EnrollmentSnapshot>();
  const milestonesQuery = useQuery({ queryKey: ["milestones", project.id], queryFn: () => api<Milestone[]>(`/projects/${project.id}/milestones`) });
  const tasksQuery = useQuery({ queryKey: ["tasks", project.id], queryFn: () => api<Task[]>(`/projects/${project.id}/tasks`) });
  const centersQuery = useQuery({ queryKey: ["centers", project.id], queryFn: () => api<ResearchCenter[]>(`/projects/${project.id}/centers`) });
  const snapshotsQuery = useQuery({ queryKey: ["snapshots", project.id], queryFn: () => api<EnrollmentSnapshot[]>(`/projects/${project.id}/enrollment-snapshots`) });
  const governance = useGovernanceData(project.id);
  const milestones = milestonesQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const centers = centersQuery.data ?? [];
  const snapshots = snapshotsQuery.data ?? [];
  const completedTasks = tasks.filter((task) => task.status === "已完成").length;
  const blockedTasks = tasks.filter((task) => task.status === "已阻塞").length;
  const latestEnrollment = snapshots.length ? snapshots[snapshots.length - 1].enrolledCount : project.enrolledCount;
  const enrollment = project.plannedEnrollment ? Math.round(latestEnrollment / project.plannedEnrollment * 100) : 0;
  const overallProgress = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length) : 0;
  const centerTotals = centers.reduce((total, center) => ({
    planned: total.planned + center.plannedEnrollment,
    enrolled: total.enrolled + center.enrolledCount,
    active: total.active + center.activeCount,
    followup: total.followup + center.followupCompleteCount,
  }), { planned: 0, enrolled: 0, active: 0, followup: 0 });

  const openMilestone = (item?: Milestone) => { setEditingMilestone(item); setMilestoneOpen(true); };
  const openTask = (item?: Task) => { setEditingTask(item); setTaskOpen(true); };
  const openCenter = (item?: ResearchCenter) => { setEditingCenter(item); setCenterOpen(true); };
  const openSnapshot = (item?: EnrollmentSnapshot) => { setEditingSnapshot(item); setSnapshotOpen(true); };

  const report = <>
    <Row gutter={16} className="detail-metrics">
      <Col span={6}><Card><Statistic title="总体事项进度" value={overallProgress} suffix="%" /><Progress percent={overallProgress} showInfo={false} strokeColor="#0a956d" /></Card></Col>
      <Col span={6}><Card><Statistic title="里程碑完成" value={milestones.filter((item) => item.status === "已完成").length} suffix={`/ ${milestones.length}`} /></Card></Col>
      <Col span={6}><Card><Statistic title="入组进度" value={enrollment} suffix="%" /><Typography.Text type="secondary">{latestEnrollment} / {project.plannedEnrollment} 例</Typography.Text></Card></Col>
      <Col span={6}><Card><Statistic title="待办 / 阻塞" value={tasks.length - completedTasks} suffix={` / ${blockedTasks}`} /></Card></Col>
    </Row>
    <Card className="report-card" title={<Space><FlagOutlined />关键里程碑路线图</Space>}>
      {milestones.length ? <div className="milestone-track-live">{milestones.map((item, index) => <div className={`milestone-live ${item.status === "已完成" ? "done" : item.status === "进行中" || item.status === "已延期" ? "current" : ""}`} key={item.id}><span className="milestone-live-dot">{item.status === "已完成" ? <CheckCircleFilled /> : index + 1}</span><strong>{item.name}</strong><small>计划：{item.plannedDate || "待填写"}</small><small>实际：{item.actualDate || "未完成"}</small></div>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="正在加载固定里程碑" />}
    </Card>
    <Row gutter={16}>
      <Col span={15}><Card className="report-card" title="近期工作与进度">{tasks.length ? tasks.slice(0, 5).map((task) => <div className="report-task" key={task.id}><div><strong>{task.title}</strong><small>{task.assigneeName} · {task.dueDate || "未设置日期"}</small></div><Progress percent={task.progress} size="small" style={{ width: 180 }} /></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无事项" />}</Card></Col>
      <Col span={9}><Card className="report-card" title="汇报摘要"><Typography.Paragraph>{project.summary || "项目尚未填写汇报摘要。可在项目编辑中补充项目简介。"}</Typography.Paragraph>{blockedTasks > 0 ? <Alert type="warning" showIcon message={`${blockedTasks} 项工作处于阻塞状态`} /> : <Alert type="success" showIcon message="当前无阻塞事项" />}</Card></Col>
    </Row>
    <Card className="report-card" title="入组与随访趋势" extra={<Button type="link" onClick={() => openSnapshot()}>记录快照</Button>}>
      <EnrollmentTrend snapshots={snapshots} target={project.plannedEnrollment} />
    </Card>
    <GovernanceSummary data={governance} />
  </>;

  const milestoneTable = <Card bordered={false} title="项目固定里程碑"><Table rowKey="id" dataSource={milestones} pagination={false} columns={[
    { title: "顺序", dataIndex: "sortOrder", width: 70 }, { title: "里程碑", dataIndex: "name" },
    { title: "计划日期", dataIndex: "plannedDate", render: (value) => value || "—" }, { title: "实际日期", dataIndex: "actualDate", render: (value) => value || "—" },
    { title: "进度偏差", width: 110, render: (_, item) => dateDifferenceLabel(item) || "—" },
    { title: "状态", dataIndex: "status", render: (value) => <Tag color={milestoneColors[value]}>{value}</Tag> }, { title: "创建人", render: (_, item) => item.owner.displayName },
    { title: "操作", render: (_, item) => item.canEdit ? <Button type="link" icon={<EditOutlined />} onClick={() => openMilestone(item)}>编辑</Button> : <Typography.Text type="secondary">只读</Typography.Text> },
  ]} /></Card>;

  const taskTable = <Card bordered={false} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openTask()}>新增事项</Button>}><Table rowKey="id" dataSource={tasks} scroll={{ x: 900 }} columns={[
    { title: "事项", dataIndex: "title", width: 220 }, { title: "阶段", dataIndex: "phaseName", width: 120, render: (value) => value || "—" }, { title: "负责人", dataIndex: "assigneeName", width: 100 },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <Tag color={taskColors[value]}>{value}</Tag> },
    { title: "优先级", dataIndex: "priority", width: 85 }, { title: "计划日期", width: 190, render: (_, item) => `${item.startDate || "—"} 至 ${item.dueDate || "—"}` },
    { title: "进度", dataIndex: "progress", width: 140, render: (value) => <Progress percent={value} size="small" /> }, { title: "创建人", width: 100, render: (_, item) => item.owner.displayName },
    { title: "操作", fixed: "right", width: 90, render: (_, item) => item.canEdit ? <Button type="link" icon={<EditOutlined />} onClick={() => openTask(item)}>编辑</Button> : <Typography.Text type="secondary">只读</Typography.Text> },
  ]} /></Card>;

  const centerPanel = <>
    <Row gutter={16} className="detail-metrics">
      <Col span={6}><Card><Statistic title="研究中心" value={centers.length} suffix={`/ ${project.plannedCenterCount}`} /></Card></Col>
      <Col span={6}><Card><Statistic title="中心计划例数" value={centerTotals.planned} /></Card></Col>
      <Col span={6}><Card><Statistic title="中心累计入组" value={centerTotals.enrolled} /><Typography.Text type="secondary">当前在组 {centerTotals.active}</Typography.Text></Card></Col>
      <Col span={6}><Card><Statistic title="完成随访" value={centerTotals.followup} /></Card></Col>
    </Row>
    <Card className="report-card" title="入组趋势" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openSnapshot()}>记录快照</Button>}>
      <EnrollmentTrend snapshots={snapshots} target={project.plannedEnrollment} />
    </Card>
    <Card bordered={false} title="研究中心进度" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openCenter()}>新增中心</Button>}>
      <Table rowKey="id" dataSource={centers} scroll={{ x: 1050 }} columns={[
        { title: "中心编码", dataIndex: "centerCode", width: 110, render: (value) => value || "—" },
        { title: "中心名称", dataIndex: "name", width: 230 },
        { title: "省份", dataIndex: "province", width: 90, render: (value) => value || "—" },
        { title: "中心 PI", dataIndex: "principalInvestigator", width: 110, render: (value) => value || "—" },
        { title: "阶段", dataIndex: "stage", width: 100, render: (value) => <Tag color={value === "入组中" ? "green" : value === "已关闭" ? "default" : "blue"}>{value}</Tag> },
        { title: "入组", width: 145, render: (_, item) => <span>{item.enrolledCount} / {item.plannedEnrollment}</span> },
        { title: "在组", dataIndex: "activeCount", width: 70 },
        { title: "完成随访", dataIndex: "followupCompleteCount", width: 90 },
        { title: "创建人", width: 100, render: (_, item) => item.owner.displayName },
        { title: "操作", fixed: "right", width: 90, render: (_, item) => item.canEdit ? <Button type="link" icon={<EditOutlined />} onClick={() => openCenter(item)}>编辑</Button> : <Typography.Text type="secondary">只读</Typography.Text> },
      ]} />
      {snapshots.length > 0 && <div className="snapshot-history"><Typography.Text type="secondary">历史快照：</Typography.Text>{snapshots.map((item) => <Button key={item.id} size="small" type="text" disabled={!item.canEdit} onClick={() => openSnapshot(item)}>{item.snapshotDate} · {item.enrolledCount}例</Button>)}</div>}
    </Card>
  </>;

  return <>
    <Button className="back-button" type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>返回全部项目</Button>
    <div className="project-hero-live">
      <div><span className="project-hero-code">{project.projectCode} · 项目汇报总览</span><Typography.Title level={2}>{project.name}</Typography.Title><Space wrap><Tag>{project.grade}</Tag><Tag>{project.diseaseType}</Tag><Tag>{project.status}</Tag><Tag>{project.currentStage || "阶段待确认"}</Tag></Space></div>
      <div className="project-hero-owner"><small>项目负责人</small><strong>{project.responsiblePerson}</strong><span>编辑权限：{project.owner.displayName}</span><Button className="hero-print-button" ghost icon={<PrinterOutlined />} onClick={() => window.print()}>打印 / 导出PDF</Button></div>
    </div>
    <Tabs className="project-tabs" defaultActiveKey="report" items={[
      { key: "report", label: "汇报总览", children: report },
      { key: "milestones", label: `里程碑 ${milestones.length}`, children: milestoneTable },
      { key: "tasks", label: `事项 ${tasks.length}`, children: taskTable },
      { key: "centers", label: `中心与入组 ${centers.length}`, children: centerPanel },
      { key: "governance", label: "风险、目标与预算", children: <GovernancePanel projectId={project.id} data={governance} /> },
      { key: "gantt", label: <Space><CalendarOutlined />甘特图</Space>, children: <Card bordered={false} title="项目进度与甘特图" extra={<Button icon={<PrinterOutlined />} onClick={() => window.print()}>打印</Button>}><Gantt tasks={tasks} /></Card> },
      { key: "attachments", label: "项目文件", children: <AttachmentsPanel projectId={project.id} /> },
      { key: "audit", label: "修改记录", children: <AuditPanel projectId={project.id} /> },
      { key: "import-source", label: "原表字段", children: <ImportSourcePanel projectId={project.id} /> },
    ]} />
  <MilestoneModal item={editingMilestone} open={milestoneOpen} onClose={() => { setMilestoneOpen(false); setEditingMilestone(undefined); }} />
    <TaskModal projectId={project.id} item={editingTask} open={taskOpen} onClose={() => { setTaskOpen(false); setEditingTask(undefined); }} />
    <CenterModal projectId={project.id} item={editingCenter} open={centerOpen} onClose={() => { setCenterOpen(false); setEditingCenter(undefined); }} />
    <SnapshotModal projectId={project.id} item={editingSnapshot} open={snapshotOpen} onClose={() => { setSnapshotOpen(false); setEditingSnapshot(undefined); }} />
  </>;
}
