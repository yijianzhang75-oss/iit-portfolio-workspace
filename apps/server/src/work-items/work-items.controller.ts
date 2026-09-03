import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { CurrentUser as CurrentUserValue } from "../auth/auth.types";
import {
  createTaskSchema,
  updateMilestoneSchema,
  updateTaskSchema,
} from "./work-item.schemas";
import { WorkItemsService } from "./work-items.service";

@Controller()
export class WorkItemsController {
  constructor(private readonly workItems: WorkItemsService) {}

  @Get("projects/:projectId/milestones")
  listMilestones(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.workItems.listMilestones(user, projectId);
  }

  @Patch("milestones/:id")
  updateMilestone(@CurrentUser() user: CurrentUserValue, @Param("id") id: string, @Body() body: unknown) {
    return this.workItems.updateMilestone(user, id, updateMilestoneSchema.parse(body));
  }

  @Get("projects/:projectId/tasks")
  listTasks(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.workItems.listTasks(user, projectId);
  }

  @Post("projects/:projectId/tasks")
  createTask(
    @CurrentUser() user: CurrentUserValue,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.workItems.createTask(user, projectId, createTaskSchema.parse(body));
  }

  @Patch("tasks/:id")
  updateTask(@CurrentUser() user: CurrentUserValue, @Param("id") id: string, @Body() body: unknown) {
    return this.workItems.updateTask(user, id, updateTaskSchema.parse(body));
  }
}
