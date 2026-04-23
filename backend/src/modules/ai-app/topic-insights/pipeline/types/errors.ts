/**
 * Pipeline 异常层次
 *
 * 所有 harness 自定义异常继承 PipelineError，便于 orchestrator 区分
 * "可重试"/"需中止"/"业务失败" 三类。
 */

export abstract class PipelineError extends Error {
  constructor(
    message: string,
    public readonly stageId: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BudgetExhaustedError extends PipelineError {
  constructor(
    stageId: string,
    public readonly dimension: "tokens" | "cost" | "toolCalls" | "wallTime",
    public readonly limit: number,
    public readonly used: number,
  ) {
    super(
      `[${stageId}] Pipeline budget exhausted (${dimension}: used=${used} limit=${limit})`,
      stageId,
    );
  }
}

export class StageMissingError extends PipelineError {
  constructor(stageId: string) {
    super(`[${stageId}] Stage not found in registry`, stageId);
  }
}

export class StageDependencyError extends PipelineError {
  constructor(stageId: string, missing: string) {
    super(
      `[${stageId}] Dependency stage "${missing}" has not completed`,
      stageId,
    );
  }
}

export class StageAbortedError extends PipelineError {
  constructor(stageId: string, reason: string) {
    super(`[${stageId}] Aborted: ${reason}`, stageId);
  }
}

export class StageSchemaError extends PipelineError {
  constructor(stageId: string, issues: string[]) {
    super(
      `[${stageId}] Zod schema validation failed: ${issues.join(", ")}`,
      stageId,
    );
  }
}
