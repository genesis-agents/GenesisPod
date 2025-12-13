import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BlogCollectionService } from "./services/blog-collection.service";
import { BlogSchedulerService } from "./services/blog-scheduler.service";
import { BlogCollectionController } from "./controllers/blog-collection.controller";
import { PrismaModule } from "../../../common/prisma/prisma.module";

/**
 * Blog Collection Module
 * 整合博客采集相关的服务和控制器
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [BlogCollectionService, BlogSchedulerService],
  controllers: [BlogCollectionController],
  exports: [BlogCollectionService, BlogSchedulerService],
})
export class BlogCollectionModule {}
