import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Col, Form, InputNumber, Modal, Progress, Row, Statistic, Table, Typography, message } from "antd";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { api } from "./api";
import type { AnnualProjectTarget, ProjectBudget, ProjectBudgetOverview } from "./types";
import "./project-planning.css";

export function useGovernanceData(projectId: string) {
  const targets = useQuery({ queryKey: ["annual-targets", projectId], queryFn: () => api<AnnualProjectTarget[]>(`/projects/${projectId}/annual-targets`) });
  const budgetOverview = useQuery({ queryKey: ["budget-overview", projectId], queryFn: () => api<ProjectBudgetOverview>(`/projects/${projectId}/budget-overview`) });
  const budgets = useQuery({ queryKey: ["budgets", projectId], queryFn: () => api<ProjectBudget[]>(`/projects/${projectId}/budgets`) });
  return { targets: targets.data ?? [], budgetOverview: budgetOverview.data, budgets: budgets.data ?? [] };
}

type GovernanceData = ReturnType<typeof useGovernanceData>;

function AnnualTargetModal({ projectId, item, open, onClose }: { projectId: string; item?: AnnualProjectTarget; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm(); const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => item
      ? api(`/annual-targets/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...values, version: item.version }) })
      : api(`/projects/${projectId}/annual-targets`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => { message.success(item ? "年度目标与入组进度已更新" : "年度目标已新增"); await queryClient.invalidateQueries({ queryKey: ["annual-targets", projectId] }); onClose(); },
    onError: (error) => message.error((error as Error).message),
  });
  return <Modal open={open} width={720} title={item ? "编辑年度目标与入组进度" : "新增年度目标与入组进度"} okText="保存" cancelText="取消" confirmLoading={mutation.isPending} onCancel={onClose} onOk={() => form.submit()} destroyOnHidden afterOpenChange={(visible) => { if (visible) { form.resetFields(); form.setFieldsValue(item ?? { year: new Date().getFullYear(), targetEnrollment: 0, enrolledCount: 0, activeCount: 0, followupCompleteCount: 0, dropoutCount: 0 }); } }}>
    <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
      <Row gutter={14}>
        <Col span={8}><Form.Item name="year" label="年度" rules={[{ required: true }]}><InputNumber min={2000} max={2100} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={8}><Form.Item name="targetEnrollment" label="年度目标（例）"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={8}><Form.Item name="enrolledCount" label="已入组例数"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={8}><Form.Item name="activeCount" label="当前在组例数"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={8}><Form.Item name="followupCompleteCount" label="当前完成随访例数"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={8}><Form.Item name="dropoutCount" label="已脱落/出组例数"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
      </Row>
      <Typography.Text type="secondary">同一项目可按实际周期新增多个年度；每个年度仅保留一条目标与入组进度记录。</Typography.Text>
    </Form>
  </Modal>;
}

function BudgetOverviewModal({ projectId, item, open, onClose }: { projectId: string; item?: ProjectBudgetOverview; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm(); const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => api(`/projects/${projectId}/budget-overview`, { method: "PATCH", body: JSON.stringify({ ...values, version: item?.version ?? undefined }) }),
    onSuccess: async () => { message.success("项目全周期预算已更新"); await queryClient.invalidateQueries({ queryKey: ["budget-overview", projectId] }); onClose(); },
    onError: (error) => message.error((error as Error).message),
  });
  return <Modal open={open} width={680} title="项目全周期预算" okText="保存" cancelText="取消" confirmLoading={mutation.isPending} onCancel={onClose} onOk={() => form.submit()} destroyOnHidden afterOpenChange={(visible) => { if (visible) { form.resetFields(); form.setFieldsValue(item ?? { totalBudgetWan: 0, medicalBudgetWan: 0, salesBudgetWan: 0, salesAllocatedBudgetWan: 0 }); } }}>
    <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
      <Row gutter={14}>
        <Col span={12}><Form.Item name="totalBudgetWan" label="项目总预算（万元）"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={12}><Form.Item name="medicalBudgetWan" label="总预算中医学预算（万元）"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={12}><Form.Item name="salesBudgetWan" label="总预算中销售预算（万元）"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={12}><Form.Item name="salesAllocatedBudgetWan" label="销售已划拨预算（万元）"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item></Col>
      </Row>
      <Typography.Text type="secondary">总预算、医学预算和销售预算均为项目全周期累计口径；年度预算在下方另行维护。</Typography.Text>
    </Form>
  </Modal>;
}

function AnnualBudgetModal({ projectId, item, open, onClose }: { projectId: string; item?: ProjectBudget; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm(); const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: { year: number; amountWan: number }) => {
      const body = { year: values.year, category: "年度预算", budgetAmount: Number(values.amountWan) * 10000, spentAmount: 0, notes: "按项目周期维护的年度预算" };
      return item ? api(`/budgets/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...body, version: item.version }) }) : api(`/projects/${projectId}/budgets`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: async () => { message.success(item ? "年度预算已更新" : "年度预算已新增"); await queryClient.invalidateQueries({ queryKey: ["budgets", projectId] }); onClose(); },
    onError: (error) => message.error((error as Error).message),
  });
  return <Modal open={open} width={520} title={item ? "编辑年度预算" : "新增年度预算"} okText="保存" cancelText="取消" confirmLoading={mutation.isPending} onCancel={onClose} onOk={() => form.submit()} destroyOnHidden afterOpenChange={(visible) => { if (visible) { form.resetFields(); form.setFieldsValue(item ? { year: item.year, amountWan: item.budgetAmount / 10000 } : { year: new Date().getFullYear(), amountWan: 0 }); } }}>
    <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}><Row gutter={14}><Col span={12}><Form.Item name="year" label="年度" rules={[{ required: true }]}><InputNumber min={2000} max={2100} precision={0} style={{ width: "100%" }} /></Form.Item></Col><Col span={12}><Form.Item name="amountWan" label="年度预算（万元）"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item></Col></Row></Form>
  </Modal>;
}

export function GovernanceSummary({ data }: { data: GovernanceData }) {
  const overview = data.budgetOverview; const total = overview?.totalBudgetWan ?? 0; const allocated = overview?.salesAllocatedBudgetWan ?? 0; const latestTarget = data.targets.find((item) => item.year === new Date().getFullYear()) ?? data.targets[0];
  const targetRate = latestTarget?.targetEnrollment ? Math.round(latestTarget.enrolledCount / latestTarget.targetEnrollment * 100) : 0;
  return <Card className="report-card" title="目标与预算概览"><Row gutter={16}>
    <Col span={6}><Statistic title="年度入组目标" value={latestTarget?.targetEnrollment ?? 0} suffix="例" /></Col>
    <Col span={6}><Statistic title="已入组" value={latestTarget?.enrolledCount ?? 0} suffix="例" /><Typography.Text type="secondary">完成率 {targetRate}%</Typography.Text></Col>
    <Col span={6}><Statistic title="当前在组 / 完成随访" value={`${latestTarget?.activeCount ?? 0} / ${latestTarget?.followupCompleteCount ?? 0}`} suffix="例" /></Col>
    <Col span={6}><Statistic title="项目总预算" value={total.toFixed(2)} suffix="万元" /><Typography.Text type="secondary">销售已划拨 {allocated.toFixed(2)} 万元</Typography.Text></Col>
  </Row></Card>;
}

export function GovernancePanel({ projectId, data }: { projectId: string; data: GovernanceData }) {
  const [targetOpen, setTargetOpen] = useState(false); const [budgetOverviewOpen, setBudgetOverviewOpen] = useState(false); const [annualBudgetOpen, setAnnualBudgetOpen] = useState(false);
  const [target, setTarget] = useState<AnnualProjectTarget>(); const [budget, setBudget] = useState<ProjectBudget>();
  const overview = data.budgetOverview; const total = overview?.totalBudgetWan ?? 0; const sales = overview?.salesBudgetWan ?? 0; const allocated = overview?.salesAllocatedBudgetWan ?? 0;
  return <>
    <GovernanceSummary data={data} />
    <Row gutter={16}>
      <Col xs={24} xl={14}><Card className="report-card" title="年度目标与入组进度" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setTargetOpen(true)}>新增年度</Button>}>
        <Typography.Paragraph type="secondary">按项目实际周期逐年填写，不固定为任何年份。所有人数均为当前年度累计数据。</Typography.Paragraph>
        <Table rowKey="id" size="small" dataSource={data.targets} pagination={false} scroll={{ x: 780 }} columns={[
          { title: "年度", dataIndex: "year", width: 75 }, { title: "年度目标", dataIndex: "targetEnrollment", width: 90 }, { title: "已入组", dataIndex: "enrolledCount", width: 80 },
          { title: "当前在组", dataIndex: "activeCount", width: 90 }, { title: "完成随访", dataIndex: "followupCompleteCount", width: 95 }, { title: "脱落/出组", dataIndex: "dropoutCount", width: 95 },
          { title: "完成率", width: 100, render: (_, item) => `${item.targetEnrollment ? Math.round(item.enrolledCount / item.targetEnrollment * 100) : 0}%` },
          { title: "操作", width: 80, render: (_, item) => item.canEdit ? <Button type="link" icon={<EditOutlined />} onClick={() => { setTarget(item); setTargetOpen(true); }}>编辑</Button> : <Typography.Text type="secondary">只读</Typography.Text> },
        ]} />
      </Card></Col>
      <Col xs={24} xl={10}><Card className="report-card" title="项目全周期预算" extra={<Button type="link" icon={<EditOutlined />} disabled={!overview?.canEdit} onClick={() => setBudgetOverviewOpen(true)}>编辑</Button>}>
        <div className="budget-overview-grid"><div><small>项目总预算</small><strong>{total.toFixed(2)} <em>万元</em></strong></div><div><small>医学预算</small><strong>{(overview?.medicalBudgetWan ?? 0).toFixed(2)} <em>万元</em></strong></div><div><small>销售预算</small><strong>{sales.toFixed(2)} <em>万元</em></strong></div><div><small>销售已划拨</small><strong>{allocated.toFixed(2)} <em>万元</em></strong></div></div>
        <Progress percent={sales ? Math.min(100, Math.round(allocated / sales * 100)) : 0} format={(value) => `销售划拨 ${value ?? 0}%`} />
        <Typography.Text type="secondary">医学预算 + 销售预算不得超过项目总预算。</Typography.Text>
      </Card></Col>
    </Row>
    <Card className="report-card" title="年度预算" extra={<Button type="link" icon={<PlusOutlined />} onClick={() => setAnnualBudgetOpen(true)}>新增年度预算</Button>}>
      <Typography.Paragraph type="secondary">用于跨年度项目的分年预算安排，金额单位为万元。</Typography.Paragraph>
      <Table rowKey="id" size="small" dataSource={data.budgets} pagination={false} columns={[
        { title: "年度", dataIndex: "year", width: 100 }, { title: "年度预算（万元）", dataIndex: "budgetAmount", render: (value) => (Number(value) / 10000).toFixed(2) },
        { title: "操作", width: 90, render: (_, item) => item.canEdit ? <Button type="link" onClick={() => { setBudget(item); setAnnualBudgetOpen(true); }}>编辑</Button> : <Typography.Text type="secondary">只读</Typography.Text> },
      ]} />
    </Card>
    <AnnualTargetModal projectId={projectId} item={target} open={targetOpen} onClose={() => { setTargetOpen(false); setTarget(undefined); }} />
    <BudgetOverviewModal projectId={projectId} item={overview} open={budgetOverviewOpen} onClose={() => setBudgetOverviewOpen(false)} />
    <AnnualBudgetModal projectId={projectId} item={budget} open={annualBudgetOpen} onClose={() => { setAnnualBudgetOpen(false); setBudget(undefined); }} />
  </>;
}
