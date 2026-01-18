import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * 启动时自动执行数据库迁移
 * 用于添加新的列或表，无需手动执行 SQL
 */
@Injectable()
export class StartupMigrationService implements OnModuleInit {
  private readonly logger = new Logger(StartupMigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.runMigrations();
  }

  private async runMigrations() {
    this.logger.log("[Migration] Running startup migrations...");

    try {
      // Migration 1: Add metadata column to writing_chapters
      await this.addWritingChapterMetadata();

      // Migration 2: Create story_bible_audit_logs table and enums
      await this.createStoryBibleAuditLogs();

      this.logger.log("[Migration] Startup migrations completed");
    } catch (error) {
      this.logger.error("[Migration] Startup migration failed:", error);
      // 不阻止应用启动，只记录错误
    }
  }

  private async addWritingChapterMetadata() {
    try {
      // 检查列是否存在
      const columnExists = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM information_schema.columns
        WHERE table_name = 'writing_chapters' AND column_name = 'metadata'
      `;

      if (Number(columnExists[0].count) === 0) {
        await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "writing_chapters"
          ADD COLUMN "metadata" JSONB DEFAULT '{}'
        `);
        this.logger.log(
          "[Migration] Added metadata column to writing_chapters",
        );
      } else {
        this.logger.debug("[Migration] metadata column already exists");
      }
    } catch (error) {
      this.logger.warn("[Migration] Failed to add metadata column:", error);
    }
  }

  private async createStoryBibleAuditLogs() {
    try {
      // 检查枚举是否存在
      const enumExists = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM pg_type WHERE typname = 'StoryBibleChangeType'
      `;

      if (Number(enumExists[0].count) === 0) {
        // 创建枚举类型
        await this.prisma.$executeRawUnsafe(`
          CREATE TYPE "StoryBibleChangeType" AS ENUM ('CREATE', 'UPDATE', 'DELETE')
        `);
        this.logger.log("[Migration] Created StoryBibleChangeType enum");
      }

      const entityEnumExists = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM pg_type WHERE typname = 'StoryBibleEntityType'
      `;

      if (Number(entityEnumExists[0].count) === 0) {
        await this.prisma.$executeRawUnsafe(`
          CREATE TYPE "StoryBibleEntityType" AS ENUM (
            'BIBLE', 'CHARACTER', 'WORLD_SETTING', 'TIMELINE', 'TERMINOLOGY', 'FACTION'
          )
        `);
        this.logger.log("[Migration] Created StoryBibleEntityType enum");
      }

      // 检查表是否存在
      const tableExists = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM information_schema.tables
        WHERE table_name = 'story_bible_audit_logs'
      `;

      if (Number(tableExists[0].count) === 0) {
        // Note: Prisma String @id @default(uuid()) creates TEXT columns, not UUID
        // So we must use TEXT type here to match the story_bibles.id column
        await this.prisma.$executeRawUnsafe(`
          CREATE TABLE "story_bible_audit_logs" (
            "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
            "bible_id" TEXT NOT NULL,
            "version" INTEGER NOT NULL DEFAULT 1,
            "change_type" "StoryBibleChangeType" NOT NULL,
            "entity_type" "StoryBibleEntityType" NOT NULL,
            "entity_id" TEXT,
            "field" VARCHAR(100) NOT NULL,
            "old_value" JSONB,
            "new_value" JSONB,
            "changed_by" VARCHAR(100) NOT NULL,
            "reason" TEXT,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT "fk_story_bible_audit_bible"
              FOREIGN KEY ("bible_id")
              REFERENCES "story_bibles"("id")
              ON DELETE CASCADE
          )
        `);

        // 创建索引
        await this.prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "idx_audit_bible_version"
            ON "story_bible_audit_logs"("bible_id", "version")
        `);
        await this.prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "idx_audit_bible_entity"
            ON "story_bible_audit_logs"("bible_id", "entity_type", "entity_id")
        `);
        await this.prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "idx_audit_bible_created"
            ON "story_bible_audit_logs"("bible_id", "created_at" DESC)
        `);

        this.logger.log(
          "[Migration] Created story_bible_audit_logs table with indexes",
        );
      } else {
        this.logger.debug(
          "[Migration] story_bible_audit_logs table already exists",
        );
      }
    } catch (error) {
      this.logger.warn("[Migration] Failed to create audit logs:", error);
    }
  }
}
