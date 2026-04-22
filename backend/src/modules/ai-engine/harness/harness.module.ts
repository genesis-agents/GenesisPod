/**
 * Harness Module — Agent 运行时脚手架
 *
 * 依赖链：
 *   AI App → HarnessFacade → AgentFactory → (ReActLoop + MemoryBridge + SkillActivator)
 *     ReActLoop → AiChatService + ToolInvoker + HookRegistry
 *     ToolInvoker → ToolRegistry
 *     MemoryBridge → MemoryCoordinatorService (@Optional)
 *     SkillActivator → SkillRegistry + HookRegistry
 *     SkillLoader → SkillRegistry (OnModuleInit 自动加载 built-in/*)
 *
 * Phase 1: abstractions + HarnessedAgent skeleton + HookRegistry
 * Phase 2: ReActLoop + ToolInvoker + MemoryBridge
 * Phase 3: SKILL.md system (parser / registry / loader / activator)
 * Phase 4: SubagentSpawner + 3-level isolation (none / context / worktree)
 * Phase 5: Context Engineering (compactor / pruner / manager)
 * Phase 6 (current): Long-horizon checkpoint + resume + skill learning
 */

import {
  Global,
  Module,
  forwardRef,
  OnApplicationBootstrap,
  Inject,
} from "@nestjs/common";
import { HarnessFacade } from "./facade/harness.facade";
import { AgentFactory } from "./core/agent-factory";
import { HookRegistry } from "./core/hook-registry";
import { ReActLoop } from "./loop/react-loop";
import { ToolInvoker } from "./executor/tool-invoker";
import { MemoryBridge } from "./memory-bridge/memory-bridge.service";
import { SkillRegistry, SkillLoader, SkillActivator } from "./skills";
import { SubagentSpawner } from "./subagent";
import { ContextManager, ContextCompactor, PriorityPruner } from "./context";
import { CheckpointService, InMemoryCheckpointStore } from "./checkpoint";
import { SkillLearner } from "./learning";

import { AiEngineLLMModule } from "../ai-engine-llm.module";
import { AiEngineToolsModule } from "../ai-engine-tools.module";
import { AiEngineMemoryModule } from "../ai-engine-memory.module";

@Global()
@Module({
  imports: [
    forwardRef(() => AiEngineLLMModule),
    forwardRef(() => AiEngineToolsModule),
    forwardRef(() => AiEngineMemoryModule),
  ],
  providers: [
    // Cross-cutting
    HookRegistry,

    // Executor / Loop / Memory (Phase 2)
    ToolInvoker,
    ReActLoop,
    MemoryBridge,

    // Skills (Phase 3)
    SkillRegistry,
    SkillLoader,
    SkillActivator,

    // Subagent (Phase 4)
    SubagentSpawner,

    // Context Engineering (Phase 5)
    ContextCompactor,
    PriorityPruner,
    ContextManager,

    // Checkpoint + Learning (Phase 6)
    InMemoryCheckpointStore,
    {
      provide: CheckpointService,
      useFactory: (store: InMemoryCheckpointStore) =>
        new CheckpointService(store),
      inject: [InMemoryCheckpointStore],
    },
    SkillLearner,

    // Core
    AgentFactory,
    HarnessFacade,
  ],
  exports: [
    HarnessFacade,
    AgentFactory,
    SkillRegistry,
    ContextManager,
    CheckpointService,
    SkillLearner,
  ],
})
export class HarnessModule implements OnApplicationBootstrap {
  constructor(
    @Inject(AgentFactory) private readonly factory: AgentFactory,
    @Inject(SubagentSpawner) private readonly spawner: SubagentSpawner,
  ) {}

  onApplicationBootstrap(): void {
    // Break the circular dependency: AgentFactory ↔ SubagentSpawner.
    // Constructor injection requires both instances up-front; setter injection
    // lets NestJS finish provider instantiation, then we wire the cycle here.
    this.factory.setSubagentSpawner(this.spawner);
  }
}
