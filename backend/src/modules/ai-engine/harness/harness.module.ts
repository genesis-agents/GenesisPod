/**
 * Harness Module — Agent 运行时脚手架
 *
 * Phase 1（当前）：
 *   - 10 个 abstractions（一等公民接口）
 *   - HarnessedAgent 骨架
 *   - HookRegistry 完整实现
 *   - HarnessFacade 对外唯一入口
 *
 * 后续 Phase：
 *   - Phase 2: AgentLoop (ReAct) + ToolInvoker + MemoryBridge
 *   - Phase 3: SKILL.md 系统 + SkillLoader
 *   - Phase 4: SubagentSpawner + 3 级 isolation
 *   - Phase 5: Context Engineering（compact / prune / fork）
 *   - Phase 6: 长任务 checkpoint + 自我演进
 */

import { Global, Module } from "@nestjs/common";
import { HarnessFacade } from "./facade/harness.facade";

@Global()
@Module({
  providers: [HarnessFacade],
  exports: [HarnessFacade],
})
export class HarnessModule {}
