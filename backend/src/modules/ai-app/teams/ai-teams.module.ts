/**
 * AI Teams Module
 * AI 团队协作模块
 *
 * 职责：
 * - Topic（话题）CRUD 和成员管理
 * - 消息发送和处理
 * - AI 辩论和任务编排
 * - WebSocket 实时通信
 * - 自定义团队管理（通过 AI Engine）
 *
 * 依赖 AI Engine 提供：
 * - TeamsService: 团队配置管理
 * - VotingManager: 共识投票
 * - HandoffCoordinator: 任务交接
 * - LLMFactory: LLM 调用
 */

import { Module } from "@nestjs/common";
import {
  AiTeamsController,
  UsersController,
  BookmarksController,
  CustomTeamsController,
} from "./controllers";
import { AiTeamsService } from "./ai-teams.service";
import { AiTeamsGateway } from "./ai-teams.gateway";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine";
import { CreditsModule } from "../../credits/credits.module";
import {
  // AI 服务
  ContextRouterService,
  AiResponseService,
  TopicContextRetrievalService,
  // 协作服务
  DebateService,
  TeamMissionService,
  TeamCollaborationService,
  // Topic 领域服务
  TopicMembershipService,
  TopicPublicService,
  TopicForwardBookmarkService,
  // 事件服务
  TopicEventEmitterService,
  // 整合服务
  AiTeamsIntegrationService,
} from "./services";
// 注意：UrlParserService 和 WebContentExtractionService 由 @Global() ContentProcessingModule 提供
import { TeamMemberAgent } from "./agents";

@Module({
  imports: [PrismaModule, AiEngineModule, CreditsModule],
  controllers: [
    AiTeamsController,
    UsersController,
    BookmarksController,
    CustomTeamsController,
  ],
  providers: [
    // 核心业务服务
    AiTeamsService,
    AiTeamsGateway,

    // AI 服务
    ContextRouterService,
    AiResponseService,
    TopicContextRetrievalService,
    TeamMemberAgent,

    // 协作服务
    DebateService,
    TeamMissionService,
    TeamCollaborationService,

    // Topic 领域服务
    TopicMembershipService,
    TopicPublicService,
    TopicForwardBookmarkService,
    TopicEventEmitterService,

    // AI Engine 整合服务
    AiTeamsIntegrationService,
    // 注意：UrlParserService 和 WebContentExtractionService 由 @Global() ContentProcessingModule 提供
  ],
  exports: [
    // 核心业务服务
    AiTeamsService,

    // AI 服务
    ContextRouterService,
    AiResponseService,
    TopicContextRetrievalService,

    // 协作服务
    DebateService,
    TeamMissionService,
    TeamCollaborationService,

    // Topic 领域服务
    TopicMembershipService,
    TopicPublicService,
    TopicForwardBookmarkService,

    // AI Engine 整合服务
    AiTeamsIntegrationService,
    // 注意：UrlParserService 和 WebContentExtractionService 由 @Global() ContentProcessingModule 提供
  ],
})
export class AiTeamsModule {}
