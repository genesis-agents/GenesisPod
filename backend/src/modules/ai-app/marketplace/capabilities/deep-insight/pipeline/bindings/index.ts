/**
 * deep-insight pipeline bindings 桶。
 * 14 阶段执行内核（StageBindings 实现）+ per-run crossStageState 绑定 helper。
 */
export {
  DeepInsightStageBindings,
  attachState,
  detachState,
} from "./deep-insight-stage-bindings";
export { invokeAgent, type AgentRunProjection } from "./agent-invoke.helper";
