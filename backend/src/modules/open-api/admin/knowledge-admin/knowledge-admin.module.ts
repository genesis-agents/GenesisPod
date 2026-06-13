import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { KnowledgeAdminController } from "./knowledge.controller";
import { KnowledgeAdminService } from "./knowledge-admin.service";

/**
 * Admin 知识管理模块（open-api/admin 层）。
 * 路由：admin/knowledge/{kbs,documents,wiki-pages}
 * v1.2 admin 控制台剥离：从 ai-app/library/knowledge-graph 迁入 open-api/admin。
 */
@Module({
  imports: [PrismaModule],
  controllers: [KnowledgeAdminController],
  providers: [KnowledgeAdminService],
  exports: [KnowledgeAdminService],
})
export class KnowledgeAdminModule {}
