import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { CurrentUser as CurrentUserValue } from "../auth/auth.types";
import {
  createCenterSchema,
  createSnapshotSchema,
  createAnnualTargetSchema,
  updateCenterSchema,
  updateSnapshotSchema,
  updateAnnualTargetSchema,
} from "./research.schemas";
import { ResearchService } from "./research.service";

@Controller()
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get("projects/:projectId/centers")
  listCenters(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.research.listCenters(user, projectId);
  }

  @Post("projects/:projectId/centers")
  createCenter(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string, @Body() body: unknown) {
    return this.research.createCenter(user, projectId, createCenterSchema.parse(body));
  }

  @Patch("centers/:id")
  updateCenter(@CurrentUser() user: CurrentUserValue, @Param("id") id: string, @Body() body: unknown) {
    return this.research.updateCenter(user, id, updateCenterSchema.parse(body));
  }

  @Get("projects/:projectId/enrollment-snapshots")
  listSnapshots(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.research.listSnapshots(user, projectId);
  }

  @Post("projects/:projectId/enrollment-snapshots")
  createSnapshot(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string, @Body() body: unknown) {
    return this.research.createSnapshot(user, projectId, createSnapshotSchema.parse(body));
  }

  @Patch("enrollment-snapshots/:id")
  updateSnapshot(@CurrentUser() user: CurrentUserValue, @Param("id") id: string, @Body() body: unknown) {
    return this.research.updateSnapshot(user, id, updateSnapshotSchema.parse(body));
  }

  @Get("projects/:projectId/annual-targets")
  listAnnualTargets(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.research.listAnnualTargets(user, projectId);
  }

  @Post("projects/:projectId/annual-targets")
  createAnnualTarget(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string, @Body() body: unknown) {
    return this.research.createAnnualTarget(user, projectId, createAnnualTargetSchema.parse(body));
  }

  @Patch("annual-targets/:id")
  updateAnnualTarget(@CurrentUser() user: CurrentUserValue, @Param("id") id: string, @Body() body: unknown) {
    return this.research.updateAnnualTarget(user, id, updateAnnualTargetSchema.parse(body));
  }
}
