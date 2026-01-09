import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log("✅ Prisma connected to database");

    // Ensure resource_upvotes table exists (migration fallback)
    await this.ensureResourceUpvotesTable();

    // Ensure AI Coding columns exist (critical for AI Coding feature)
    await this.ensureAiCodingColumns();

    // Ensure system_settings columns exist
    await this.ensureSystemSettingsColumns();

    // Ensure AI Writing columns exist (critical fix for chapter saving)
    await this.ensureAiWritingColumns();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Ensure resource_upvotes table exists
   * This is a fallback in case the migration wasn't applied
   */
  private async ensureResourceUpvotesTable(): Promise<void> {
    try {
      // Check if table exists
      const result = await this.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'resource_upvotes'
        )
      `;

      if (!result[0]?.exists) {
        this.logger.log("Creating resource_upvotes table...");

        // Create the table
        await this.$executeRaw`
          CREATE TABLE IF NOT EXISTS "resource_upvotes" (
            "id" TEXT NOT NULL,
            "user_id" TEXT NOT NULL,
            "resource_id" TEXT NOT NULL,
            "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "resource_upvotes_pkey" PRIMARY KEY ("id")
          )
        `;

        // Create indexes
        await this.$executeRaw`
          CREATE INDEX IF NOT EXISTS "resource_upvotes_user_id_idx"
          ON "resource_upvotes"("user_id")
        `;

        await this.$executeRaw`
          CREATE INDEX IF NOT EXISTS "resource_upvotes_resource_id_idx"
          ON "resource_upvotes"("resource_id")
        `;

        await this.$executeRaw`
          CREATE UNIQUE INDEX IF NOT EXISTS "resource_upvotes_user_id_resource_id_key"
          ON "resource_upvotes"("user_id", "resource_id")
        `;

        // Add foreign keys
        await this.$executeRaw`
          ALTER TABLE "resource_upvotes"
          ADD CONSTRAINT "resource_upvotes_user_id_fkey"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `;

        await this.$executeRaw`
          ALTER TABLE "resource_upvotes"
          ADD CONSTRAINT "resource_upvotes_resource_id_fkey"
          FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `;

        this.logger.log("✅ resource_upvotes table created successfully");
      } else {
        this.logger.debug("resource_upvotes table already exists");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Log but don't fail - the table might already exist or migration will handle it
      this.logger.warn(
        `Could not ensure resource_upvotes table: ${errorMessage}`,
      );
    }
  }

  /**
   * Ensure AI Coding columns exist
   * This is critical for AI Coding feature to work
   */
  private async ensureAiCodingColumns(): Promise<void> {
    try {
      // Check and add team_initialized column
      const teamInitResult = await this.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'ai_coding_projects'
          AND column_name = 'team_initialized'
        )
      `;

      if (!teamInitResult[0]?.exists) {
        this.logger.log("Adding team_initialized column to ai_coding_projects");
        await this.$executeRawUnsafe(`
          ALTER TABLE "ai_coding_projects"
          ADD COLUMN "team_initialized" BOOLEAN NOT NULL DEFAULT false
        `);
        this.logger.log("✅ team_initialized column added");
      }

      // Check and add current_mission_id column
      const missionIdResult = await this.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'ai_coding_projects'
          AND column_name = 'current_mission_id'
        )
      `;

      if (!missionIdResult[0]?.exists) {
        this.logger.log(
          "Adding current_mission_id column to ai_coding_projects",
        );
        await this.$executeRawUnsafe(`
          ALTER TABLE "ai_coding_projects"
          ADD COLUMN "current_mission_id" UUID
        `);
        this.logger.log("✅ current_mission_id column added");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not ensure AI Coding columns: ${errorMessage}`);
    }
  }

  /**
   * Ensure system_settings columns exist
   */
  private async ensureSystemSettingsColumns(): Promise<void> {
    try {
      // Check and add encrypted column
      const encryptedResult = await this.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'system_settings'
          AND column_name = 'encrypted'
        )
      `;

      if (!encryptedResult[0]?.exists) {
        this.logger.log("Adding encrypted column to system_settings");
        await this.$executeRawUnsafe(`
          ALTER TABLE "system_settings"
          ADD COLUMN "encrypted" BOOLEAN NOT NULL DEFAULT false
        `);
        this.logger.log("✅ encrypted column added");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not ensure system_settings columns: ${errorMessage}`,
      );
    }
  }

  /**
   * Ensure AI Writing columns exist (critical for chapter saving)
   */
  private async ensureAiWritingColumns(): Promise<void> {
    try {
      // Check and add metadata column to writing_chapters
      const metadataResult = await this.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'writing_chapters'
          AND column_name = 'metadata'
        )
      `;

      if (!metadataResult[0]?.exists) {
        this.logger.log("Adding metadata column to writing_chapters...");
        await this.$executeRawUnsafe(`
          ALTER TABLE "writing_chapters"
          ADD COLUMN "metadata" JSONB DEFAULT '{}'
        `);
        this.logger.log("✅ writing_chapters.metadata column added");
      } else {
        this.logger.debug("writing_chapters.metadata column already exists");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Failed to ensure AI Writing columns: ${errorMessage}`,
      );
    }
  }
}
