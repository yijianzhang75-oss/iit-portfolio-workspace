import { Module } from "@nestjs/common";
import { GovernanceModule } from "../governance/governance.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResearchModule } from "../research/research.module";
import { WorkItemsModule } from "../work-items/work-items.module";
import { WorkspaceController } from "./workspace.controller";
import { WorkspaceService } from "./workspace.service";

@Module({
  imports: [ProjectsModule, WorkItemsModule, ResearchModule, GovernanceModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
})
export class WorkspaceModule {}
