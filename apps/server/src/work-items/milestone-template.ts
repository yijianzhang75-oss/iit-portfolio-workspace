export const projectMilestoneTemplates = [
  { key: "protocol-finalized", name: "研究方案定稿时间", sortOrder: 10 },
  { key: "scientific-review-approved", name: "科学性审查/立项通过时间", sortOrder: 20 },
  { key: "ethics-approval", name: "伦理批件获取时间", sortOrder: 30 },
  { key: "contract-signed", name: "合同签署时间", sortOrder: 40 },
  { key: "study-started", name: "研究启动时间", sortOrder: 50 },
  { key: "first-subject-enrolled", name: "首例入组时间", sortOrder: 60 },
  { key: "enrollment-target", name: "入组完成计划时间", sortOrder: 70 },
  { key: "followup-completed", name: "随访完成时间", sortOrder: 80 },
  { key: "data-cleaning-completed", name: "数据清理完成时间", sortOrder: 90 },
  { key: "statistical-analysis-completed", name: "统计分析完成时间", sortOrder: 100 },
  { key: "manuscript-completed", name: "文章撰写完成时间", sortOrder: 110 },
  { key: "center-closed", name: "中心关闭时间", sortOrder: 120 },
] as const;

export function milestoneStatus(plannedDate?: string | null, actualDate?: string | null, referenceDate = new Date().toISOString().slice(0, 10)) {
  if (actualDate) return "已完成";
  if (!plannedDate) return "未开始";
  if (plannedDate < referenceDate) return "已延期";
  if (plannedDate === referenceDate) return "进行中";
  return "未开始";
}
