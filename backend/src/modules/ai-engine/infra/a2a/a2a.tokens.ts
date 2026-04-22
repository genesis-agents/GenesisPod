/**
 * A2A DI Tokens
 * 被 A2AController 用于注入位于 ai-engine/teams 和 ai-kernel/observability 的服务，
 * 避免 infra/a2a 直接耦合具体实现类。
 */

/**
 * DI token for TeamsService injected into A2AController.
 * 绑定（useExisting: TeamsService）在 A2AModule 中完成。
 */
export const TEAMS_SERVICE_TOKEN = "A2ATeamsService";

/**
 * DI token for TraceCollector (ProcessEventLogService) injected into A2AController.
 * 绑定（useExisting: ProcessEventLogService）在 A2AModule 中完成。
 */
export const TRACE_COLLECTOR_TOKEN = "A2ATraceCollector";
