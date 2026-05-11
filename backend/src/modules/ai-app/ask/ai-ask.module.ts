import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AiAskController } from "./ai-ask.controller";
import { AiAskService } from "./ai-ask.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
// 直接从文件导入，避免 barrel export 循环依赖
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { CreditsModule } from "../../ai-infra/credits/credits.module";
// PR-2: KbQueryService — wiki-aware unified KB facade. Replaces the direct
// RAGPipelineService injection in ai-ask.service.ts so wiki augmentation is
// transparent to the consumer.
import { KbQueryModule } from "@/modules/ai-app/library/kb-query/kb-query.module";
// W3: harness CollaborationModule 提供 DebatePattern / VotingManager / HandoffCoordinator
import { CollaborationModule } from "../../ai-harness/teams/collaboration/collaboration.module";
// Teams 模式（W2 PR3）
import { AskRoomController } from "./ai-ask-room.controller";
import { AskRoomService } from "./ai-ask-room.service";
import { AskRoomRuntimeService } from "./ai-ask-room-runtime.service";
import { AskRoomRuntimeStateStore } from "./ai-ask-room-runtime-state.store";
import { AskRoomGateway } from "./ai-ask-room.gateway";
import { FreechatAdapter } from "./adapters/freechat.adapter";
import { ParallelMergeAdapter } from "./adapters/parallel-merge.adapter";
import { DebateAdapter } from "./adapters/debate.adapter";
import { VoteAdapter } from "./adapters/vote.adapter";
import { ReviewAdapter } from "./adapters/review.adapter";
import { HandoffAdapter } from "./adapters/handoff.adapter";

@Module({
  imports: [
    PrismaModule,
    AiEngineModule,
    KbQueryModule,
    CreditsModule,
    CollaborationModule,
    // Gateway JWT 校验（与 NotificationGateway / TopicResearchGateway 同模式）
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AiAskController, AskRoomController],
  providers: [
    AiAskService,
    AskRoomService,
    AskRoomRuntimeService,
    AskRoomRuntimeStateStore,
    AskRoomGateway,
    FreechatAdapter,
    ParallelMergeAdapter,
    DebateAdapter,
    VoteAdapter,
    ReviewAdapter,
    HandoffAdapter,
  ],
  exports: [AiAskService, AskRoomService],
})
export class AiAskModule {}
