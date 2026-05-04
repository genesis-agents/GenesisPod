/**
 * AI Engine - Teams Abstractions
 * 团队抽象层导出
 */

// Team (v3 R0-A1-c: BUILTIN_TEAMS / BuiltinTeamId 已下推到各 ai-app)
export {
  TeamId,
  TeamType,
  TeamConfig,
  MemberRoleConfig,
  ITeam,
  TeamCapability,
  TeamExecutionStatus,
  TeamExecutionContext,
} from "./team.interface";

// Role
export {
  RoleId,
  BUILTIN_ROLES,
  BuiltinRoleId,
  RoleType,
  WorkStyle,
  IRole,
  RoleConfig,
  DEFAULT_WORK_STYLE,
  LEADER_WORK_STYLE,
  ROLE_DESCRIPTIONS,
} from "./role.interface";

// Member
export {
  TeamMemberId,
  MemberStatus,
  ITeamMember,
  MemberConfig,
  ILeader,
  TaskInput,
  TaskAttachment,
  SubTask,
  TaskAssignment,
  MemberOutput,
  ReviewResult,
  ReviewIssue,
  IntegratedResult,
  ReworkDecision,
} from "./member.interface";

// Workflow
export {
  WorkflowType,
  WorkflowStepType,
  WorkflowStepStatus,
  IWorkflow,
  IWorkflowStep,
  StepCondition,
  RetryConfig,
  ReviewConfig,
  ReviewCriterion,
  LoopConfig,
  WorkflowValidationResult,
  WorkflowValidationError,
  WorkflowValidationWarning,
  WorkflowExecutionState,
  StepExecutionState,
  WorkflowConfig,
  WorkflowStepConfig,
} from "./workflow.interface";

// Mission Context Package
export {
  HardConstraint,
  CoreEntity,
  Prohibition,
  QualityStandard,
  EstablishedFact,
  TaskUnderstanding,
  MissionContextPackage,
  createEmptyContextPackage,
  validateContextPackage,
  mergeContextPackages,
} from "./mission-context.interface";
