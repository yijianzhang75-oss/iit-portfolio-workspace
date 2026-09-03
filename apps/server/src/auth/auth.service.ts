import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database.service";
import type { CurrentUser } from "./auth.types";

@Injectable()
export class AuthService {
  readonly cookieName = "iit_session";

  constructor(private readonly database: DatabaseService) {}

  normalizeDisplayName(value: string) {
    return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
  }

  /**
   * 内部团队使用姓名识别操作人，并用同一个公司通用密码进入系统。
   * 不注册个人账号、不设置个人密码，也不做错误次数锁定。
   */
  async enterByName(displayNameInput: string, passwordInput: string) {
    this.verifyTeamPassword(passwordInput);
    const displayName = displayNameInput.trim().replace(/\s+/g, " ");
    const displayNameNormalized = this.normalizeDisplayName(displayName);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.sessionDays * 86_400_000);
    const now = new Date().toISOString();
    const user = this.database.transaction(() => {
      const existing = this.database.db.prepare(`
        SELECT id, display_name AS displayName, status
        FROM users WHERE display_name_normalized = ?
      `).get(displayNameNormalized) as { id: string; displayName: string; status: string } | undefined;
      if (existing) {
        if (existing.status !== "ACTIVE") throw new UnauthorizedException("该姓名当前不可用，请联系项目管理员。");
        this.database.db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
          .run(now, now, existing.id);
        this.insertSession(existing.id, token, expiresAt, now);
        return existing;
      }

      const created = { id: randomUUID(), displayName, status: "ACTIVE" };
      this.database.db.prepare(`
        INSERT INTO users (id, display_name, display_name_normalized, status, last_login_at, created_at, updated_at)
        VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)
      `).run(created.id, displayName, displayNameNormalized, now, now, now);
      this.insertSession(created.id, token, expiresAt, now);
      return created;
    });
    return { user: this.toCurrentUser(user), token, expiresAt };
  }

  // 仅供服务端测试与受控导入流程构造身份，仍使用同一套通用密码校验。
  async createIdentity(displayName: string, password?: string) {
    return this.enterByName(displayName, password ?? "");
  }

  async resolveSession(token: string): Promise<CurrentUser | null> {
    const row = this.database.db.prepare(`
      SELECT u.id, u.display_name AS displayName, u.status, s.expires_at AS expiresAt
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(this.hashToken(token)) as
      | { id: string; displayName: string; status: string; expiresAt: string }
      | undefined;
    if (!row || new Date(row.expiresAt) <= new Date() || row.status !== "ACTIVE") return null;
    return this.toCurrentUser(row);
  }

  async removeSession(token?: string) {
    if (!token) return;
    this.database.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(this.hashToken(token));
  }

  private insertSession(userId: string, token: string, expiresAt: Date, now: string) {
    this.database.db.prepare(`
      INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), this.hashToken(token), userId, expiresAt.toISOString(), now, now);
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private verifyTeamPassword(passwordInput: string) {
    const configured = process.env.TEAM_ACCESS_PASSWORD;
    if (!configured) throw new UnauthorizedException("系统尚未配置公司通用密码，请联系部署人员。");
    const expected = createHash("sha256").update(configured).digest();
    const actual = createHash("sha256").update(passwordInput).digest();
    if (!timingSafeEqual(expected, actual)) throw new UnauthorizedException("公司通用密码错误。");
  }

  private toCurrentUser(user: { id: string; displayName: string; status: string }): CurrentUser {
    return { id: user.id, displayName: user.displayName, status: user.status };
  }

  get sessionDays() {
    const parsed = Number(process.env.SESSION_DAYS ?? 30);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 365 ? parsed : 30;
  }

  get cookieSecure() {
    if (process.env.COOKIE_SECURE === "true") return true;
    if (process.env.COOKIE_SECURE === "false") return false;
    return process.env.NODE_ENV === "production";
  }
}
