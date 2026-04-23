/**
 * Harness CLI NestApplicationContext 启动助手（Group L-1）
 *
 * 让 CLI（golden runner、prod baseline 录制）能从 DI 拿到：
 * - AiChatService（走真 LLM）
 * - LlmInvokerService（Zod + retry 封装）
 * - HarnessAgentRegistry（17 agents）
 * - ResearchEventEmitterService
 *
 * 只在 GOLDEN_JUDGE_ENABLED=1 + HARNESS_AGENTS_STUB=0 时调用，
 * 避免无必要的 Nest 启动开销。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Logger, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "../../src/common/prisma/prisma.module";
import { AiEngineModule } from "../../src/modules/ai-engine/ai-engine.module";
import { HarnessModule } from "../../src/modules/ai-app/topic-insights/harness/harness.module";
import { AiChatService } from "../../src/modules/ai-engine/facade";
import { LlmInvokerService } from "../../src/modules/ai-app/topic-insights/harness/llm";
import { HarnessAgentRegistry } from "../../src/modules/ai-app/topic-insights/harness/agents";

const logger = new Logger("HarnessCLIContext");

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
    EventEmitterModule.forRoot({ global: true }),
    HttpModule,
    PrismaModule,
    AiEngineModule,
    HarnessModule,
  ],
})
class HarnessCLIModule {}

export interface HarnessCLIContext {
  readonly aiChatService: AiChatService;
  readonly llmInvoker: LlmInvokerService;
  readonly agentRegistry: HarnessAgentRegistry;
  close(): Promise<void>;
}

let cached: HarnessCLIContext | null = null;

/** 返回缓存的 context 或 null（未初始化） */
export function getCachedHarnessCLIContext(): HarnessCLIContext | null {
  return cached;
}

/**
 * 启动最小 Nest 上下文，拿到 harness CLI 可用的 services。
 * 复用单例，避免同进程反复启停。
 */
export async function createHarnessCLIContext(): Promise<HarnessCLIContext> {
  if (cached) return cached;

  logger.log("Bootstrapping NestApplicationContext for harness CLI...");
  const app = await NestFactory.createApplicationContext(HarnessCLIModule, {
    logger: ["error", "warn", "log"],
  });

  const aiChatService = app.get(AiChatService, { strict: false });
  const llmInvoker = app.get(LlmInvokerService, { strict: false });
  const agentRegistry = app.get(HarnessAgentRegistry, { strict: false });

  cached = {
    aiChatService,
    llmInvoker,
    agentRegistry,
    close: async () => {
      await app.close();
      cached = null;
    },
  };
  return cached;
}
