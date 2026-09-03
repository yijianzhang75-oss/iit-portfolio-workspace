import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Alert,
  Card,
  Empty,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  Descriptions,
  message,
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  FileAddOutlined,
  HistoryOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { api, apiForm } from "./api";
import type { Attachment, AuditLog, ImportSource } from "./types";

const entityLabels: Record<string, string> = {
  PROJECT: "项目",
  MILESTONE: "里程碑",
  TASK: "事项",
  RESEARCH_CENTER: "研究中心",
  ENROLLMENT_SNAPSHOT: "入组快照",
  PROJECT_RISK: "风险",
  ANNUAL_GOAL: "年度目标",
  PROJECT_BUDGET: "预算",
  PROJECT_REPORT: "项目汇报",
  ATTACHMENT: "附件",
};

const actionLabels: Record<string, { text: string; color: string }> = {
  CREATE: { text: "创建", color: "green" },
  UPDATE: { text: "更新", color: "blue" },
  DELETE: { text: "移除", color: "red" },
  IMPORT: { text: "导入", color: "purple" },
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsPanel({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["attachments", projectId],
    queryFn: () => api<Attachment[]>(`/projects/${projectId}/attachments`),
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiForm<Attachment>(`/projects/${projectId}/attachments`, form);
    },
    onSuccess: async () => {
      message.success("附件上传成功");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["attachments", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["audit", projectId] }),
      ]);
    },
    onError: (error) => message.error((error as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/attachments/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      message.success("附件记录已移除，服务器文件仍可从备份恢复");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["attachments", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["audit", projectId] }),
      ]);
    },
    onError: (error) => message.error((error as Error).message),
  });

  return <Card
    bordered={false}
    title={<Space><FileAddOutlined />项目文件</Space>}
    extra={<>
      <input ref={inputRef} type="file" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) upload.mutate(file);
        event.target.value = "";
      }} />
      <Button type="primary" icon={<UploadOutlined />} loading={upload.isPending} onClick={() => inputRef.current?.click()}>上传附件</Button>
    </>}
  >
    <Typography.Paragraph type="secondary">支持 PDF、Office、图片、文本、CSV、ZIP，单个文件不超过 50MB。所有成员可查看，只有上传人可移除。</Typography.Paragraph>
    <Table rowKey="id" loading={query.isLoading} dataSource={query.data ?? []} pagination={false} columns={[
      { title: "文件名", dataIndex: "originalName", ellipsis: true },
      { title: "大小", dataIndex: "sizeBytes", width: 100, render: (value) => formatBytes(value) },
      { title: "上传人", width: 100, render: (_, item) => item.uploader.displayName },
      { title: "上传时间", dataIndex: "createdAt", width: 175, render: (value) => new Date(value).toLocaleString("zh-CN") },
      { title: "操作", width: 165, render: (_, item) => <Space>
        <Button type="link" icon={<DownloadOutlined />} href={item.downloadUrl}>下载</Button>
        {item.canDelete && <Popconfirm title="移除附件记录？" description="记录会隐藏，服务器文件暂不物理删除。" onConfirm={() => remove.mutate(item.id)}><Button danger type="link" icon={<DeleteOutlined />}>移除</Button></Popconfirm>}
      </Space> },
    ]} />
  </Card>;
}

export function AuditPanel({ projectId }: { projectId: string }) {
  const [selected, setSelected] = useState<AuditLog>();
  const query = useQuery({ queryKey: ["audit", projectId], queryFn: () => api<AuditLog[]>(`/projects/${projectId}/audit-logs`) });
  if (!query.isLoading && !query.data?.length) return <Card bordered={false}><Empty description="暂无修改记录" /></Card>;
  return <Card bordered={false} title={<Space><HistoryOutlined />修改记录</Space>}>
    <Timeline items={(query.data ?? []).map((item) => {
      const action = actionLabels[item.action] ?? { text: item.action, color: "default" };
      return {
        color: action.color,
        children: <div className="audit-line">
          <Space wrap><strong>{item.actor.displayName}</strong><Tag color={action.color}>{action.text}</Tag><span>{entityLabels[item.entityType] ?? item.entityType}</span></Space>
          <Typography.Text type="secondary">{new Date(item.createdAt).toLocaleString("zh-CN")}</Typography.Text>
          <Button size="small" type="link" onClick={() => setSelected(item)}>查看详情</Button>
        </div>,
      };
    })} />
    <Modal open={Boolean(selected)} title="修改详情" footer={null} width={760} onCancel={() => setSelected(undefined)}>
      {selected && <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text>{selected.actor.displayName} · {entityLabels[selected.entityType] ?? selected.entityType} · {actionLabels[selected.action]?.text ?? selected.action}</Typography.Text>
        <Typography.Text type="secondary">{new Date(selected.createdAt).toLocaleString("zh-CN")}</Typography.Text>
        <Typography.Title level={5}>修改前</Typography.Title>
        <pre className="audit-json">{selected.before ? JSON.stringify(selected.before, null, 2) : "无"}</pre>
        <Typography.Title level={5}>修改后</Typography.Title>
        <pre className="audit-json">{selected.after ? JSON.stringify(selected.after, null, 2) : "无"}</pre>
      </Space>}
    </Modal>
  </Card>;
}

export function ImportSourcePanel({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["import-source", projectId], queryFn: () => api<ImportSource | null>(`/projects/${projectId}/audit-logs/source`) });
  if (query.isLoading) return <Card bordered={false} loading />;
  if (query.isError) return <Card bordered={false} title="原表字段"><Alert type="error" showIcon message="原表字段加载失败" description={(query.error as Error).message} /></Card>;
  if (!query.data) return <Card bordered={false} title="原表字段"><Empty description="该项目不是由旧 Excel 导入，暂无可追溯的原表字段。" /></Card>;
  const source = query.data;
  const raw = source.source;
  const entries = raw && typeof raw === "object" && !Array.isArray(raw) ? Object.entries(raw) : [];
  if (!entries.length) return <Card bordered={false} title="原表字段"><Alert type="info" showIcon message="已找到导入来源，但原始字段为空或格式无法识别。" description={`来源：${source.sourceFile} / ${source.sheetName} / 第 ${source.sourceRowNumber} 行`} /></Card>;
  return <Card bordered={false} title="旧 Excel 原始字段">
    <Typography.Paragraph type="secondary">来源：{source.sourceFile} / {source.sheetName} / 第 {source.sourceRowNumber} 行 · 导入时间 {new Date(source.importedAt).toLocaleString("zh-CN")}</Typography.Paragraph>
    <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={entries.map(([key, value]) => ({ key, label: key, children: value === null || value === "" ? "—" : String(value) }))} />
  </Card>;
}

function LegacyImportSourcePanel({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["import-source", projectId], queryFn: () => api<ImportSource | null>(`/projects/${projectId}/audit-logs/source`) });
  if (query.isLoading) return <Card bordered={false} loading />;
  if (!query.data) return <Card bordered={false}><Empty description="该项目不是由旧 Excel 导入，暂无原表字段" /></Card>;
  const source = query.data;
  return <Card bordered={false} title="旧 Excel 原始字段">
    <Typography.Paragraph type="secondary">来源：{source.sourceFile} / {source.sheetName} / 第 {source.sourceRowNumber} 行 · 导入时间 {new Date(source.importedAt).toLocaleString("zh-CN")}</Typography.Paragraph>
    <Descriptions bordered size="small" column={2} items={Object.entries(source.source).map(([key, value]) => ({
      key, label: key, children: value === null || value === "" ? "—" : String(value),
    }))} />
  </Card>;
}
