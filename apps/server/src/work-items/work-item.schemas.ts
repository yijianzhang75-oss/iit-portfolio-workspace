import { z } from "zod";

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD")
  .optional()
  .nullable();

export const updateMilestoneSchema = z.object({
  plannedDate: optionalDate,
  actualDate: optionalDate,
  version: z.coerce.number().int().positive(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "事项名称不能为空").max(200),
  assigneeName: z.string().trim().min(1, "负责人不能为空").max(50),
  status: z.enum(["未开始", "进行中", "已阻塞", "已完成", "已取消"]).default("未开始"),
  priority: z.enum(["低", "中", "高", "紧急"]).default("中"),
  phaseName: z.string().trim().max(100).optional().nullable(),
  startDate: optionalDate,
  dueDate: optionalDate,
  progress: z.coerce.number().int().min(0).max(100).default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  version: z.coerce.number().int().positive(),
});

export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
