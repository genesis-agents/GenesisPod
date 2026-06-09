/**
 * deep-insight runner 的依赖出入口（集中 re-export，保持 runner 顶部 import 清爽）。
 * 执行用 harness 的 AgentRunner（共享 agent 引擎）+ ChatFacade（plan 阶段结构化抽取）。
 */
export {
  AgentRunner,
  ChatFacade,
  type IAgentEvent,
} from "@/modules/ai-harness/facade";
export { AIModelType } from "@prisma/client";
export {
  CapabilityRegistry,
  type CapabilityManifest,
  type ICapabilityRunner,
  type CapabilityRunInput,
  type CapabilityRunContext,
  type CapabilityRunResult,
} from "../../capability";
