/**
 * AI Engine - Workflow Node Handler Interface
 *
 * App 层实现此接口注册自定义步骤处理器，Engine 层负责调度执行。
 * 这是 L4 App → L3 Engine 的扩展点：App 注册 Handler，Engine 驱动 Workflow。
 *
 * 生命周期：prepare → execute → validate
 * 错误处理：onError 返回策略（retry/skip/abort）
 */

import type { ExecutionContext } from "../abstractions/orchestrator.interface";

/**
 * 工作流节点处理器接口
 *
 * @template TInput - 步骤输入类型
 * @template TOutput - 步骤输出类型
 */
export interface WorkflowNodeHandler<TInput = unknown, TOutput = unknown> {
  /** 处理器唯一标识（推荐格式: "module:action"，如 "ti:search-phase"） */
  readonly handlerId: string;

  /**
   * 预处理：在 execute 前对输入做变换、校验、补充上下文
   * 可选实现，默认透传 input
   */
  prepare?(input: TInput, context: ExecutionContext): Promise<TInput>;

  /**
   * 核心执行逻辑（必须实现）
   */
  execute(input: TInput, context: ExecutionContext): Promise<TOutput>;

  /**
   * 后验证：检查 execute 输出是否满足质量要求
   * 返回 true = 通过，false = 视为失败
   * 可选实现，默认通过
   */
  validate?(output: TOutput, context: ExecutionContext): Promise<boolean>;

  /**
   * 错误处理策略
   * @returns 'retry' - 重试当前步骤
   *          'skip'  - 跳过，继续后续步骤
   *          'abort' - 中止整个工作流
   */
  onError?(
    error: Error,
    context: ExecutionContext,
  ): Promise<"retry" | "skip" | "abort">;
}

/**
 * Map 步骤的元素处理器
 * 用于 "map" StepType：对数组中的每个元素执行相同的 handler
 */
export interface MapStepConfig {
  /** 并发限制（默认 4） */
  concurrency?: number;
  /** 单个元素失败时的策略（默认 'skip'） */
  onItemError?: "skip" | "abort";
}
