import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly db: DatabaseSync;

  constructor() {
    const configured = process.env.DATABASE_PATH ?? "./data/iit-pm-dev.db";
    const databasePath = configured === ":memory:" ? configured : isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
  }

  onModuleInit() {
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.runMigrations();
  }

  onModuleDestroy() {
    this.db.close();
  }

  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
    const migrationDir = process.env.MIGRATION_DIR
      ? resolve(process.env.MIGRATION_DIR)
      : [
          resolve(process.cwd(), "database/migrations"),
          resolve(process.cwd(), "../../database/migrations"),
        ].find((candidate) => existsSync(candidate)) ?? resolve(process.cwd(), "database/migrations");
    if (!existsSync(migrationDir)) return;
    const applied = new Set(
      (this.db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: string }>).map(
        (row) => row.version,
      ),
    );
    for (const filename of readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()) {
      if (applied.has(filename)) continue;
      const sql = readFileSync(join(migrationDir, filename), "utf8");
      this.transaction(() => {
        this.db.exec(sql);
        this.db
          .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(filename, new Date().toISOString());
      });
    }
  }

}
