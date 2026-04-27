/**
 * AI Harness Facade —— ai-app 唯一入口
 *
 * 7 大聚合：kernel / execution / process / memory / protocol / governance / runtime
 */

// ── Kernel：abstractions + core + dx ──
export * from "../kernel/abstractions";
export { AgentFactory } from "../kernel/core/agent-factory";
export { SpecAgentRegistry } from "../kernel/core/spec-agent-registry";
export {
  AgentRunner,
  AgentSpec,
  DefineAgent,
  FixtureStore,
} from "../kernel/dx";
export type { RunResult } from "../kernel/dx";

// ── Service facade ──
export { HarnessFacade } from "./harness.facade";

// ── Governance：verify / failure-learning ──
export { JudgeService } from "../governance/verify";
export type { BuiltInVerifierId } from "../governance/verify";

// ── Protocol：events ──
export {
  DomainEventBus,
  DomainEventRegistry,
  LoggerBroadcastAdapter,
} from "../protocol/events";
export type {
  DomainEvent,
  IBroadcastAdapter,
  DomainEventTypeSpec,
} from "../protocol/events";

// ── Memory：auto-index / checkpoint ──
export { MemoryAutoIndexer } from "../memory/auto-index/memory-auto-indexer";
export { AgentEventStore, CheckpointService } from "../memory/checkpoint";
export type { ICheckpoint, AgentEventRecord } from "../memory/checkpoint";

// ── Runtime：mission pool / billing adapter ──
export { MissionBudgetPool } from "../runtime/mission-budget-pool";
export { BillingRuntimeEnvAdapter } from "../runtime/billing-runtime-env.adapter";
