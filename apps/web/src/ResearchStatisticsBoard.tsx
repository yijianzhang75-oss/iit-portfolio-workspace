import type { AnnualProjectTarget, Milestone, Project, ProjectBudget, ProjectBudgetOverview, Task } from "./types";

type ResearchData = { tasks: Task[]; milestones: Milestone[]; targets: AnnualProjectTarget[]; budgets: ProjectBudget[]; budgetOverviews: ProjectBudgetOverview[] };

/** Historical compatibility stub after removal of the Feishu statistics dashboard. */
export function ResearchStatisticsBoard(_: { projects: Project[]; data: ResearchData; onProject: (project: Project) => void }) { void _; return null; }
