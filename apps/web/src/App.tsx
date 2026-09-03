import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  message,
  Modal,
  Progress,
  Result,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  AppstoreOutlined,
  DashboardOutlined,
  EditOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ProjectOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { io } from "socket.io-client";
import { api, ApiError } from "./api";
import type { Project, ProjectFormValues, User } from "./types";
import { ProjectDetail } from "./ProjectDetail";
import { DemoWorkspace } from "./DemoWorkspace";

const { Header, Sider, Content } = Layout;

function LoginPage({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [error, setError] = useState<string>();
  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) =>
      api<{ user: User }>("/auth/enter", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: ({ user }) => onSuccess(user),
    onError: (reason) => setError(reason instanceof Error ? reason.message : "操作失败"),
  });

  return (
    <div className="login-shell">
      <div className="login-brand">
        <div className="brand-mark"><ProjectOutlined /></div>
        <Typography.Title level={1}>让每一个 IIT 项目<br />进度清晰、协作有据</Typography.Title>
        <Typography.Paragraph>项目主档、进度、事项与汇报看板统一管理。</Typography.Paragraph>
      </div>
      <Card className="login-card" bordered={false}>
        <Typography.Title level={3}>进入项目管理系统</Typography.Title>
        <Typography.Paragraph type="secondary">请输入本人姓名和公司通用密码。姓名用于标识操作人，不需要单独注册账号。</Typography.Paragraph>
        {error && <Alert className="login-alert" type="error" showIcon message={error} />}
        <Form layout="vertical" size="large" onFinish={(values) => { setError(undefined); mutation.mutate(values); }}>
          <Form.Item label="本人姓名" name="displayName" rules={[{ required: true, message: "请输入本人姓名" }, { min: 2, message: "姓名至少2个字符" }]}>
            <Input prefix={<UserOutlined />} placeholder="例如：项目经理 A" autoComplete="name" autoFocus />
          </Form.Item>
          <Form.Item label="公司通用密码" name="password" rules={[{ required: true, message: "请输入公司通用密码" }]}>
            <Input.Password placeholder="请输入公司统一提供的密码" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={mutation.isPending}>进入系统</Button>
        </Form>
        <Typography.Paragraph className="login-tip" type="secondary">所有公司成员共用一个密码；系统不会为每个人单独创建密码，也不会因输错次数过多而锁定。</Typography.Paragraph>
      </Card>
    </div>
  );
}

const statusColors: Record<string, string> = {
  筹备中: "blue",
  进行中: "green",
  暂停: "orange",
  已完成: "default",
  已终止: "red",
};

function ProjectModal({
  open,
  project,
  onClose,
}: {
  open: boolean;
  project?: Project;
  onClose: () => void;
}) {
  const [form] = Form.useForm<ProjectFormValues>();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      if (project) {
        return api<Project>(`/projects/${project.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...values, version: project.version }),
        });
      }
      return api<Project>("/projects", { method: "POST", body: JSON.stringify(values) });
    },
    onSuccess: async () => {
      message.success(project ? "项目已更新" : "项目已创建");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (project) form.setFieldsValue(project);
    else form.setFieldsValue({ status: "筹备中", plannedCenterCount: 0, plannedEnrollment: 0, enrolledCount: 0 });
  }, [form, open, project]);

  return (
    <Modal
      open={open}
      width={820}
      title={project ? `编辑项目 · ${project.projectCode}` : "创建 IIT 项目"}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      confirmLoading={mutation.isPending}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
        <Row gutter={16}>
          <Col span={8}><Form.Item name="projectCode" label="项目编码" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={16}><Form.Item name="name" label="项目名称" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="responsiblePerson" label="项目负责人" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="grade" label="课题分级" rules={[{ required: true }]}><Input placeholder="例如：院级" /></Form.Item></Col>
          <Col span={8}><Form.Item name="diseaseType" label="疾病类型" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="leadingPi" label="Leading-PI" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="leadInstitution" label="组长单位" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={6}><Form.Item name="plannedCenterCount" label="计划中心数" rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
          <Col span={6}><Form.Item name="plannedEnrollment" label="计划总例数" rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
          <Col span={6}><Form.Item name="enrolledCount" label="已入组例数"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
          <Col span={6}><Form.Item name="status" label="项目状态"><Select options={["筹备中", "进行中", "暂停", "已完成", "已终止"].map((value) => ({ value }))} /></Form.Item></Col>
          <Col span={8}><Form.Item name="region" label="区域"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="province" label="省份"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="currentStage" label="当前阶段"><Input /></Form.Item></Col>
          <Col span={24}><Form.Item name="summary" label="项目简介"><Input.TextArea rows={3} /></Form.Item></Col>
        </Row>
      </Form>
    </Modal>
  );
}

function LegacyWorkspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project>();
  const [selectedProject, setSelectedProject] = useState<Project>();
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: ["projects", search],
    queryFn: () => api<Project[]>(`/projects${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

  useEffect(() => {
    const socket = io("/", { withCredentials: true });
    socket.on("project.changed", () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["centers"] });
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["risks"] });
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["attachments"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const projects = projectsQuery.data ?? [];
  const closeModal = () => { setModalOpen(false); setEditing(undefined); };
  const completion = projects.reduce((sum, item) => sum + (item.plannedEnrollment ? item.enrolledCount / item.plannedEnrollment : 0), 0);

  return (
    <Layout className="app-layout">
      <Sider width={232} className="app-sider">
        <div className="sidebar-brand"><div className="brand-mark small"><ProjectOutlined /></div><div><strong>IIT 项目管理</strong><span>Research PM</span></div></div>
        <Menu mode="inline" selectedKeys={["projects"]} items={[
          { key: "overview", icon: <DashboardOutlined />, label: "汇报总览", disabled: true },
          { key: "projects", icon: <FolderOpenOutlined />, label: "全部项目" },
          { key: "tasks", icon: <AppstoreOutlined />, label: "我的事项", disabled: true },
        ]} />
        <div className="version-label">V1.0 内部版</div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div><Typography.Text type="secondary">内部协同空间</Typography.Text></div>
          <Space>
            <Avatar style={{ background: "#176b87" }}>{user.displayName.slice(0, 1)}</Avatar>
            <Typography.Text>{user.displayName}</Typography.Text>
            <Button type="text" onClick={onLogout}>退出</Button>
          </Space>
        </Header>
        <Content className="app-content">
          {selectedProject ? (
            <ProjectDetail project={selectedProject} onBack={() => setSelectedProject(undefined)} />
          ) : (
          <>
          <div className="page-heading">
            <div><Typography.Title level={2}>全部项目</Typography.Title><Typography.Text type="secondary">查看公司 IIT 项目的最新状态与负责人</Typography.Text></div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>创建项目</Button>
          </div>
          <Row gutter={16} className="stats-row">
            <Col span={6}><Card><Statistic title="项目总数" value={projects.length} suffix="项" /></Card></Col>
            <Col span={6}><Card><Statistic title="进行中" value={projects.filter((item) => item.status === "进行中").length} suffix="项" /></Card></Col>
            <Col span={6}><Card><Statistic title="我创建的" value={projects.filter((item) => item.canEdit).length} suffix="项" /></Card></Col>
            <Col span={6}><Card><Statistic title="平均入组进度" value={projects.length ? completion / projects.length * 100 : 0} precision={1} suffix="%" /></Card></Col>
          </Row>
          {projects.length > 0 && <Row gutter={16} className="portfolio-panels">
            <Col span={10}><Card title="项目状态分布" bordered={false}>{["筹备中", "进行中", "暂停", "已完成", "已终止"].map((status) => {
              const count = projects.filter((item) => item.status === status).length;
              return <div className="portfolio-status-row" key={status}><span>{status}</span><Progress percent={projects.length ? Math.round(count / projects.length * 100) : 0} showInfo={false} strokeColor={status === "进行中" ? "#0a956d" : status === "暂停" ? "#d69732" : "#78909c"} /><strong>{count}</strong></div>;
            })}</Card></Col>
            <Col span={14}><Card title="项目入组概览" bordered={false}>{projects.slice(0, 5).map((item) => {
              const percent = item.plannedEnrollment ? Math.min(Math.round(item.enrolledCount / item.plannedEnrollment * 100), 100) : 0;
              return <div className="portfolio-enrollment-row" key={item.id}><button onClick={() => setSelectedProject(item)}>{item.projectCode}<small>{item.name}</small></button><Progress percent={percent} size="small" /><span>{item.enrolledCount}/{item.plannedEnrollment}</span></div>;
            })}</Card></Col>
          </Row>}
          <Card className="project-card" bordered={false}>
            <div className="table-toolbar">
              <Input.Search allowClear placeholder="搜索项目名称或编码" style={{ width: 320 }} onSearch={setSearch} />
              <Typography.Text type="secondary">保存后，其他在线成员会自动看到最新数据</Typography.Text>
            </div>
            {projectsQuery.isLoading ? <div className="center-state"><Spin /></div> : projectsQuery.isError ? (
              <Result status="error" title="项目加载失败" subTitle={(projectsQuery.error as Error).message} extra={<Button onClick={() => projectsQuery.refetch()}>重试</Button>} />
            ) : projects.length === 0 ? <Empty description="暂无项目，创建第一个 IIT 项目吧" /> : (
              <Table rowKey="id" dataSource={projects} scroll={{ x: 1180 }} pagination={{ pageSize: 10 }} columns={[
                { title: "项目编码", dataIndex: "projectCode", fixed: "left", width: 130, render: (value) => <Typography.Text strong>{value}</Typography.Text> },
                { title: "项目名称", dataIndex: "name", width: 260, ellipsis: true, render: (value, record) => <Button type="link" className="project-link" onClick={() => setSelectedProject(record)}>{value}</Button> },
                { title: "状态", dataIndex: "status", width: 100, render: (value) => <Tag color={statusColors[value]}>{value}</Tag> },
                { title: "当前阶段", dataIndex: "currentStage", width: 130, render: (value) => value || "—" },
                { title: "负责人", dataIndex: "responsiblePerson", width: 110 },
                { title: "入组进度", width: 130, render: (_, record) => `${record.enrolledCount} / ${record.plannedEnrollment}` },
                { title: "创建人", width: 110, render: (_, record) => record.owner.displayName },
                { title: "最后更新", dataIndex: "updatedAt", width: 170, render: (value) => new Date(value).toLocaleString("zh-CN", { hour12: false }) },
                { title: "操作", fixed: "right", width: 100, render: (_, record) => record.canEdit ? <Button type="link" icon={<EditOutlined />} onClick={() => { setEditing(record); setModalOpen(true); }}>编辑</Button> : <Typography.Text type="secondary">只读</Typography.Text> },
              ]} />
            )}
          </Card>
          </>
          )}
        </Content>
      </Layout>
      <ProjectModal open={modalOpen} project={editing} onClose={closeModal} />
    </Layout>
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  return <DemoWorkspace user={user} onLogout={onLogout} />;
}

export default function App() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try { return (await api<{ user: User }>("/auth/me")).user; }
      catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
    },
    retry: false,
  });

  if (meQuery.isLoading) return <div className="splash"><Spin size="large" /><span>正在进入 IIT 项目空间…</span></div>;
  if (meQuery.isError) return <Result status="error" title="系统暂时无法连接" subTitle={(meQuery.error as Error).message} extra={<Button onClick={() => meQuery.refetch()}>重试</Button>} />;
  if (!meQuery.data) return <LoginPage onSuccess={(user) => queryClient.setQueryData(["me"], user)} />;

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    queryClient.clear();
    window.location.reload();
  };
  return <Workspace user={meQuery.data} onLogout={logout} />;
}
