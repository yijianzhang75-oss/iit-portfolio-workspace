import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { IS_PUBLIC_KEY } from "../public.decorator";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[this.auth.cookieName];
    const user = token ? await this.auth.resolveSession(token) : null;
    if (!user) throw new UnauthorizedException("登录已失效，请重新进入系统");
    request.currentUser = user;
    return true;
  }
}
