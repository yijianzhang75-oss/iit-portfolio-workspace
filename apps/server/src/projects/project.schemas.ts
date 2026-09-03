import { z } from "zod";

const text = (label: string, max = 100) => z.string().trim().min(1, `${label}不能为空`).max(max);
const optionalText = (max = 2000) => z.string().trim().max(max).optional().nullable();

export const createProjectSchema = z.object({
  projectCode: text("项目编码", 50),
  name: text("项目名称", 200),
  shortName: optionalText(100),
  responsiblePerson: text("项目负责人", 50),
  grade: z.enum(["S", "A", "B", "C", "D"]),
  diseaseType: text("疾病类型", 100),
  region: z.enum(["东区", "西区", "南区", "北区", "中区"]).optional().nullable(),
  province: optionalText(50),
  leadingPi: text("Leading-PI", 100),
  leadInstitution: text("组长单位", 200),
  plannedCenterCount: z.coerce.number().int().min(0).max(10000),
  plannedEnrollment: z.coerce.number().int().min(0).max(10_000_000),
  enrolledCount: z.coerce.number().int().min(0).max(10_000_000).optional(),
  currentStage: optionalText(100),
  status: z.enum(["筹备中", "进行中", "暂停", "已完成", "已终止"]).optional(),
  summary: optionalText(5000),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  version: z.coerce.number().int().positive(),
});

export const deleteProjectSchema = z.object({
  version: z.coerce.number().int().positive(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type DeleteProjectInput = z.infer<typeof deleteProjectSchema>;
