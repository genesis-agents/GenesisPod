/**
 * Observability exports —— 全部迁移到 ai-harness/facade。
 *
 * 历史出口：TraceCollectorService / AiObservabilityService /
 *           CostAttributionService / SessionLatencyTrackerService /
 *           EvalPipelineService / TraceType + 8 个 trace 数据类型。
 *
 * ai-app 请直接 import from "@/modules/ai-harness/facade"。
 */
export {};
