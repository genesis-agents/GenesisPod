/**
 * derive-shapes.ts — Frontend canonical type re-export module（B4-4 final）
 *
 * 所有 component / page / hook 需要的"形状类型"应当 import from 此文件，
 * 不再 import from `derive.ts`。
 *
 * 落地依据：thinning plan §B4-4 / §B5-1 / §B5-2 / §3.4 / §7.2
 *
 * 设计：
 * - 当前阶段：纯 re-export from derive.ts（保留实现位置，避免大幅 move）
 * - B5-1 hard gate 命中后：物理 move 所有 type 到本文件，derive.ts 仅保留 truth
 *   function（届时一起删除），本文件成为唯一 type source
 *
 * lint：本文件被允许，derive.ts 不被 component import（B5-2 enforce）
 */

export type {
  // status / role enums
  StageId,
  StageStatus,
  StepStatus,
  AgentRole,
  AgentPhase,
  // shapes
  PreflightRisk,
  StageState,
  AgentTraceItem,
  AgentLiveState,
  VerifierVerdict,
  MemoryIndexState,
  CostState,
  ReportDraft,
  MissionState,
  ChapterState,
  DimensionPipelineState,
  DerivedView,
} from './derive';

// pure mapping helpers（不携带 mission truth；B5-2 lint allowed by name）
export {
  STAGE_STEPS,
  mapStepIdToStageId,
  aggregateStageStatus,
} from './derive';
