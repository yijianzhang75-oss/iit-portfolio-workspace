import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import type { CurrentUser } from "../auth/auth.types";
import { DatabaseService } from "../database.service";
import { ProjectsGateway } from "../realtime/projects.gateway";

type AttachmentRow = {
  id: string;
  projectId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedById: string;
  uploaderDisplayName: string;
  createdAt: string;
};

const allowedExtensions = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".png", ".jpg", ".jpeg", ".txt", ".csv", ".zip",
]);

@Injectable()
export class AttachmentsService {
  private readonly storagePath: string;

  constructor(private readonly database: DatabaseService, private readonly realtime: ProjectsGateway) {
    const configured = process.env.ATTACHMENT_PATH ?? "./data/attachments";
    this.storagePath = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
    mkdirSync(this.storagePath, { recursive: true });
  }

  list(user: CurrentUser, projectId: string) {
    this.assertProject(projectId);
    return (this.database.db.prepare(`
      SELECT a.id, a.project_id AS projectId, a.original_name AS originalName,
        a.stored_name AS storedName, a.mime_type AS mimeType, a.size_bytes AS sizeBytes,
        a.sha256, a.uploaded_by_id AS uploadedById, u.display_name AS uploaderDisplayName,
        a.created_at AS createdAt
      FROM attachments a JOIN users u ON u.id = a.uploaded_by_id
      WHERE a.project_id = ? AND a.deleted_at IS NULL
      ORDER BY a.created_at DESC
    `).all(projectId) as unknown as AttachmentRow[]).map((row) => this.present(row, user.id));
  }

  upload(user: CurrentUser, projectId: string, file?: Express.Multer.File) {
    this.assertProject(projectId);
    if (!file) throw new BadRequestException("请选择要上传的文件");
    const originalName = this.normalizeFilename(file.originalname);
    const extension = extname(originalName).toLocaleLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw new BadRequestException("仅支持 PDF、Office、图片、文本、CSV 和 ZIP 文件");
    }
    if (file.size <= 0) throw new BadRequestException("不能上传空文件");
    if (file.size > 50 * 1024 * 1024) throw new BadRequestException("单个附件不能超过 50MB");

    const id = randomUUID();
    const storedName = `${randomUUID()}${extension}`;
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const now = new Date().toISOString();
    const destination = resolve(this.storagePath, storedName);
    writeFileSync(destination, file.buffer, { flag: "wx", mode: 0o640 });

    try {
      this.database.transaction(() => {
        this.database.db.prepare(`
          INSERT INTO attachments (
            id, project_id, original_name, stored_name, mime_type, size_bytes,
            sha256, uploaded_by_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, projectId, originalName, storedName, file.mimetype || "application/octet-stream", file.size, sha256, user.id, now);
        this.writeAudit("CREATE", id, user.id, null, { projectId, originalName, sizeBytes: file.size, sha256 });
      });
    } catch (error) {
      // 文件保留为孤立文件，便于人工恢复；备份巡检会报告它，不做不可恢复删除。
      throw error;
    }
    const row = this.find(id)!;
    this.realtime.projectChanged({ projectId, action: "attachment.created", version: 1 });
    return this.present(row, user.id);
  }

  open(_user: CurrentUser, id: string) {
    const row = this.find(id);
    if (!row) throw new NotFoundException("附件不存在");
    const path = resolve(this.storagePath, row.storedName);
    if (!existsSync(path)) throw new NotFoundException("附件文件缺失，请联系部署人员从备份恢复");
    return { ...row, stream: createReadStream(path) };
  }

  remove(user: CurrentUser, id: string) {
    const row = this.find(id);
    if (!row) throw new NotFoundException("附件不存在");
    if (row.uploadedById !== user.id) throw new ForbiddenException("只有附件上传人可以移除");
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.db.prepare("UPDATE attachments SET deleted_at = ? WHERE id = ? AND uploaded_by_id = ? AND deleted_at IS NULL")
        .run(now, id, user.id);
      this.writeAudit("DELETE", id, user.id, row, { deletedAt: now });
    });
    this.realtime.projectChanged({ projectId: row.projectId, action: "attachment.deleted", version: 1 });
    return { ok: true, recoverable: true };
  }

  private find(id: string) {
    return this.database.db.prepare(`
      SELECT a.id, a.project_id AS projectId, a.original_name AS originalName,
        a.stored_name AS storedName, a.mime_type AS mimeType, a.size_bytes AS sizeBytes,
        a.sha256, a.uploaded_by_id AS uploadedById, u.display_name AS uploaderDisplayName,
        a.created_at AS createdAt
      FROM attachments a JOIN users u ON u.id = a.uploaded_by_id
      WHERE a.id = ? AND a.deleted_at IS NULL
    `).get(id) as unknown as AttachmentRow | undefined;
  }

  private assertProject(projectId: string) {
    if (!this.database.db.prepare("SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL").get(projectId)) {
      throw new NotFoundException("项目不存在");
    }
  }

  private present(row: AttachmentRow, userId: string) {
    const { storedName: _storedName, ...attachment } = row;
    return {
      ...attachment,
      uploader: { id: row.uploadedById, displayName: row.uploaderDisplayName },
      canDelete: row.uploadedById === userId,
      downloadUrl: `/api/v1/attachments/${row.id}/download`,
    };
  }

  private normalizeFilename(name: string) {
    const candidate = name.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim();
    if (!candidate || candidate.length > 180) throw new BadRequestException("附件文件名无效或过长");
    return candidate;
  }

  private writeAudit(action: string, entityId: string, userId: string, before: unknown, after: unknown) {
    this.database.db.prepare(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, user_id, before_json, after_json, created_at)
      VALUES (?, ?, 'ATTACHMENT', ?, ?, ?, ?, ?)
    `).run(randomUUID(), action, entityId, userId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, new Date().toISOString());
  }
}

