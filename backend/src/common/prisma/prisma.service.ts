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
}
