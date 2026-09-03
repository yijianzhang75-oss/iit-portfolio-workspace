import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { DatabaseService } from "../database.service";
import { AuthService } from "./auth.service";
import { randomUUID } from "node:crypto";

describe("AuthService", () => {
  let database: DatabaseService;
  let auth: AuthService;

  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.NODE_ENV = "test";
    process.env.TEAM_ACCESS_PASSWORD = "team-secret";
    database = new DatabaseService();
    database.onModuleInit();
    auth = new AuthService(database);
  });

  afterEach(() => database.onModuleDestroy());

  it("creates a server identity from a name and resolves its session", async () => {
    const result = await auth.enterByName(" 测试成员 ", "team-secret");
    expect(result.user.displayName).toBe("测试成员");
    expect(await auth.resolveSession(result.token)).toEqual(result.user);
  });

  it("reuses the same identity for the same normalized name", async () => {
    const first = await auth.enterByName("Member A", "team-secret");
    const second = await auth.enterByName("  member a  ", "team-secret");
    expect(second.user.id).toBe(first.user.id);
    expect(await auth.resolveSession(second.token)).toEqual(first.user);
  });

  it("uses an existing legacy name-only identity without changing its user ID", async () => {
    const legacy = { id: randomUUID(), displayName: "Legacy Member" };
    const now = new Date().toISOString();
    database.db.prepare(`
      INSERT INTO users (id, display_name, display_name_normalized, status, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)
    `).run(legacy.id, legacy.displayName, "legacy member", now, now, now);
    expect((await auth.enterByName("legacy member", "team-secret")).user.id).toBe(legacy.id);
  });

  it("rejects an incorrect company password without creating a user", async () => {
    await expect(auth.enterByName("测试成员", "wrong-password")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.db.prepare("SELECT count(*) AS count FROM users").get()).toMatchObject({ count: 0 });
  });

  it("rejects a disabled existing identity", async () => {
    const now = new Date().toISOString();
    database.db.prepare(`
      INSERT INTO users (id, display_name, display_name_normalized, status, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, 'DISABLED', ?, ?, ?)
    `).run(randomUUID(), "停用成员", "停用成员", now, now, now);
    await expect(auth.enterByName("停用成员", "team-secret")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
