import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database.module";
import { HealthController } from "./health.controller";
import { ProjectsModule } from "./projects/projects.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { WorkItemsModule } from "./work-items/work-items.module";
import { ResearchModule } from "./research/research.module";
import { GovernanceModule } from "./governance/governance.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { AuditModule } from "./audit/audit.module";
import { ReportsModule } from "./reports/reports.module";
import { WorkspaceModule } from "./workspace/workspace.module";

@Module({
  imports: [DatabaseModule, AuthModule, RealtimeModule, ProjectsModule, WorkItemsModule, ResearchModule, GovernanceModule, AttachmentsModule, AuditModule, ReportsModule, WorkspaceModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
