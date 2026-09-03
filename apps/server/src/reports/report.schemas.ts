import { z } from "zod";

const reportText = z.string().trim().max(5000).optional().nullable();

export const saveProjectReportSchema = z.object({
  completedWork: reportText,
  risksAndIssues: reportText,
  nextPlan: reportText,
  supportNeeded: reportText,
  version: z.coerce.number().int().positive().optional(),
});

export type SaveProjectReportInput = z.infer<typeof saveProjectReportSchema>;
