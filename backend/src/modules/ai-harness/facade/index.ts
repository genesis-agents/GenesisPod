/**
 * AI Harness Facade —— 与 ai-engine 平级的 agent 执行底座
 *
 * 定位：harness 是"agent 怎么跑"的抽象（loop / runner / spec / event /
 * schema / budget / billing / failure-learning），与 ai-engine 的"agent
 * 能干什么"（LLM / tools / RAG / knowledge）解耦。
 *
 * 依赖方向（强制单向）：
 *   ai-app    → ai-harness → ai-engine
 *   ai-engine 永远不允许 import ai-harness。
 *
 * 当前阶段（PR-H1+H2）：
 *   - 已搬迁: abstractions/（IAgent / IAgentEvent / IAgentSpec / 等接口）
 *   - 仍在 ai-engine/harness/: core / loop / executor / events / verify / runtime / ...
 *
 * 后续 PR 把 core / loop / executor / billing / failure-learner 搬入 ai-harness，
 * 并加 eslint 规则禁止 ai-engine 反向引用。
 */

export * from "../abstractions";
export { HarnessFacade } from "./harness.facade";
