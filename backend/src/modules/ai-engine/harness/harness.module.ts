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
 * Phase 5 (current): Context Engineering (compactor / pruner / manager)
 * Phase 6+: Long-horizon checkpoint + skill learning
 */

import { Global, Module, forwardRef } from "@nestjs/common";
import { HarnessFacade } from "./facade/harness.facade";
import { AgentFactory } from "./core/agent-factory";
import { HookRegistry } from "./core/hook-registry";
import { ReActLoop } from "./loop/react-loop";
import { ToolInvoker } from "./executor/tool-invoker";
import { MemoryBridge } from "./memory-bridge/memory-bridge.service";
import {
  SkillRegistry,
  SkillLoader,
  SkillActivator,
} from "./skills";
import { SubagentSpawner } from "./subagent";
import {
  ContextManager,
  ContextCompactor,
  PriorityPruner,
} from "./context";

import { AiEngineLLMModule } from "../ai-engine-llm.module";
import { AiEngineToolsModule } from "../ai-engine-tools.module";
import { AiEngineMemoryModule } from "../ai-engine-memory.module";

export const HOOK_REGISTRY_TOKEN = Symbol("HOOK_REGISTRY");

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
    { provide: HOOK_REGISTRY_TOKEN, useExisting: HookRegistry },

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

    // Core
    AgentFactory,
    HarnessFacade,
  ],
  exports: [HarnessFacade, AgentFactory, SkillRegistry, ContextManager],
})
export class HarnessModule {}
