/**
 * 8 Core Stages — Tier Core Group D 出口
 */

export * from "./stage-context";
export { PrismaPlanContextProvider } from "./prisma-plan-context-provider";
export { InitStage } from "./st-00-init.stage";
export {
  PlanStage,
  PlanContextProvider,
  StubPlanContextProvider,
} from "./st-01-plan.stage";
export { ResearchStage } from "./st-02-research.stage";
export { OutlineStage } from "./st-02b-outline.stage";
export type { OutlineStageInput } from "./st-02b-outline.stage";
export { WriteStage } from "./st-03-write.stage";
export type { WriteStageInput } from "./st-03-write.stage";
export { ReviewStage } from "./st-04-review.stage";
export { IntegrateStage } from "./st-05-integrate.stage";
export type { IntegrateStageInput } from "./st-05-integrate.stage";
export { SynthStage } from "./st-07-synthesis.stage";
export type { SynthStageInput } from "./st-07-synthesis.stage";
export { QualityGateStage } from "./st-08-quality-gate.stage";
export type { QualityGateInput } from "./st-08-quality-gate.stage";
export { AssemblyStage } from "./st-11-assembly.stage";
export { PersistStage } from "./st-13-persist.stage";
export type { PersistStageInput } from "./st-13-persist.stage";
export { CleanupStage } from "./st-14-cleanup.stage";
export type { CleanupStageInput } from "./st-14-cleanup.stage";

// Enhancement stages (Group I)
export { CogLoopStage } from "./st-06-cog-loop.stage";
export type { CogLoopStageInput } from "./st-06-cog-loop.stage";
export { EvalStage } from "./st-09-eval.stage";
export type { EvalStageInput } from "./st-09-eval.stage";
export { FactCheckStage } from "./st-10-fact-check.stage";
export type { FactCheckStageInput } from "./st-10-fact-check.stage";
export { LatexStage } from "./st-12-latex.stage";
