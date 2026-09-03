import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import type { CurrentUser as CurrentUserValue } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { AttachmentsService } from "./attachments.service";

const maxAttachmentBytes = 50 * 1024 * 1024;

@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get("projects/:projectId/attachments")
  list(@CurrentUser() user: CurrentUserValue, @Param("projectId") projectId: string) {
    return this.attachments.list(user, projectId);
  }

  @Post("projects/:projectId/attachments")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: maxAttachmentBytes, files: 1 } }))
  upload(
    @CurrentUser() user: CurrentUserValue,
    @Param("projectId") projectId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.attachments.upload(user, projectId, file);
  }

  @Get("attachments/:id/download")
  download(
    @CurrentUser() user: CurrentUserValue,
    @Param("id") id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = this.attachments.open(user, id);
    response.setHeader("Content-Type", result.mimeType);
    response.setHeader("Content-Length", result.sizeBytes.toString());
    response.setHeader("Content-Disposition", this.contentDisposition(result.originalName, request.headers["user-agent"]));
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(result.stream);
  }

  @Delete("attachments/:id")
  remove(@CurrentUser() user: CurrentUserValue, @Param("id") id: string) {
    return this.attachments.remove(user, id);
  }

  private contentDisposition(filename: string, _userAgent?: string) {
    const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "attachment";
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
}

