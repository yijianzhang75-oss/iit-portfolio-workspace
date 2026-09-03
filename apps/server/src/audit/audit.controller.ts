import { Controller, Get, Param } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { CurrentUser as CurrentUserValue } from "../auth/auth.types";
import { AuditService } from "./audit.service";

@Controller("projects/:projectId/audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.audit.list(user, projectId);
  }

  @Get("source")
  source(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.audit.importSource(user, projectId);
  }
}
