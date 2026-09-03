import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { CurrentUser as CurrentUserValue } from "../auth/auth.types";
import {
  createBudgetSchema, createGoalSchema, createRiskSchema,
  updateBudgetSchema, updateGoalSchema, updateRiskSchema, updateBudgetOverviewSchema,
} from "./governance.schemas";
import { GovernanceService } from "./governance.service";

@Controller()
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get("projects/:projectId/risks")
  listRisks(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) { return this.governance.listRisks(user, projectId); }
  @Post("projects/:projectId/risks")
  createRisk(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string, @Body() body: unknown) { return this.governance.createRisk(user, projectId, createRiskSchema.parse(body)); }
  @Patch("risks/:id")
  updateRisk(@CurrentUser() user: CurrentUserValue, @Param("id") id: string, @Body() body: unknown) { return this.governance.updateRisk(user, id, updateRiskSchema.parse(body)); }

  @Get("projects/:projectId/goals")
  listGoals(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) { return this.governance.listGoals(user, projectId); }
  @Post("projects/:projectId/goals")
  createGoal(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string, @Body() body: unknown) { return this.governance.createGoal(user, projectId, createGoalSchema.parse(body)); }
  @Patch("goals/:id")
  updateGoal(@CurrentUser() user: CurrentUserValue, @Param("id") id: string, @Body() body: unknown) { return this.governance.updateGoal(user, id, updateGoalSchema.parse(body)); }

  @Get("projects/:projectId/budgets")
  listBudgets(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) { return this.governance.listBudgets(user, projectId); }
  @Post("projects/:projectId/budgets")
  createBudget(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string, @Body() body: unknown) { return this.governance.createBudget(user, projectId, createBudgetSchema.parse(body)); }
  @Patch("budgets/:id")
  updateBudget(@CurrentUser() user: CurrentUserValue, @Param("id") id: string, @Body() body: unknown) { return this.governance.updateBudget(user, id, updateBudgetSchema.parse(body)); }

  @Get("projects/:projectId/budget-overview")
  budgetOverview(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) { return this.governance.budgetOverview(user, projectId); }
  @Patch("projects/:projectId/budget-overview")
  updateBudgetOverview(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string, @Body() body: unknown) { return this.governance.updateBudgetOverview(user, projectId, updateBudgetOverviewSchema.parse(body)); }
}
