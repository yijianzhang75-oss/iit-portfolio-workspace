export type User = {
  id: string;
  displayName: string;
  status: string;
};

export type Project = {
  id: string;
  projectCode: string;
  name: string;
  shortName?: string | null;
  responsiblePerson: string;
  grade: string;
  diseaseType: string;
  region?: string | null;
  province?: string | null;
  leadingPi: string;
  leadInstitution: string;
  /** Compatibility-only fields; the server no longer stores or returns them. */
  medicalOwner?: string | null;
  crcStatus?: string | null;
  edcStatus?: string | null;
  plannedCenterCount: number;
  plannedEnrollment: number;
  enrolledCount: number;
  currentStage?: string | null;
  status: string;
  summary?: string | null;
  isPublicEditable?: boolean;
  version: number;
  updatedAt: string;
  owner: { id: string; displayName: string };
  canEdit: boolean;
};

export type ProjectFormValues = Omit<
  Project,
  "id" | "version" | "updatedAt" | "owner" | "canEdit"
>;

export type Milestone = {
  id: string;
  projectId: string;
  name: string;
  templateKey?: string | null;
  plannedDate?: string | null;
  actualDate?: string | null;
  status: string;
  sortOrder: number;
  version: number;
  owner: { id: string; displayName: string };
  canEdit: boolean;
};

export type Task = {
  id: string;
  projectId: string;
  title: string;
  assigneeName: string;
  status: string;
  priority: string;
  phaseName?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  progress: number;
  notes?: string | null;
  version: number;
  owner: { id: string; displayName: string };
  canEdit: boolean;
};

export type ProjectReport = {
  projectId: string;
  completedWork?: string | null;
  risksAndIssues?: string | null;
  nextPlan?: string | null;
  supportNeeded?: string | null;
  version?: number | null;
  owner: { id: string; displayName: string };
  canEdit: boolean;
  updatedAt?: string;
};

export type ResearchCenter = {
  id: string;
  projectId: string;
  centerCode?: string | null;
  name: string;
  province?: string | null;
  principalInvestigator?: string | null;
  stage: string;
  plannedEnrollment: number;
  enrolledCount: number;
  activeCount: number;
  followupCompleteCount: number;
  version: number;
  owner: { id: string; displayName: string };
  canEdit: boolean;
};

export type EnrollmentSnapshot = {
  id: string;
  projectId: string;
  snapshotDate: string;
  enrolledCount: number;
  activeCount: number;
  followupCompleteCount: number;
  notes?: string | null;
  version: number;
  owner: { id: string; displayName: string };
  canEdit: boolean;
};

export type ProjectRisk = {
  id: string; projectId: string; title: string; level: string; status: string;
  responsiblePerson?: string | null; dueDate?: string | null; mitigation?: string | null;
  version: number; owner: { id: string; displayName: string }; canEdit: boolean;
};

export type AnnualGoal = {
  id: string; projectId: string; year: number; title: string; status: string;
  plannedDate?: string | null; completionNotes?: string | null;
  version: number; owner: { id: string; displayName: string }; canEdit: boolean;
};

export type ProjectBudget = {
  id: string; projectId: string; year: number; category: string;
  budgetAmount: number; spentAmount: number; notes?: string | null;
  version: number; owner: { id: string; displayName: string }; canEdit: boolean;
};

export type ProjectBudgetOverview = {
  projectId: string;
  totalBudgetWan: number;
  medicalBudgetWan: number;
  salesBudgetWan: number;
  salesAllocatedBudgetWan: number;
  version: number | null;
  owner: { id: string; displayName: string } | null;
  canEdit: boolean;
};

export type AnnualProjectTarget = {
  id: string;
  projectId: string;
  year: number;
  targetEnrollment: number;
  enrolledCount: number;
  activeCount: number;
  followupCompleteCount: number;
  dropoutCount: number;
  version: number;
  owner: { id: string; displayName: string };
  canEdit: boolean;
};

export type Attachment = {
  id: string; projectId: string; originalName: string; mimeType: string;
  sizeBytes: number; sha256: string; createdAt: string;
  uploader: { id: string; displayName: string }; canDelete: boolean; downloadUrl: string;
};

export type AuditLog = {
  id: string; action: string; entityType: string; entityId: string;
  actor: { id: string; displayName: string };
  before: unknown; after: unknown; createdAt: string;
};

export type ImportSource = {
  sourceRowNumber: number; sourceFile: string; sourceSha256: string;
  sheetName: string; importedAt: string; source: Record<string, string | number | boolean | null>;
};
