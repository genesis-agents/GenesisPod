/**
 * AI Engine - Sequential Executor
 * 顺序执行器实现
 */

import {
  Workflow,
  ExecutionContext,
  ExecutionEvent,
  ExecutionResult,
} from "../abstractions/orchestrator.interface";
import { BaseExecutor } from "./base-executor";

/**
 * 顺序执行器
 * 按步骤顺序依次执行
 */
export class SequentialExecutor extends BaseExecutor {
  readonly id = "sequential-executor";
  readonly supportedModes = ["sequential"];

  async *execute(
    workflow: Workflow,
    context: ExecutionContext,
  ): AsyncGenerator<ExecutionEvent, ExecutionResult> {
    const startTime = new Date();

    // 发送工作流开始事件
    yield this.createEvent("workflow_started", context, undefined, {
      workflow: { id: workflow.id, name: workflow.name },
    });

    try {
      // 按顺序执行每个步骤
      for (const step of workflow.steps) {
        // 检查取消信号
        if (context.signal?.aborted) {
          yield this.createEvent("workflow_cancelled", context);
          return this.createResult(context, workflow, startTime, false, {
            code: "CANCELLED",
            message: "Workflow cancelled",
          });
        }

        // 发送步骤开始事件
        yield this.createEvent("step_started", context, step.id, {
          step: { id: step.id, name: step.name, type: step.type },
        });

        // 执行步骤
        const result = await this.executeStep(step, context);

        // 发送步骤结果事件
        if (result.status === "completed") {
          yield this.createEvent("step_completed", context, step.id, {
            output: result.output,
            duration: result.duration,
          });
        } else if (result.status === "failed") {
          yield this.createEvent("step_failed", context, step.id, {
            error: result.error,
          });

          // 处理错误
          if (step.onError?.strategy === "abort") {
            yield this.createEvent("workflow_failed", context, undefined, {
              error: result.error,
              failedStep: step.id,
            });
            return this.createResult(context, workflow, startTime, false, {
              code: result.error?.code || "STEP_FAILED",
              message: result.error?.message || "Step execution failed",
              stepId: step.id,
            });
          }
          // skip: 继续执行下一步
        } else if (result.status === "skipped") {
          yield this.createEvent("step_skipped", context, step.id, {
            reason: "Condition not met",
          });
        }
      }

      // 发送工作流完成事件
      yield this.createEvent("workflow_completed", context, undefined, {
        stepResults: Array.from(context.stepResults.values()),
      });

      return this.createResult(context, workflow, startTime, true);
    } catch (error) {
      // 发送工作流失败事件
      yield this.createEvent("workflow_failed", context, undefined, {
        error: (error as Error).message,
      });

      return this.createResult(context, workflow, startTime, false, {
        code: "EXECUTION_ERROR",
        message: (error as Error).message,
      });
    }
  }

  /**
   * 创建执行结果
   */
  private createResult(
    context: ExecutionContext,
    workflow: Workflow,
    startTime: Date,
    success: boolean,
    error?: { code: string; message: string; stepId?: string },
  ): ExecutionResult {
    const endTime = new Date();
    const stepResults = Array.from(context.stepResults.values());

    // 获取最后一个成功步骤的输出作为工作流输出
    let output: unknown;
    for (let i = stepResults.length - 1; i >= 0; i--) {
      if (stepResults[i].status === "completed" && stepResults[i].output) {
        output = stepResults[i].output;
        break;
      }
    }

    return {
      executionId: context.executionId,
      workflowId: workflow.id,
      success,
      output,
      error,
      stepResults,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
    };
  }
}
