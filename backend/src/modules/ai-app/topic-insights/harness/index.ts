/**
 * Topic Insights Harness (deprecated location)
 *
 * P3-1 搬迁（2026-04-23）：pipeline / stages / utils / rollout 已移出本目录。
 * 保留 agents/ 和 llm/ 以维持 legacy 引用；P3-2 将与 17 个 .agent.ts + base-agent-runner
 * + HarnessAgentRegistry + LlmInvokerService 一起删除。
 *
 * 对外仍导出 agents + llm 给旧代码（pipeline / mission-execution / rollout）依赖，
 * 但新代码应直接从 topic-insights/pipeline / topic-insights/rollout 导入。
 */

export * from "./agents";
export * from "./llm";
