/**
 * AI Engine - Collaboration Module
 * 协作工作流模块（审查、待办、投票、交接）
 */

import { Module } from "@nestjs/common";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { ReviewWorkflowService } from "./review/review-workflow.service";
import { TodoService } from "./todo/todo.service";
import { VotingManager } from "./patterns/voting-pattern";
import { HandoffCoordinator } from "./patterns/handoff-pattern";

/**
 * Voting Manager Factory
 */
const votingManagerFactory = {
  provide: VotingManager,
  useFactory: () => {
    return new VotingManager();
  },
};

/**
 * Handoff Coordinator Factory
 */
const handoffCoordinatorFactory = {
  provide: HandoffCoordinator,
  useFactory: () => {
    return new HandoffCoordinator();
  },
};

@Module({
  imports: [
    PrismaModule,
    // Note: EventEmitterModule 应在 AppModule 中 forRoot()，此处不再重复导入
  ],
  providers: [
    ReviewWorkflowService,
    TodoService,
    // ★ 协作模式服务（从根模块迁移）
    votingManagerFactory,
    handoffCoordinatorFactory,
  ],
  exports: [
    ReviewWorkflowService,
    TodoService,
    // ★ 协作模式服务导出
    VotingManager,
    HandoffCoordinator,
  ],
})
export class CollaborationModule {}
