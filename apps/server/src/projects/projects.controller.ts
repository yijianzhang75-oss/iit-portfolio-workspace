import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { CurrentUser as CurrentUserValue } from "../auth/auth.types";
import { createProjectSchema, deleteProjectSchema, updateProjectSchema } from "./project.schemas";
import { ProjectsService } from "./projects.service";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserValue, @Query("search") search?: string) {
    return this.projects.list(user, search);
  }

  @Get("favorites/mine")
  favoriteIds(@CurrentUser() user: CurrentUserValue) {
    return this.projects.listFavoriteIds(user);
  }

  @Post("favorites/:projectId")
  addFavorite(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.projects.addFavorite(user, projectId);
  }

  @Delete("favorites/:projectId")
  removeFavorite(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.projects.removeFavorite(user, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: CurrentUserValue, @Param("id") id: string) {
    return this.projects.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserValue, @Body() body: unknown) {
    return this.projects.create(user, createProjectSchema.parse(body));
  }

  @Patch(":id")
  update(@CurrentUser() user: CurrentUserValue, @Param("id") id: string, @Body() body: unknown) {
    return this.projects.update(user, id, updateProjectSchema.parse(body));
  }

  @Delete(":id")
  remove(@CurrentUser() user: CurrentUserValue, @Param("id") id: string, @Body() body: unknown) {
    return this.projects.remove(user, id, deleteProjectSchema.parse(body));
  }
}
