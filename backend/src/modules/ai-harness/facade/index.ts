/**
 * AI Harness Facade —— ai-app 唯一入口
 *
 * 定位：harness 是"agent 怎么跑"的抽象。所有需要构建 spec agent / 跑 react loop /
 * 拿事件流 / 做 budget guard / 做 verify consensus 的 ai-app 模块，都从这里 import。
 *
 * 依赖方向（强制单向）：
 *   ai-app → ai-harness → ai-engine
 *   ai-engine 永远不允许 import ai-harness。
 */

// ── Abstractions（IAgent / IAgentEvent / IAgentSpec / 等接口） ──
export * from "../abstractions";

// ── Service facade ──
export { HarnessFacade } from "./harness.facade";

// ── DX：DefineAgent / AgentSpec / AgentRunner / RunResult / FixtureStore ──
export {
  AgentRunner,
  AgentSpec,
  DefineAgent,
  FixtureStore,
} from "../dx";
export type { RunResult } from "../dx";

// ── Core：AgentFactory + SpecAgentRegistry ──
export { AgentFactory } from "../core/agent-factory";
export { SpecAgentRegistry } from "../core/spec-agent-registry";

// ── Verify ──
export { JudgeService } from "../verify";
export type { BuiltInVerifierId } from "../verify";

// ── Events（DomainEventBus 等） ──
export {
  DomainEventBus,
  DomainEventRegistry,
  LoggerBroadcastAdapter,
} from "../events";
export type {
  DomainEvent,
  IBroadcastAdapter,
  DomainEventTypeSpec,
} from "../events";

// ── Memory / Checkpoint / Runtime ──
export { MemoryAutoIndexer } from "../memory-bridge/memory-auto-indexer";
export { MissionBudgetPool } from "../runtime/mission-budget-pool";
export { AgentEventStore, CheckpointService } from "../checkpoint";
export type { ICheckpoint, AgentEventRecord } from "../checkpoint";

// ── Runtime adapters（IRuntimeEnvironment 实现） ──
export { BillingRuntimeEnvAdapter } from "../runtime/billing-runtime-env.adapter";
