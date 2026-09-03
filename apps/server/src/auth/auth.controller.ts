import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { z } from "zod";
import { Public } from "../public.decorator";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import type { CurrentUser as CurrentUserValue } from "./auth.types";

const enterSchema = z.object({
  displayName: z.string().trim().min(2, "姓名至少2个字符").max(30, "姓名最多30个字符"),
  password: z.string().min(1, "请输入公司通用密码").max(100, "密码长度不能超过100个字符"),
});

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("enter")
  async enter(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = enterSchema.parse(body);
    const result = await this.auth.enterByName(input.displayName, input.password);
    response.cookie(this.auth.cookieName, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.auth.cookieSecure,
      expires: result.expiresAt,
      path: "/",
    });
    return { user: result.user };
  }

  @Get("me")
  me(@CurrentUser() user: CurrentUserValue) {
    return { user };
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.removeSession(request.cookies?.[this.auth.cookieName]);
    response.clearCookie(this.auth.cookieName, { path: "/" });
    return { ok: true };
  }
}
