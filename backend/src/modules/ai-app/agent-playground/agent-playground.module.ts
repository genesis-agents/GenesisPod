/**
 * AgentPlaygroundModule
 *
 * Demo 模块 —— 展示 Harness 全栈能力（loop / verify / handoff / memory / cost）。
 *
 * 模型解析：
 *   完全走系统配置（ChatFacade.getDefaultTextModel → DB ai_models 表）。
 *   不依赖 OPENAI_API_KEY 等独立 env var —— API Key 由 Secret Manager 通过
 *   ai_models.secret_key 解析（与 Topic Insights / Ask 等 sibling app 一致）。
 *
 *   onApplicationBootstrap 时：
 *     1. 用 ChatFacade 拿到系统当前默认 CHAT 模型
 *     2. 注册其 pricing 到 ModelPricingRegistry
 *     3. 用 promoteToPrimary 把它顶到 standard/basic/strong 三个 tier 的首位
 *        → ReActLoop.pickModelForTier 会选中它，chat() 拿到的 model 就是
 *          DB 启用的那一个，secret_key 也能正常解析
 */

import {
  Module,
  OnModuleInit,
  OnApplicationBootstrap,
  Logger,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AgentPlaygroundController } from "./agent-playground.controller";
import { AgentPlaygroundGateway } from "./agent-playground.gateway";
import { ResearchTeamOrchestrator } from "./services/research-team.orchestrator";
import { MissionOwnershipRegistry } from "./services/mission-ownership.registry";
import { MissionEventBuffer } from "./services/mission-event-buffer.service";
import { CreditsModule } from "../../ai-infra/credits/credits.module";
import {
  ChatFacade,
  DomainEventBus,
  DomainEventRegistry,
  ModelPricingRegistry,
} from "../../ai-engine/facade";
import { AGENT_PLAYGROUND_EVENTS } from "./agent-playground.events";

@Module({
  imports: [
    CreditsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AgentPlaygroundController],
  providers: [
    AgentPlaygroundGateway,
    ResearchTeamOrchestrator,
    MissionOwnershipRegistry,
    MissionEventBuffer,
  ],
  exports: [MissionEventBuffer],
})
export class AgentPlaygroundModule
  implements OnModuleInit, OnApplicationBootstrap
{
  private readonly log = new Logger(AgentPlaygroundModule.name);

  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly registry: DomainEventRegistry,
    private readonly buffer: MissionEventBuffer,
    private readonly chatFacade: ChatFacade,
    private readonly pricing: ModelPricingRegistry,
  ) {}

  onModuleInit(): void {
    // 1. 注册事件类型 —— DomainEventBus 校验未注册的 type 会 drop+warn
    this.registry.registerAll(AGENT_PLAYGROUND_EVENTS);
    // 2. 注册缓冲 adapter，截获所有 agent-playground.* 事件入内存（给 /replay 用）
    this.eventBus.registerAdapter(this.buffer);
  }

  /**
   * onApplicationBootstrap 在 onModuleInit 之后跑，此时 ChatFacade 的
   * modelConfigService 已 wire 完毕，可安全查 DB。
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const m = await this.chatFacade.getDefaultTextModel();
      if (!m) {
        this.log.warn(
          "[bootstrap] No default CHAT model in DB — Harness ReActLoop will fall back to hard-coded pricing table candidates (likely fail). Enable a model in /admin/ai/models.",
        );
        return;
      }
      // 注册到 pricing（pricing 信息用 standard tier 默认值，避免 estimate 出 0）
      this.pricing.register({
        modelId: m.modelId,
        tier: "standard",
        inputPricePerM: 3,
        outputPricePerM: 15,
      });
      // 把它顶到所有 tier 首位 —— ReActLoop.pickModelForTier 选中即用
      this.pricing.promoteToPrimary("standard", m.modelId);
      this.pricing.promoteToPrimary("basic", m.modelId);
      this.pricing.promoteToPrimary("strong", m.modelId);
      this.log.log(
        `[bootstrap] Pinned system default model "${m.modelId}" (${m.provider}) as primary across all tiers`,
      );
    } catch (err) {
      this.log.error(
        `[bootstrap] Failed to resolve system default model: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
