/**
 * writing-team types（v5.1 §4 R3-A demo）
 *
 * Minimal demo ai-app to validate R1 mission pipeline framework on a non-playground
 * domain：writer 把 topic 转成 draft，editor 拍签字。
 *
 * 完整实现（< 15 文件）：abstractions + config + service + module + controller +
 * 1 spec。intentionally minimal — 验证 R1 primitive + IMissionStore +
 * MissionPipelineOrchestrator 的可复用性。
 */

/** 用户提交的 mission input（业务 schema 由 ai-app 决定）*/
export interface WritingTeamInput {
  /** 写作主题 */
  readonly topic: string;
  /** 字数预算 */
  readonly targetWords?: number;
  /** 风格档位 */
  readonly tone?: "neutral" | "casual" | "formal";
}

/** 三 stage 各自的预期输出形态（demo 等价）*/
export interface WritingTeamPlanOutput {
  readonly outline: ReadonlyArray<string>;
}
export interface WritingTeamDraftOutput {
  readonly draftMarkdown: string;
  readonly wordCount: number;
}
export interface WritingTeamSignoffOutput {
  readonly approved: boolean;
  readonly notes?: string;
}

/** 完整 mission result */
export interface WritingTeamResult {
  readonly missionId: string;
  readonly status: "completed" | "failed" | "aborted";
  readonly plan?: WritingTeamPlanOutput;
  readonly draft?: WritingTeamDraftOutput;
  readonly signoff?: WritingTeamSignoffOutput;
  readonly error?: unknown;
}
