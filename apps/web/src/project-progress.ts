import type { Milestone, Project, Task } from "./types";

export type ProjectHealth = "正常" | "需关注" | "已延期" | "待完善";

const stageLabels: Record<string, string> = {
  "protocol-finalized": "科学性审查",
  "scientific-review-approved": "科学性审查",
  "ethics-approval": "伦理审批",
  "contract-signed": "合同签署",
  "study-started": "研究启动",
  "first-subject-enrolled": "入组与监查",
  "enrollment-target": "入组与监查",
  "followup-completed": "随访完成",
  "data-cleaning-completed": "数据分析",
  "statistical-analysis-completed": "数据分析",
  "manuscript-completed": "结题与发表",
  "center-closed": "结题与发表",
};

export const today = () => new Date().toISOString().slice(0, 10);

export function milestoneRuntimeStatus(item: Pick<Milestone, "plannedDate" | "actualDate">, referenceDate = today()) {
  if (item.actualDate) return "已完成";
  if (!item.plannedDate) return "未开始";
  if (item.plannedDate < referenceDate) return "已延期";
  if (item.plannedDate === referenceDate) return "进行中";
  return "未开始";
}

export function dateDifferenceDays(plannedDate?: string | null, actualDate?: string | null) {
  if (!plannedDate || !actualDate) return null;
  const milliseconds = new Date(`${actualDate}T00:00:00`).getTime() - new Date(`${plannedDate}T00:00:00`).getTime();
  return Math.round(milliseconds / 86_400_000);
}

export function dateDifferenceLabel(item: Pick<Milestone, "plannedDate" | "actualDate">) {
  const days = dateDifferenceDays(item.plannedDate, item.actualDate);
  if (days === null) return "—";
  if (days === 0) return "按计划完成";
  return days > 0 ? `延期 ${days} 天` : `提前 ${Math.abs(days)} 天`;
}

export function projectStage(milestones: Milestone[], fallback?: string | null) {
  const next = [...milestones]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .find((item) => milestoneRuntimeStatus(item) !== "已完成");
  if (!next) return milestones.length ? "已结题" : (fallback || "待排期");
  return stageLabels[next.templateKey || ""] || next.name || fallback || "待排期";
}

export function getProjectHealth(project: Project, milestones: Milestone[], tasks: Task[]) {
  const statuses = milestones.map((item) => milestoneRuntimeStatus(item));
  const overdueMilestones = statuses.filter((status) => status === "已延期").length;
  const lateCompleted = milestones.filter((item) => (dateDifferenceDays(item.plannedDate, item.actualDate) || 0) > 0).length;
  const unplannedMilestones = milestones.filter((item) => !item.plannedDate).length;
  const overdueTasks = tasks.filter((item) => item.dueDate && item.dueDate < today() && !["已完成", "已取消"].includes(item.status)).length;
  const upcoming = milestones.filter((item) => item.plannedDate && item.plannedDate >= today() && item.plannedDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) && !item.actualDate).length;

  if (overdueMilestones || overdueTasks) return { value: "已延期" as const, reason: overdueMilestones ? `${overdueMilestones} 个里程碑已延期` : `${overdueTasks} 个事项已延期`, upcoming };
  if (lateCompleted || upcoming) return { value: "需关注" as const, reason: lateCompleted ? `${lateCompleted} 个节点存在完成偏差` : `${upcoming} 个节点将在 30 天内到期`, upcoming };
  if (!milestones.length || unplannedMilestones >= 6) return { value: "待完善" as const, reason: milestones.length ? `${unplannedMilestones} 个固定里程碑尚未排期` : "尚未生成固定里程碑", upcoming };
  if (project.status === "暂停") return { value: "需关注" as const, reason: "项目当前处于暂停状态", upcoming };
  return { value: "正常" as const, reason: "当前无延期节点或高风险事项", upcoming };
}
