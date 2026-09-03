import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { CurrentUser as CurrentUserValue } from "./auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserValue => {
    const request = context.switchToHttp().getRequest();
    return request.currentUser;
  },
);
