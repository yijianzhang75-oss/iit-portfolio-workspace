import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { CurrentUser as CurrentUserValue } from "../auth/auth.types";
import { saveProjectReportSchema } from "./report.schemas";
import { ReportsService } from "./reports.service";

@Controller("projects/:projectId/report")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  get(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.reports.get(user, projectId);
  }

  @Put()
  save(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string, @Body() body: unknown) {
    return this.reports.save(user, projectId, saveProjectReportSchema.parse(body));
  }
}
