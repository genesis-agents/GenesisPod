/**
 * RadarModule
 *
 * AI 雷达：针对主题持续监控多源数据（X / YouTube / RSS / Custom），
 * 通过多 Agent Teams 做相关性 / 质量 / 实体 / 信号洞察评估，
 * 最终汇成主题卡片 + feed 流 + 周期性洞察看板。
 *
 * 分层（与项目分层一致）：
 *   - L4 controllers: REST 入口（topic / source / feed / insight / run）
 *   - L3 services:    业务编排（topic / source / collector / pipeline / scheduler）
 *   - L2 ai-engine:   通过 AIEngineFacade 调 LLM
 *   - L2.5 ai-harness: 通过 facade 注册 agent / team / role
 *
 * 注册流程（onModuleInit，PR-R3 后启用）：
 *   1. SkillLoaderService.addSkillDirectory(agents/)
 *   2. AgentRegistry.register(每个 agent)
 *   3. TeamRegistry.registerConfig(RADAR_TEAM_CONFIG)
 *   4. MissionPipelineRegistry.register(RADAR_PIPELINE)
 *
 * 当前阶段 (PR-R1)：仅 Topic + Source CRUD，等 PR-R2/R3 接入 collector + pipeline。
 */

import { Logger, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { NotificationModule } from "../../ai-infra/notifications/notification.module";

import { RadarTopicController } from "./controllers/radar-topic.controller";
import { RadarSourceController } from "./controllers/radar-source.controller";
import { RadarFeedController } from "./controllers/radar-feed.controller";
import { RadarInsightController } from "./controllers/radar-insight.controller";
import { RadarRunController } from "./controllers/radar-run.controller";

import { RadarTopicService } from "./services/topic/radar-topic.service";
import { RadarSourceService } from "./services/source/radar-source.service";
import { SourceHealthService } from "./services/source/source-health.service";
import { SourceDiscoveryService } from "./services/source/source-discovery.service";
import { RadarCollectService } from "./services/collect/radar-collect.service";
import { CollectorRouter } from "./services/collectors/collector-router.service";
import { RssCollector } from "./services/collectors/rss-collector.service";
import { YoutubeCollector } from "./services/collectors/youtube-collector.service";
import { XCollector } from "./services/collectors/x-collector.service";
import { CustomCollector } from "./services/collectors/custom-collector.service";
import { RadarPipeline } from "./services/pipeline/radar-pipeline.service";
import { RelevanceJudgeAgent } from "./agents/relevance-judge/relevance-judge.agent";
import { QualityRaterAgent } from "./agents/quality-rater/quality-rater.agent";
import { EntityExtractorAgent } from "./agents/entity-extractor/entity-extractor.agent";
import { SignalAnalystAgent } from "./agents/signal-analyst/signal-analyst.agent";
import { SourceCuratorAgent } from "./agents/source-curator/source-curator.agent";
import { RadarRefreshScheduler } from "./services/scheduler/radar-refresh.scheduler";

@Module({
  imports: [
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
    RadarTopicService,
    RadarSourceService,
    SourceHealthService,
    SourceDiscoveryService,
    RadarCollectService,
    CollectorRouter,
    RssCollector,
    YoutubeCollector,
    XCollector,
    CustomCollector,
    RadarPipeline,
    RelevanceJudgeAgent,
    QualityRaterAgent,
    EntityExtractorAgent,
    SignalAnalystAgent,
    SourceCuratorAgent,
    RadarRefreshScheduler,
  ],
  exports: [RadarTopicService, RadarSourceService, RadarCollectService],
})
export class RadarModule {
  private readonly log = new Logger(RadarModule.name);

  constructor() {
    this.log.log(
      "RadarModule loaded (PR-R4: + cron scheduler + insight notification)",
    );
  }
}
