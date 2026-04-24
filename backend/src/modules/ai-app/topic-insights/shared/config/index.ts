/**
 * Shared config barrel — baseline recovery.
 *
 * 这些常量/函数对应 baseline `38347e2a7` 的 Leader planning 后处理基础设施。
 * harness 迁移丢失后现在恢复。E2/E3... 后续 stage 会消费这些。
 */

export {
  FRAMEWORK_SKILLS_BY_TOPIC_TYPE,
  EVENT_SUBTYPE_SKILLS,
  RECOMMENDED_DEPTH_BY_TOPIC_TYPE,
  DEBATE_SKILLS_BY_TOPIC_TYPE,
  resolveFrameworkSkills,
  detectEventSubType,
} from "./framework-skills.config";

export { VALID_SKILLS, filterValidSkills } from "./valid-skills.config";

export { selectDefaultSkillsForDimension } from "./default-skills.utils";

export {
  postProcessLeaderPlan,
  summarizeResearcherAssignments,
} from "./plan-post-process";
export type { PlanPostProcessLogger } from "./plan-post-process";

export { selectSkillsAndToolsForTask } from "./task-keyword-routing";

export {
  parseRevisionRound,
  determineRevisionTargets,
  REVIEW_FAILURE_THRESHOLDS,
  MAX_REVISION_ROUNDS,
} from "./review-thresholds";
export type {
  DimensionRevisionTarget,
  RevisionDecision,
  DimensionReviewLite,
  TaskLite,
} from "./review-thresholds";
