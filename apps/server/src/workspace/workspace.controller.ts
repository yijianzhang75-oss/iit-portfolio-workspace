import { Controller, Get } from "@nestjs/common";
import type { CurrentUser as CurrentUserValue } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { WorkspaceService } from "./workspace.service";

@Controller("workspace")
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get("snapshot")
  snapshot(@CurrentUser() user: CurrentUserValue) {
    return this.workspace.snapshot(user);
  }
}
