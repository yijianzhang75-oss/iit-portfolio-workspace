import { z } from "zod";

const optionalText = (max = 2000) => z.string().trim().max(max).optional().nullable();
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD").optional().nullable();
const year = z.coerce.number().int().min(2000).max(2100);
const money = z.coerce.number().min(0).max(1_000_000_000).multipleOf(0.01, "金额最多保留两位小数");

export const createRiskSchema = z.object({
  title: z.string().trim().min(1, "风险名称不能为空").max(200),
  level: z.enum(["低", "中", "高", "严重"]).default("中"),
  status: z.enum(["开放", "监控中", "已解决", "已接受"]).default("开放"),
  responsiblePerson: optionalText(50),
  dueDate: optionalDate,
  mitigation: optionalText(2000),
});
export const updateRiskSchema = createRiskSchema.partial().extend({ version: z.coerce.number().int().positive() });

export const createGoalSchema = z.object({
  year,
  title: z.string().trim().min(1, "目标名称不能为空").max(200),
  status: z.enum(["未开始", "进行中", "已完成", "已延期", "已取消"]).default("未开始"),
  plannedDate: optionalDate,
  completionNotes: optionalText(2000),
});
export const updateGoalSchema = createGoalSchema.partial().extend({ version: z.coerce.number().int().positive() });

export const createBudgetSchema = z.object({
  year,
  category: z.string().trim().min(1, "预算类别不能为空").max(100),
  budgetAmount: money.default(0),
  spentAmount: money.default(0),
  notes: optionalText(1000),
});
export const updateBudgetSchema = createBudgetSchema.partial().extend({ version: z.coerce.number().int().positive() });

export const updateBudgetOverviewSchema = z.object({
  totalBudgetWan: money.default(0),
  medicalBudgetWan: money.default(0),
  salesBudgetWan: money.default(0),
  salesAllocatedBudgetWan: money.default(0),
  version: z.coerce.number().int().positive().optional(),
}).superRefine((value, context) => {
  if (value.medicalBudgetWan + value.salesBudgetWan > value.totalBudgetWan) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "医学预算与销售预算之和不能超过项目总预算", path: ["totalBudgetWan"] });
  }
  if (value.salesAllocatedBudgetWan > value.salesBudgetWan) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "销售已划拨预算不能超过销售预算", path: ["salesAllocatedBudgetWan"] });
  }
});

export type CreateRiskInput = z.infer<typeof createRiskSchema>;
export type UpdateRiskInput = z.infer<typeof updateRiskSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type UpdateBudgetOverviewInput = z.infer<typeof updateBudgetOverviewSchema>;
