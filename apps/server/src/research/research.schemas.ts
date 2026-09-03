import { z } from "zod";

const count = z.coerce.number().int().min(0).max(10_000_000);
const optionalText = (max = 2000) => z.string().trim().max(max).optional().nullable();

export const createCenterSchema = z.object({
  centerCode: optionalText(50),
  name: z.string().trim().min(1, "中心名称不能为空").max(200),
  province: optionalText(50),
  principalInvestigator: optionalText(100),
  stage: z.enum(["待启动", "启动中", "已启动", "入组中", "随访中", "已关闭"]).default("待启动"),
  plannedEnrollment: count.default(0),
  enrolledCount: count.default(0),
  activeCount: count.default(0),
  followupCompleteCount: count.default(0),
});

export const updateCenterSchema = createCenterSchema.partial().extend({
  version: z.coerce.number().int().positive(),
});

export const createSnapshotSchema = z.object({
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  enrolledCount: count.default(0),
  activeCount: count.default(0),
  followupCompleteCount: count.default(0),
  notes: optionalText(1000),
});

export const updateSnapshotSchema = createSnapshotSchema.partial().extend({
  version: z.coerce.number().int().positive(),
});

export const createAnnualTargetSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  targetEnrollment: count.default(0),
  enrolledCount: count.default(0),
  activeCount: count.default(0),
  followupCompleteCount: count.default(0),
  dropoutCount: count.default(0),
});

export const updateAnnualTargetSchema = createAnnualTargetSchema.partial().extend({
  version: z.coerce.number().int().positive(),
});

export type CreateCenterInput = z.infer<typeof createCenterSchema>;
export type UpdateCenterInput = z.infer<typeof updateCenterSchema>;
export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;
export type UpdateSnapshotInput = z.infer<typeof updateSnapshotSchema>;
export type CreateAnnualTargetInput = z.infer<typeof createAnnualTargetSchema>;
export type UpdateAnnualTargetInput = z.infer<typeof updateAnnualTargetSchema>;
