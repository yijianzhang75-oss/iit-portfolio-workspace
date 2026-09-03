import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Form, Input, InputNumber, Modal, Select, message } from "antd";
import { api } from "./api";
import { GovernancePanel, useGovernanceData } from "./GovernancePanel";
import { AttachmentsPanel, AuditPanel, ImportSourcePanel } from "./ProjectRecordsPanel";
import type { Milestone, Project, ProjectReport } from "./types";
import { dateDifferenceLabel, milestoneRuntimeStatus, today } from "./project-progress";
import "./project-workspace.css";

type WorkspaceData = {
  milestones: Milestone[];
};

type Section = "overview" | "milestones" | "governance" | "gantt" | "files" | "history" | "source";

function formatDate(value?: string | null) {
  return value ? value.replace(/(\d{4})-(\d{2})-(\d{2})/, "$1.$2.$3") : "待填写";
}

function MilestoneBatchEditor({ projectId, milestones }: { projectId: string; milestones: Milestone[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, { plannedDate: string; actualDate: string }>>({});
  useEffect(() => {
    setDraft(Object.fromEntries(milestones.map((item) => [item.id, { plannedDate: item.plannedDate ?? "", actualDate: item.actualDate ?? "" }])));
  }, [milestones]);
  const changed = milestones.filter((item) => {
    const value = draft[item.id];
    return value && (value.plannedDate !== (item.plannedDate ?? "") || value.actualDate !== (item.actualDate ?? ""));
  });
  const save = useMutation({
    mutationFn: () => Promise.all(changed.map((item) => api<Milestone>(`/milestones/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ plannedDate: draft[item.id].plannedDate || null, actualDate: draft[item.id].actualDate || null, version: item.version }),
    }))),
    onSuccess: async () => {
      message.success(`已保存 ${changed.length} 个里程碑`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["demo-workspace"] }),
        queryClient.invalidateQueries({ queryKey: ["milestones", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["audit", projectId] }),
      ]);
    },
    onError: (error) => message.error((error as Error).message),
  });
  const plannedCount = milestones.filter((item) => item.plannedDate).length;
  const actualCount = milestones.filter((item) => item.actualDate).length;
  return <Card className="project-workspace-card" title="固定 12 个研究里程碑" extra={<div className="milestone-batch-summary"><span>计划 {plannedCount}/12</span><span>实际 {actualCount}/12</span><Button type="primary" disabled={!changed.length} loading={save.isPending} onClick={() => save.mutate()}>保存全部修改{changed.length ? `（${changed.length}）` : ""}</Button></div>}>
    <p className="workspace-help">只填写计划日期和实际完成日期，状态与延期情况由系统自动识别。点击一次“保存全部修改”即可完成本页填写。</p>
    <div className="milestone-batch-table"><div className="milestone-batch-head"><span>里程碑</span><span>计划日期</span><span>实际日期</span><span>状态</span><span>偏差</span></div>
      {milestones.map((item) => {
        const value = draft[item.id] ?? { plannedDate: item.plannedDate ?? "", actualDate: item.actualDate ?? "" };
        const preview = { ...item, plannedDate: value.plannedDate || null, actualDate: value.actualDate || null };
        const status = milestoneRuntimeStatus(preview);
        return <div className="milestone-batch-row" key={item.id}>
          <strong>{item.sortOrder / 10}. {item.name}</strong>
          <input aria-label={`${item.name}计划日期`} type="date" value={value.plannedDate} disabled={!item.canEdit} onChange={(event) => setDraft((old) => ({ ...old, [item.id]: { ...value, plannedDate: event.target.value } }))} />
          <input aria-label={`${item.name}实际日期`} type="date" value={value.actualDate} disabled={!item.canEdit} onChange={(event) => setDraft((old) => ({ ...old, [item.id]: { ...value, actualDate: event.target.value } }))} />
          <span className={`milestone-status ${status === "已完成" ? "done" : status === "已延期" ? "late" : status === "进行中" ? "active" : "pending"}`}>{status}</span>
          <small>{dateDifferenceLabel(preview)}</small>
        </div>;
      })}
    </div>
    {!milestones.some((item) => item.canEdit) && <p className="workspace-readonly">此项目暂时由创建者维护，您可查看全部信息。</p>}
  </Card>;
}

function MilestoneGantt({ milestones }: { milestones: Milestone[] }) {
  const rows = useMemo(() => {
    const dated = milestones.flatMap((item) => [item.plannedDate, item.actualDate]).filter(Boolean) as string[];
    const base = dated.length ? new Date(`${dated.sort()[0]}T00:00:00`) : new Date();
    const end = new Date(base); end.setMonth(end.getMonth() + 18);
    const startMs = base.getTime(); const span = Math.max(1, end.getTime() - startMs);
    const firstOpen = milestones.findIndex((item) => !item.actualDate);
    const mapDate = (value: Date) => Math.max(0, Math.min(100, (value.getTime() - startMs) / span * 100));
    return { base, end, startMs, span, mapDate, items: milestones.map((item, index) => {
      const previous = index > 0 ? milestones[index - 1] : undefined;
      const startText = previous?.actualDate || previous?.plannedDate || item.plannedDate || item.actualDate;
      const endText = item.actualDate || item.plannedDate;
      const itemStart = startText ? new Date(`${startText}T00:00:00`) : undefined;
      const itemEnd = endText ? new Date(`${endText}T00:00:00`) : undefined;
      const status = item.actualDate ? "done" : item.plannedDate && item.plannedDate < today() ? "late" : index === firstOpen && itemStart && itemStart <= new Date() ? "active" : "pending";
      const left = itemStart ? mapDate(itemStart) : 0;
      const width = itemStart && itemEnd ? Math.max(3, mapDate(itemEnd) - left) : 0;
      const nowProgress = status === "active" && itemStart && itemEnd ? Math.max(8, Math.min(100, (Date.now() - itemStart.getTime()) / Math.max(1, itemEnd.getTime() - itemStart.getTime()) * 100)) : 0;
      return { item, status, left, width, nowProgress, date: endText };
    }) };
  }, [milestones]);
  const months = Array.from({ length: 7 }, (_, index) => { const date = new Date(rows.base); date.setMonth(date.getMonth() + index * 3); return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`; });
  const nowLeft = rows.mapDate(new Date());
  return <Card className="project-workspace-card" title="项目计划与实际进度" extra={<span className="gantt-legend"><i className="done" />已完成 <i className="active" />进行中 <i className="pending" />待开始 <i className="late" />已延期</span>}>
    <p className="workspace-help">条形长度反映相邻里程碑间的计划或实际周期；进行中的橙色条用深浅显示时间进度，不虚构人工完成百分比。</p>
    <div className="milestone-gantt"><div className="gantt-heading"><span>固定里程碑</span><div>{months.map((month) => <b key={month}>{month}</b>)}</div></div><div className="gantt-body"><div className="gantt-today" style={{ left: `calc(270px + (100% - 270px) * ${nowLeft / 100})` }}><em>今天</em></div>{rows.items.map(({ item, status, left, width, nowProgress, date }) => <div className="gantt-row" key={item.id}><div><strong>{item.name}</strong><small>{date ? formatDate(date) : "待排期"}</small></div><div className="gantt-track">{width > 0 ? <span className={`gantt-bar ${status}`} style={{ left: `${left}%`, width: `${width}%` }}>{status === "active" && <i style={{ width: `${nowProgress}%` }} />}{status === "done" ? "已完成" : status === "late" ? "已延期" : status === "active" ? "进行中" : "计划任务"}</span> : <span className="gantt-unplanned">待排期</span>}</div></div>)}</div></div>
  </Card>;
}

function MilestoneGanttAligned({ milestones }: { milestones: Milestone[] }) {
  const timeline = useMemo(() => {
    const day = 86_400_000;
    const parsedDates = milestones.flatMap((item) => [item.plannedDate, item.actualDate]).filter(Boolean).map((value) => new Date(`${value}T00:00:00`).getTime());
    const earliest = parsedDates.length ? Math.min(...parsedDates) : Date.now();
    const latest = parsedDates.length ? Math.max(...parsedDates) : earliest + 180 * day;
    const startMs = earliest - 21 * day;
    const endMs = Math.max(latest + 45 * day, startMs + 180 * day);
    const span = endMs - startMs;
    const position = (value: number) => Math.max(0, Math.min(100, (value - startMs) / span * 100));
    const firstOpen = milestones.findIndex((item) => !item.actualDate);
    const items = milestones.map((item, index) => {
      const previous = index > 0 ? milestones[index - 1] : undefined;
      const endText = item.actualDate || item.plannedDate;
      const previousText = previous?.actualDate || previous?.plannedDate;
      const endValue = endText ? new Date(`${endText}T00:00:00`).getTime() : undefined;
      const startValue = previousText ? new Date(`${previousText}T00:00:00`).getTime() : endValue ? endValue - 14 * day : undefined;
      const status = item.actualDate ? "done" : item.plannedDate && item.plannedDate < today() ? "late" : index === firstOpen && startValue && startValue <= Date.now() ? "active" : "pending";
      const left = startValue === undefined ? 0 : position(startValue);
      const naturalWidth = startValue === undefined || endValue === undefined ? 0 : position(endValue) - left;
      const width = naturalWidth > 0 ? Math.max(1.8, naturalWidth) : 0;
      const elapsed = status === "active" && startValue && endValue ? Math.max(5, Math.min(100, (Date.now() - startValue) / Math.max(day, endValue - startValue) * 100)) : 0;
      return { item, status, left, width, elapsed, endText };
    });
    const ticks = Array.from({ length: 7 }, (_, index) => {
      const value = startMs + span * index / 6;
      const date = new Date(value);
      return { label: `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`, left: index / 6 * 100, edge: index === 0 ? "first" : index === 6 ? "last" : "" };
    });
    return { items, ticks, nowLeft: position(Date.now()) };
  }, [milestones]);
  return <Card className="project-workspace-card" title="项目计划与实际进度" extra={<span className="gantt-legend"><i className="done" />已完成 <i className="active" />进行中 <i className="pending" />待开始 <i className="late" />已延期</span>}>
    <p className="workspace-help">表头日期、纵向网格、今天线和任务条使用同一时间坐标；短周期任务不强行显示文字，可将鼠标放到条形上查看状态。</p>
    <div className="milestone-gantt aligned"><div className="gantt-heading"><span>固定里程碑</span><div>{timeline.ticks.map((tick) => <b className={tick.edge} key={`${tick.label}-${tick.left}`} style={{ left: `${tick.left}%` }}>{tick.label}</b>)}</div></div><div className="gantt-body">{timeline.nowLeft >= 0 && timeline.nowLeft <= 100 && <div className="gantt-today" style={{ left: `calc(270px + (100% - 270px) * ${timeline.nowLeft / 100})` }}><em>今天</em></div>}{timeline.items.map(({ item, status, left, width, elapsed, endText }) => <div className="gantt-row" key={item.id}><div><strong>{item.name}</strong><small>{item.actualDate ? `实际 ${formatDate(item.actualDate)}` : item.plannedDate ? `计划 ${formatDate(item.plannedDate)}` : "待排期"}</small></div><div className="gantt-track">{width > 0 ? <span className={`gantt-bar ${status}`} style={{ left: `${left}%`, width: `${width}%` }} title={`${item.name} · ${status === "done" ? "已完成" : status === "late" ? "已延期" : status === "active" ? "进行中" : "计划任务"} · ${endText ?? "待排期"}`}>{status === "active" && <i style={{ width: `${elapsed}%` }} />}{width >= 7 ? status === "done" ? "已完成" : status === "late" ? "已延期" : status === "active" ? "进行中" : "计划任务" : ""}</span> : <span className="gantt-unplanned">待排期</span>}</div></div>)}</div></div>
  </Card>;
}

function MilestoneStageGantt({ milestones }: { milestones: Milestone[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timeline = useMemo(() => {
    const day = 86_400_000;
    const monthWidth = 104;
    const leftWidth = 410;
    const parse = (value: string) => new Date(`${value}T00:00:00`).getTime();
    const dateValues = milestones.flatMap((item) => [item.plannedDate, item.actualDate]).filter(Boolean).map((value) => parse(value as string));
    const now = new Date();
    const earliest = Math.min(Date.now(), ...(dateValues.length ? dateValues : [Date.now()]));
    const latest = Math.max(Date.now(), ...(dateValues.length ? dateValues : [Date.now()]));
    const start = new Date(earliest);
    start.setDate(1);
    start.setMonth(start.getMonth() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(latest);
    end.setDate(1);
    end.setMonth(end.getMonth() + 2);
    end.setHours(0, 0, 0, 0);
    const months: Date[] = [];
    for (const cursor = new Date(start); cursor < end; cursor.setMonth(cursor.getMonth() + 1)) months.push(new Date(cursor));
    const timelineWidth = months.length * monthWidth;
    const span = Math.max(day, end.getTime() - start.getTime());
    const position = (value: number) => Math.max(0, Math.min(timelineWidth, (value - start.getTime()) / span * timelineWidth));
    const firstOpen = milestones.findIndex((item) => !item.actualDate);
    const items = milestones.map((item, index) => {
      const previous = index > 0 ? milestones[index - 1] : undefined;
      const planValue = item.plannedDate ? parse(item.plannedDate) : undefined;
      const actualValue = item.actualDate ? parse(item.actualDate) : undefined;
      const previousValue = previous?.actualDate ? parse(previous.actualDate) : previous?.plannedDate ? parse(previous.plannedDate) : undefined;
      const status = actualValue !== undefined ? "done" : planValue !== undefined && planValue < Date.now() ? "late" : index === firstOpen && planValue !== undefined ? "active" : "pending";
      const fallbackEnd = actualValue ?? planValue;
      const startValue = previousValue ?? (fallbackEnd !== undefined ? fallbackEnd - 21 * day : undefined);
      const endValue = status === "late" ? Date.now() : fallbackEnd;
      const left = startValue === undefined || endValue === undefined ? 0 : position(Math.min(startValue, endValue));
      const naturalWidth = startValue === undefined || endValue === undefined ? 0 : Math.abs(position(endValue) - position(startValue));
      const width = naturalWidth > 0 ? Math.max(34, naturalWidth) : 0;
      const elapsed = status === "active" && startValue !== undefined && planValue !== undefined
        ? Math.max(0, Math.min(100, (Date.now() - startValue) / Math.max(day, planValue - startValue) * 100))
        : 0;
      const plannedDiff = planValue !== undefined && actualValue !== undefined ? Math.round((actualValue - planValue) / day) : undefined;
      const overdueDays = planValue !== undefined && status === "late" ? Math.max(1, Math.floor((Date.now() - planValue) / day)) : undefined;
      const remainingDays = planValue !== undefined && status === "active" ? Math.max(0, Math.ceil((planValue - Date.now()) / day)) : undefined;
      const label = status === "done"
        ? plannedDiff === undefined ? "已完成" : plannedDiff > 0 ? `延期 ${plannedDiff} 天` : plannedDiff < 0 ? `提前 ${Math.abs(plannedDiff)} 天` : "按期完成"
        : status === "late" ? `逾期 ${overdueDays} 天`
          : status === "active" ? `距节点 ${remainingDays} 天`
            : planValue !== undefined ? `计划 ${new Date(planValue).getMonth() + 1}月${new Date(planValue).getDate()}日` : "待排期";
      return { item, status, left, width: Math.min(width, timelineWidth - left), elapsed, label };
    });
    const years: Array<{ year: number; count: number }> = [];
    months.forEach((month) => {
      const last = years[years.length - 1];
      if (last?.year === month.getFullYear()) last.count += 1;
      else years.push({ year: month.getFullYear(), count: 1 });
    });
    return { items, months, years, monthWidth, leftWidth, timelineWidth, nowLeft: position(now.getTime()) };
  }, [milestones]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const frame = window.requestAnimationFrame(() => {
      element.scrollLeft = Math.max(0, timeline.leftWidth + timeline.nowLeft - element.clientWidth * 0.58);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [timeline.leftWidth, timeline.nowLeft, timeline.timelineWidth]);

  return <Card className="project-workspace-card" title="项目计划与实际进度" extra={<span className="gantt-legend"><i className="done" />已完成<i className="active" />进行中<i className="pending" />待开始<i className="late" />已延期</span>}>
    <div className="stage-gantt-intro"><p className="workspace-help">按月横向查看 12 个固定里程碑；左侧直接对照计划、实际与偏差。时间轴会自动定位到今天，可横向滚动查看完整周期。</p><span>条形表示相邻里程碑之间的阶段周期</span></div>
    <div className="stage-gantt-scroll" ref={scrollRef}>
      <div className="stage-gantt-table" style={{ width: timeline.leftWidth + timeline.timelineWidth }}>
        <div className="stage-gantt-header" style={{ gridTemplateColumns: `${timeline.leftWidth}px ${timeline.timelineWidth}px` }}>
          <div className="stage-gantt-left stage-gantt-left-head"><span>固定里程碑</span><span>计划日期</span><span>实际日期</span><span>状态 / 偏差</span></div>
          <div className="stage-gantt-calendar-head">
            <div className="stage-gantt-years">{timeline.years.map((group) => <strong key={group.year} style={{ width: group.count * timeline.monthWidth }}>{group.year} 年</strong>)}</div>
            <div className="stage-gantt-months">{timeline.months.map((month) => <span key={`${month.getFullYear()}-${month.getMonth()}`} style={{ width: timeline.monthWidth }}>{month.getMonth() + 1} 月</span>)}</div>
          </div>
        </div>
        <div className="stage-gantt-body">
          <div className="stage-gantt-today" style={{ left: timeline.leftWidth + timeline.nowLeft }}><em>今天</em></div>
          {timeline.items.map(({ item, status, left, width, elapsed, label }) => <div className="stage-gantt-row" key={item.id} style={{ gridTemplateColumns: `${timeline.leftWidth}px ${timeline.timelineWidth}px` }}>
            <div className="stage-gantt-left stage-gantt-left-row"><strong title={item.name}>{item.name}</strong><span>{item.plannedDate ? formatDate(item.plannedDate) : "—"}</span><span>{item.actualDate ? formatDate(item.actualDate) : "—"}</span><span className={`stage-gantt-status ${status}`}>{label}</span></div>
            <div className="stage-gantt-track" style={{ width: timeline.timelineWidth, backgroundSize: `${timeline.monthWidth}px 100%` }}>
              {width > 0 ? <span className={`stage-gantt-bar ${status}`} style={{ left, width }} title={`${item.name}｜计划 ${item.plannedDate ?? "待排期"}｜实际 ${item.actualDate ?? "未完成"}｜${label}`}>
                {status === "active" && <i style={{ width: `${elapsed}%` }} />}
                <b>{label}</b>
              </span> : <span className="stage-gantt-empty">待排期</span>}
            </div>
          </div>)}
        </div>
      </div>
    </div>
    <div className="stage-gantt-note"><span>绿色：已完成</span><span>橙色：进行中（深色为已走过时间）</span><span>灰色：待开始</span><span>红色：已延期</span></div>
  </Card>;
}

function ReportEditor({ projectId, report, open, onClose }: { projectId: string; report?: ProjectReport; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm(); const client = useQueryClient();
  const save = useMutation({ mutationFn: (values: Record<string, unknown>) => api(`/projects/${projectId}/report`, { method: "PUT", body: JSON.stringify({ ...values, version: report?.version ?? undefined }) }), onSuccess: async () => { message.success("本期汇报已保存"); await Promise.all([client.invalidateQueries({ queryKey: ["report", projectId] }), client.invalidateQueries({ queryKey: ["audit", projectId] })]); onClose(); }, onError: (error) => message.error((error as Error).message) });
  useEffect(() => { if (open) form.setFieldsValue(report); }, [open, report, form]);
  return <Modal open={open} title="编辑本期汇报" width={720} onCancel={onClose} onOk={() => form.submit()} okText="保存汇报" confirmLoading={save.isPending}><Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}><Form.Item label="本期完成工作" name="completedWork"><Input.TextArea rows={3} /></Form.Item><Form.Item label="问题与需协调事项" name="risksAndIssues"><Input.TextArea rows={3} /></Form.Item><Form.Item label="下一阶段计划" name="nextPlan"><Input.TextArea rows={3} /></Form.Item><Form.Item label="需要支持" name="supportNeeded"><Input.TextArea rows={3} /></Form.Item></Form></Modal>;
}

function ProjectMasterEditor({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => api<Project>(`/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...values, version: project.version }),
    }),
    onSuccess: async () => {
      message.success("项目基础资料已更新");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["projects"] }),
        client.invalidateQueries({ queryKey: ["demo-workspace"] }),
        client.invalidateQueries({ queryKey: ["audit", project.id] }),
      ]);
      onClose();
    },
    onError: (error) => message.error((error as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => api<{ ok: boolean; recoverable: boolean }>(`/projects/${project.id}`, {
      method: "DELETE",
      body: JSON.stringify({ version: project.version }),
    }),
    onSuccess: async () => {
      message.success("项目已删除；关联数据已保留，可由部署人员恢复");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["projects"] }),
        client.invalidateQueries({ queryKey: ["demo-workspace"] }),
        client.invalidateQueries({ queryKey: ["favorite-projects"] }),
      ]);
      setDeleteOpen(false);
      setDeleteName("");
      onClose();
    },
    onError: (error) => message.error((error as Error).message),
  });
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        projectCode: project.projectCode,
        name: project.name,
        responsiblePerson: project.responsiblePerson,
        grade: project.grade,
        diseaseType: project.diseaseType,
        leadingPi: project.leadingPi,
        leadInstitution: project.leadInstitution,
        region: project.region,
        province: project.province,
        plannedCenterCount: project.plannedCenterCount,
        plannedEnrollment: project.plannedEnrollment,
      });
    }
  }, [form, open, project]);
  return <><Modal open={open} width={760} title="编辑项目基础资料" okText="保存修改" cancelText="取消" onCancel={onClose} onOk={() => form.submit()} confirmLoading={save.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
      <div className="project-master-grid"><Form.Item name="projectCode" label="项目编码" rules={[{ required: true, message: "请填写项目编码" }]}><Input /></Form.Item><Form.Item name="name" label="项目名称" rules={[{ required: true, message: "请填写项目名称" }]}><Input /></Form.Item></div>
      <div className="project-master-grid"><Form.Item name="responsiblePerson" label="项目负责人" rules={[{ required: true, message: "请填写项目负责人" }]}><Input /></Form.Item><Form.Item name="grade" label="课题分级" rules={[{ required: true, message: "请选择课题分级" }]}><Select placeholder="请选择分级" options={["S", "A", "B", "C", "D"].map((value) => ({ value, label: value }))} /></Form.Item></div>
      <div className="project-master-grid"><Form.Item name="diseaseType" label="疾病类型" rules={[{ required: true, message: "请填写疾病类型" }]}><Input /></Form.Item><Form.Item name="leadingPi" label="Leading-PI" rules={[{ required: true, message: "请填写 Leading-PI" }]}><Input /></Form.Item></div>
      <Form.Item name="leadInstitution" label="组长单位" rules={[{ required: true, message: "请填写组长单位" }]}><Input /></Form.Item>
      <div className="project-master-grid"><Form.Item name="region" label="区域"><Select allowClear placeholder="请选择区域" options={["东区", "西区", "南区", "北区", "中区"].map((value) => ({ value, label: value }))} /></Form.Item><Form.Item name="province" label="省份"><Input placeholder="例如：山东、江苏" /></Form.Item></div>
      <div className="project-master-grid"><Form.Item name="plannedCenterCount" label="计划中心数"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item><Form.Item name="plannedEnrollment" label="计划总例数"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></div>
      <div className="project-delete-zone"><div><strong>删除项目</strong><p>项目将从工作台和汇总列表隐藏，关联里程碑、预算和附件会保留，以便误删后恢复。</p></div><Button danger onClick={() => { setDeleteName(""); setDeleteOpen(true); }}>删除项目</Button></div>
    </Form>
  </Modal><Modal open={deleteOpen} title="确认删除项目" okText="确认删除" cancelText="取消" okButtonProps={{ danger: true, disabled: deleteName !== project.name }} confirmLoading={remove.isPending} onCancel={() => { setDeleteOpen(false); setDeleteName(""); }} onOk={() => remove.mutate()} destroyOnHidden>
    <div className="project-delete-confirm"><p>删除后项目不会出现在项目列表中。关联数据不会立即物理清除。</p><p>请输入完整项目名称确认：</p><strong>{project.name}</strong><Input value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder="输入完整项目名称" status={deleteName && deleteName !== project.name ? "error" : undefined} /></div>
  </Modal></>;
}

function ProjectOverviewPanels({ project, milestones, governance, report, onSection, onReport }: { project: Project; milestones: Milestone[]; governance: ReturnType<typeof useGovernanceData>; report?: ProjectReport; onSection: (section: Section) => void; onReport: () => void }) {
  const completed = milestones.filter((item) => item.actualDate).length;
  const overdue = milestones.filter((item) => item.plannedDate && item.plannedDate < today() && !item.actualDate);
  const missing = milestones.filter((item) => !item.plannedDate);
  const upcoming = milestones.filter((item) => item.plannedDate && item.plannedDate >= today() && item.plannedDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) && !item.actualDate);
  const next = milestones.find((item) => !item.actualDate && item.plannedDate);
  const target = [...governance.targets].sort((a, b) => b.year - a.year)[0];
  const budget = governance.budgetOverview;
  const targetComplete = Boolean(target);
  const budgetComplete = Boolean(budget?.version || governance.budgets.length);
  const completeness = Math.round((milestones.filter((item) => item.plannedDate).length + Number(targetComplete) + Number(budgetComplete)) / 14 * 100);
  const milestoneTone = (item: Milestone) => item.actualDate ? "done" : item.plannedDate && item.plannedDate < today() ? "late" : item === next ? "active" : "pending";
  return <>
    <div className="workspace-summary"><div><small>里程碑完成</small><strong>{completed}<em>/12</em></strong><p>{next ? `下一节点：${next.name} · ${formatDate(next.plannedDate)}` : completed === 12 ? "全部里程碑已完成" : "请补充下一计划日期"}</p></div><div><small>年度目标与入组</small><strong>{target ? `${target.enrolledCount} / ${target.targetEnrollment} 例` : "待填写"}</strong><p>{target ? `${target.year} 年 · 在组 ${target.activeCount} 例` : "尚未填写年度目标"}</p></div><div><small>全周期预算</small><strong>{budgetComplete ? `${budget?.totalBudgetWan?.toFixed(2) ?? "0.00"} 万` : "待填写"}</strong><p>{budgetComplete ? `医学 ${budget?.medicalBudgetWan?.toFixed(2) ?? "0.00"} · 销售 ${budget?.salesBudgetWan?.toFixed(2) ?? "0.00"}` : "尚未填写项目预算"}</p></div><div><small>数据完整度</small><strong>{completeness}%</strong><p>计划日期、年度目标与预算</p></div></div>
    <div className="workspace-report-grid"><Card title="项目概况" className="project-workspace-card" extra={<Button type="link" onClick={() => onSection("overview")}>团队共编</Button>}><div className="workspace-fact-grid"><div><small>区域 / 省份</small><strong>{[project.region, project.province].filter(Boolean).join(" / ") || "待填写"}</strong></div><div><small>项目分级</small><strong>{project.grade || "待填写"}</strong></div><div><small>项目负责人</small><strong>{project.responsiblePerson}</strong></div><div><small>Leading-PI</small><strong>{project.leadingPi}</strong></div><div><small>组长单位</small><strong>{project.leadInstitution}</strong></div><div><small>计划规模</small><strong>{project.plannedCenterCount} 中心 · {project.plannedEnrollment} 例</strong></div></div></Card><Card title="管理摘要" className="project-workspace-card"><div className="workspace-attention-list"><button className={overdue.length ? "danger" : ""} onClick={() => onSection("milestones")}><strong>{overdue.length}</strong><span>已延期节点</span><small>{overdue[0]?.name || "当前无延期"}</small></button><button className={upcoming.length ? "warn" : ""} onClick={() => onSection("milestones")}><strong>{upcoming.length}</strong><span>近30天到期</span><small>{upcoming[0]?.name || "当前无近期节点"}</small></button><button onClick={() => onSection("milestones")}><strong>{missing.length}</strong><span>待补计划日期</span><small>{missing[0]?.name || "计划日期已完整"}</small></button></div></Card>
      <Card title="12个里程碑概况" className="project-workspace-card workspace-span-2" extra={<Button type="link" onClick={() => onSection("gantt")}>查看甘特图</Button>}><div className="workspace-milestone-strip">{milestones.map((item, index) => <button key={item.id} className={milestoneTone(item)} onClick={() => onSection("milestones")} title={`${item.name} · ${item.actualDate || item.plannedDate || "待排期"}`}><i>{index + 1}</i><span>{item.name.replace(/时间$/, "")}</span></button>)}</div></Card>
      <Card title="目标、入组与预算" className="project-workspace-card workspace-span-2" extra={<Button type="link" onClick={() => onSection("governance")}>填写 / 更新</Button>}><div className="workspace-governance-brief"><div><small>年度目标</small><strong>{target ? `${target.targetEnrollment} 例` : "待填写"}</strong></div><div><small>已入组 / 在组</small><strong>{target ? `${target.enrolledCount} / ${target.activeCount} 例` : "待填写"}</strong></div><div><small>完成随访 / 脱落</small><strong>{target ? `${target.followupCompleteCount} / ${target.dropoutCount} 例` : "待填写"}</strong></div><div><small>销售已划拨</small><strong>{budgetComplete ? `${budget?.salesAllocatedBudgetWan?.toFixed(2) ?? "0.00"} 万` : "待填写"}</strong></div><div><small>分年度预算</small><strong>{governance.budgets.length ? governance.budgets.map((item) => `${item.year}：${(item.budgetAmount / 10000).toFixed(2)}万`).join("；") : "待填写"}</strong></div></div></Card>
      <Card title="本期汇报" className="project-workspace-card workspace-span-2" extra={<Button type="link" onClick={onReport}>填写 / 更新</Button>}><div className="report-preview"><div><small>本期完成工作</small><p>{report?.completedWork || "待填写"}</p></div><div><small>问题与需协调事项</small><p>{report?.risksAndIssues || "暂无"}</p></div><div><small>下一阶段计划</small><p>{report?.nextPlan || (next ? `${next.name}（计划 ${formatDate(next.plannedDate)}）` : "待填写")}</p></div><div><small>需要支持</small><p>{report?.supportNeeded || "暂无"}</p></div></div></Card>
    </div>
  </>;
}

export function ProjectWorkspace({ project, data, initialSection = "overview" }: { project: Project; data: WorkspaceData; initialSection?: Section }) {
  const [section, setSection] = useState<Section>(initialSection); const [reportOpen, setReportOpen] = useState(false); const [masterOpen, setMasterOpen] = useState(false);
  useEffect(() => { setSection(initialSection); }, [initialSection, project.id]);
  const milestones = data.milestones.filter((item) => item.projectId === project.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const governance = useGovernanceData(project.id);
  const reportQuery = useQuery({ queryKey: ["report", project.id], queryFn: () => api<ProjectReport>(`/projects/${project.id}/report`) });
  const completed = milestones.filter((item) => item.actualDate).length;
  const next = milestones.find((item) => !item.actualDate && item.plannedDate);
  const hasBudget = Boolean(governance.budgetOverview?.version || governance.budgets.length);
  const hasTarget = governance.targets.length > 0;
  const nav: Array<[Section, string]> = [["overview", "汇报总览"], ["milestones", "里程碑 12"], ["governance", "目标与预算"], ["gantt", "甘特图"], ["files", "项目文件"], ["history", "修改记录"], ["source", "原表字段"]];
  return <div className="project-workspace"><div className="workspace-hero"><div><small>{project.projectCode} · 项目工作台</small><h1>{project.name}</h1><div className="workspace-tags"><span>{project.grade}级项目</span><span>{project.currentStage || "待确认阶段"}</span><span className="shared">团队共编</span></div></div><div className="workspace-hero-side"><strong>{project.responsiblePerson}</strong><small>项目负责人</small><p>所有内部成员均可维护，保存后会同步给在线成员。</p><div className="workspace-hero-actions"><Button onClick={() => setMasterOpen(true)}>编辑项目资料</Button><Button onClick={() => setReportOpen(true)}>更新本期汇报</Button></div></div></div>
    <div className="workspace-tabs">{nav.map(([key, label]) => <button className={section === key ? "active" : ""} key={key} onClick={() => setSection(key)}>{label}</button>)}</div>
    {section === "overview" && <ProjectOverviewPanels project={project} milestones={milestones} governance={governance} report={reportQuery.data} onSection={setSection} onReport={() => setReportOpen(true)} />}
    {section === "milestones" && <MilestoneBatchEditor projectId={project.id} milestones={milestones} />}
    {section === "governance" && <GovernancePanel projectId={project.id} data={governance} />}
    {section === "gantt" && <MilestoneStageGantt milestones={milestones} />}
    {section === "files" && <AttachmentsPanel projectId={project.id} />}
    {section === "history" && <AuditPanel projectId={project.id} />}
    {section === "source" && <ImportSourcePanel projectId={project.id} />}
    <ProjectMasterEditor project={project} open={masterOpen} onClose={() => setMasterOpen(false)} />
    <ReportEditor projectId={project.id} report={reportQuery.data} open={reportOpen} onClose={() => setReportOpen(false)} />
  </div>;
}
