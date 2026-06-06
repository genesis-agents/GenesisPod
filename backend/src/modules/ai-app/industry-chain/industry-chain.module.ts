/**
 * Industry Chain Module（产业链分析，L3 ai-app 独立模块）
 *
 * 依赖（全部经 facade / 既有 module 复用）：
 *   - AiEngineKnowledgeModule → EntityResolutionService（实体消歧）
 *   - MissionPipelineOrchestrator / Registry（harness facade，动态编排；deps 来自 @Global HarnessModule）
 *   - PrismaService（@Global）
 *
 * onModuleInit 注册产业链 pipeline + 确保 SEC 工具可用（SEC 工具已在 engine tools.provider 全局注册）。
 */

import { Module, OnModuleInit } from "@nestjs/common";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { AiEngineKnowledgeModule } from "@/modules/ai-engine/knowledge/knowledge.module";
import {
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
} from "@/modules/ai-harness/facade";
import { IndustryChainService } from "./industry-chain.service";
import { IndustryChainController } from "./industry-chain.controller";

@Module({
  imports: [PrismaModule, AiEngineKnowledgeModule],
  controllers: [IndustryChainController],
  providers: [
    IndustryChainService,
    MissionPipelineRegistry,
    MissionPipelineOrchestrator,
    // HarnessFacade 由 @Global HarnessModule 提供，直接注入无需 provide
  ],
})
export class IndustryChainModule implements OnModuleInit {
  constructor(private readonly service: IndustryChainService) {}

  onModuleInit(): void {
    // 注册产业链动态编排 pipeline（hook 绑定 service，方案 B），幂等
    this.service.ensurePipelineRegistered(this.service.buildPipeline());
  }
}
