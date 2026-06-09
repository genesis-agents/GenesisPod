/**
 * deep-insight runner 的依赖出入口（集中 re-export，保持 runner 顶部 import 清爽）。
 *
 * W2（2026-06-09 能力即产品）：runner.run 改为 orchestrator + recipe 跑真 14 步，
 * 故除 AgentRunner（共享 agent 引擎）外，补 MissionPipelineOrchestrator /
 * MissionPipelineRegistry / CrossStageState / InMemoryMissionStore / StageRunArgs
 * 等 harness 编排原语 re-export（全部来自 ai-harness/facade，单向不穿透）。
 */
export {
  AgentRunner,
  ChatFacade,
  MissionPipelineOrchestrator,
  MissionPipelineRegistry,
  CrossStageState,
  InMemoryMissionStore,
  defineMissionPipeline,
  type IAgentEvent,
  type StageRunArgs,
  type MissionPipelineConfig,
  type PipelineMissionEvent,
  type PipelineMissionResult,
  type RunPipelineArgs,
} from "@/modules/ai-harness/facade";
// ★ W2.5（富增强到 playground 等价）：harness 评判 / 富组装原语（全 @Global HarnessModule
//   导出，runner 构造函数注入即可，无需 marketplace.module 额外 provider）。
export {
  ReportArtifactAssembler,
  SectionSelfEvalService,
  SectionRemediationService,
  ReportEvaluationService,
  QualityTraceComputeService,
  type ReportArtifact,
  type ChapterInput,
  type EvaluationResult,
  type RemediationAction,
  type SectionSelfEvalResult,
  type QualityTraceContext,
  type QualityTrace,
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
export type {
  MissionPersistencePort,
  MissionTerminalDetails,
} from "../../capability/capability-runner.port";
