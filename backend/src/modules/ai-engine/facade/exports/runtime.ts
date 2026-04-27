/**
 * Runtime exports —— 全部迁移到 ai-harness/facade。
 *
 * 历史出口：ProcessMemoryManagerService / HierarchicalMemoryCascadeService /
 *           ProcessManagerService / EventJournalService / CheckpointManager /
 *           EventBusService / ProgressTrackerService / MessageBusService /
 *           MessagePersistenceService / AgentLifecycleProtocolService /
 *           ResourceManagerService / HealthCheckRunner / ConstraintEngine /
 *           RateLimiter / TokenBucket / CostController /
 *           RuntimeEnvironmentService / MissionExecutorService /
 *           CapabilityGuardService / KernelSchedulerService /
 *           ProcessSupervisorService / StateTransitionValidator /
 *           InvalidTransitionError / TaskCompletionType / KernelApiService /
 *           KernelContext + 大量配套类型。
 *
 * ai-app 请直接 import from "@/modules/ai-harness/facade"。
 */
export {};
