/**
 * AI Engine - Collaboration Module
 * 协作工作流模块（审查、待办）
 */

import { Module } from "@nestjs/common";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { ReviewWorkflowService } from "./review/review-workflow.service";
import { TodoService } from "./todo/todo.service";

@Module({
  imports: [
    PrismaModule,
    // Note: EventEmitterModule 应在 AppModule 中 forRoot()，此处不再重复导入
  ],
  providers: [ReviewWorkflowService, TodoService],
  exports: [ReviewWorkflowService, TodoService],
})
export class CollaborationModule {}
