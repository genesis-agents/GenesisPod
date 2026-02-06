/**
 * AI Coding Module
 * AI 编程助手模块
 */

import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { AgentRegistry } from "../../ai-engine/agents/registry";
import { DeveloperAgent } from "./agents";

@Module({
  imports: [AiEngineModule],
  providers: [DeveloperAgent],
  exports: [DeveloperAgent],
})
export class AiCodingModule implements OnModuleInit {
  private readonly logger = new Logger(AiCodingModule.name);

  constructor(
    private readonly agentRegistry: AgentRegistry,
    private readonly developerAgent: DeveloperAgent,
  ) {}

  onModuleInit() {
    this.agentRegistry.register(this.developerAgent);
    this.logger.log("Registered DeveloperAgent to AgentRegistry");
  }
}
