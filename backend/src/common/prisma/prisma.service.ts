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

  constructor() {
    super({
      // ★ 配置事务超时时间，避免长时间研究任务失败
      transactionOptions: {
        maxWait: 10000, // 等待获取事务的最大时间 (10秒)
        timeout: 120000, // 事务执行的最大时间 (2分钟)
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log("[Prisma] Prisma connected to database");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Migration History (Moved to Prisma migrations):
   *
   * 1. ResourceUpvote table
   *    - Created via Prisma migration
   *    - Previously auto-created in runtime (removed 2025-01-24)
   *
   * 2. SystemSetting columns
   *    - encrypted: Added via Prisma migration
   *    - Previously auto-created in runtime (removed 2025-01-24)
   *
   * 3. WritingChapter columns
   *    - metadata: Added via Prisma migration
   *    - Previously auto-created in runtime (removed 2025-01-24)
   *
   * All schema changes should now be managed through Prisma migrations:
   * - Run: npx prisma migrate dev --name description
   * - Deploy: npx prisma migrate deploy
   */
}
