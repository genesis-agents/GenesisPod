/**
 * RadarModule —— AI 雷达
 *
 * 彻底重构后（2026-05-16）：
 *   - 完全用 ai-harness mission pipeline 框架（MissionPipelineOrchestrator /
 *     SkillLoaderService / DomainEventBus / MissionAbortRegistry /
 *     MissionRuntimeShellFramework / SocketBroadcastAdapter）
 *   - 9 个 stage adapter（s1-s8 + discovery）+ BusinessOrchestrator + Dispatcher
 *   - 5 个 SKILL.md 通过 SkillLoaderService 加载（替代 5 个旧 @Injectable agent service）
 *   - radar.events.ts 注册到 DomainEventRegistry
 *   - RadarGateway 在 afterInit 注册 SocketBroadcastAdapter
 *
 * 暂保留（Phase 7 整体删除）：
 *   - RadarCollectService / RadarPipeline / 5 旧 agent service —— 当前 controller /
 *     scheduler 还在引用，等 Phase 5/6 改造完后整体删除
 */
import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { BullModule } from "@nestjs/bullmq";
import * as path from "path";

import {
  DomainEventRegistry,
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
} from "@/modules/ai-harness/facade";
import { SkillLoaderService } from "@/modules/ai-engine/facade";
import { NotificationModule } from "../../ai-infra/notifications/notification.module";

import { RadarTopicController } from "./controllers/radar-topic.controller";
import { RadarSourceController } from "./controllers/radar-source.controller";
import { RadarFeedController } from "./controllers/radar-feed.controller";
import { RadarInsightController } from "./controllers/radar-insight.controller";
import { RadarRunController } from "./controllers/radar-run.controller";

import { RadarTopicService } from "./services/topic/radar-topic.service";
import { RadarSourceService } from "./services/source/radar-source.service";
import { SourceHealthService } from "./services/source/source-health.service";
import { CollectorRouter } from "./services/collectors/collector-router.service";
import { RssCollector } from "./services/collectors/rss-collector.service";
import { YoutubeCollector } from "./services/collectors/youtube-collector.service";
import { XCollector } from "./services/collectors/x-collector.service";
import { CustomCollector } from "./services/collectors/custom-collector.service";

import { RadarRefreshScheduler } from "./services/scheduler/radar-refresh.scheduler";
import { RadarBriefingQueueService } from "./services/scheduler/radar-briefing-queue.service";

// ── 新框架接入 ───────────────────────────────────────────────────────────
import { RadarMissionStore } from "./services/mission/lifecycle/radar-mission-store.service";
import { RadarMissionRuntimeShell } from "./services/mission/workflow/radar-mission-runtime-shell.service";
import { RadarBusinessOrchestrator } from "./services/mission/workflow/radar-business-orchestrator.service";
import { RadarPipelineDispatcher } from "./services/mission/workflow/radar-pipeline-dispatcher.service";
import { RadarS1SourceResolveStage } from "./services/mission/stages/s1-source-resolve.stage";
import { RadarS2CollectStage } from "./services/mission/stages/s2-collect.stage";
import { RadarS3DedupeStage } from "./services/mission/stages/s3-dedupe.stage";
import { RadarS4RelevanceStage } from "./services/mission/stages/s4-relevance.stage";
import { RadarS5QualityStage } from "./services/mission/stages/s5-quality.stage";
import { RadarS6EntityStage } from "./services/mission/stages/s6-entity.stage";
import { RadarS7InsightStage } from "./services/mission/stages/s7-insight.stage";
import { RadarS8PersistStage } from "./services/mission/stages/s8-persist.stage";
import { RadarDiscoveryStage } from "./services/mission/stages/radar-discovery.stage";
import { RadarGateway } from "./radar.gateway";
import { RADAR_DOMAIN_EVENTS } from "./radar.events";

@Module({
  imports: [
    BullModule.registerQueue({ name: RadarBriefingQueueService.QUEUE_NAME }),
    NotificationModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    RadarTopicController,
    RadarSourceController,
    RadarFeedController,
    RadarInsightController,
    RadarRunController,
  ],
  providers: [
    // 顶层业务 service
    RadarTopicService,
    RadarSourceService,
    SourceHealthService,
    // collector helper（s2-collect stage 内部使用，不直接对外）
    CollectorRouter,
    RssCollector,
    YoutubeCollector,
    XCollector,
    CustomCollector,
    // 调度（走 dispatcher.runRefreshMission）
    RadarRefreshScheduler,
    RadarBriefingQueueService,
    // 新框架接入 —— pipeline registry / orchestrator 必须由消费模块本地 register
    // （MissionRuntimeShellFramework / DomainEventBus 由 @Global HarnessModule 提供，
    // 但 MissionPipelineRegistry / MissionPipelineOrchestrator 不是 @Global —— 跟
    // agent-playground / writing-team module 同模式，每个 ai-app 自行注册）
    MissionPipelineRegistry,
    MissionPipelineOrchestrator,
    RadarMissionStore,
    RadarMissionRuntimeShell,
    RadarBusinessOrchestrator,
    RadarPipelineDispatcher,
    RadarS1SourceResolveStage,
    RadarS2CollectStage,
    RadarS3DedupeStage,
    RadarS4RelevanceStage,
    RadarS5QualityStage,
    RadarS6EntityStage,
    RadarS7InsightStage,
    RadarS8PersistStage,
    RadarDiscoveryStage,
    RadarGateway,
  ],
  exports: [
    RadarTopicService,
    RadarSourceService,
    RadarPipelineDispatcher,
    RadarMissionStore,
    RadarBriefingQueueService,
  ],
})
export class RadarModule implements OnModuleInit {
  private readonly log = new Logger(RadarModule.name);

  constructor(
    private readonly eventRegistry: DomainEventRegistry,
    private readonly skillLoader: SkillLoaderService,
  ) {}

  async onModuleInit(): Promise<void> {
    // 1. 注册业务事件 schema —— DomainEventBus 校验未注册的 type 一律 drop+warn
    this.eventRegistry.registerAll(RADAR_DOMAIN_EVENTS);
    this.log.log(
      `RadarModule: registered ${RADAR_DOMAIN_EVENTS.length} domain event types`,
    );

    // 2. 加载 5 个 SKILL.md（替代旧 5 个 @Injectable agent service 的 prompt 字符串）
    await this.skillLoader.addSkillDirectory({
      path: path.resolve(__dirname, "agents"),
      domain: "ai-radar",
      recursive: false,
    });
    this.log.log(
      "RadarModule: SKILL.md directory registered (5 agents under ai-radar/agents/)",
    );
  }
}
