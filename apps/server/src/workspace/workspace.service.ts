import { Injectable } from "@nestjs/common";
import type { CurrentUser } from "../auth/auth.types";
import { GovernanceService } from "../governance/governance.service";
import { ProjectsService } from "../projects/projects.service";
import { ResearchService } from "../research/research.service";
import { WorkItemsService } from "../work-items/work-items.service";

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly workItems: WorkItemsService,
    private readonly research: ResearchService,
    private readonly governance: GovernanceService,
  ) {}

  snapshot(user: CurrentUser) {
    const projects = this.projects.list(user);
    const data = {
      tasks: [] as unknown[],
      milestones: [] as unknown[],
      risks: [] as unknown[],
      budgets: [] as unknown[],
      targets: [] as unknown[],
      budgetOverviews: [] as unknown[],
      centers: [] as unknown[],
      snapshots: [] as unknown[],
    };

    for (const project of projects) {
      data.tasks.push(...this.workItems.listTasks(user, project.id));
      data.milestones.push(...this.workItems.listMilestones(user, project.id));
      data.targets.push(...this.research.listAnnualTargets(user, project.id));
      data.budgetOverviews.push(this.governance.budgetOverview(user, project.id));
      data.budgets.push(...this.governance.listBudgets(user, project.id));
    }

    return { projects, data };
  }
}
