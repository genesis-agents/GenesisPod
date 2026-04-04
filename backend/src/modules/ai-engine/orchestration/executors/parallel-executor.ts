/**
 * AI Engine - Parallel Executor
 * 并行执行器实现
 */

import {
  Workflow,
  WorkflowStep,
  ExecutionContext,
  ExecutionEvent,
  ExecutionResult,
  StepResult,
} from "../abstractions/orchestrator.interface";
import { BaseExecutor } from "./base-executor";

/**
 * 并行执行器
 * 并行执行所有没有依赖的步骤
 */
export class ParallelExecutor extends BaseExecutor {
  readonly id = "parallel-executor";
  readonly supportedModes = ["parallel"];

  /**
   * 最大并发数
   */
  private maxConcurrency: number;

  constructor(maxConcurrency = 10) {
    super();
    this.maxConcurrency = maxConcurrency;
  }

  async *execute(
    workflow: Workflow,
    context: ExecutionContext,
  ): AsyncGenerator<ExecutionEvent, ExecutionResult> {
    const startTime = new Date();

    yield this.createEvent("workflow_started", context, undefined, {
      workflow: { id: workflow.id, name: workflow.name },
      mode: "parallel",
    });

    try {
      // 执行所有步骤（并行）
      const results = await this.executeParallel(
        workflow.steps,
        context,
        (event) => event,
      );

      // 收集事件（简化处理，实际应该流式发送）
      for (const [stepId, result] of Object.entries(results)) {
        if (result.status === "completed") {
          yield this.createEvent("step_completed", context, stepId, {
            output: result.output,
            duration: result.duration,
          });
        } else if (result.status === "failed") {
          yield this.createEvent("step_failed", context, stepId, {
            error: result.error,
          });
        }
      }

      // 检查是否有失败的步骤
      const failedSteps = Object.entries(results).filter(
        ([, r]) => r.status === "failed",
      );

      if (failedSteps.length > 0) {
        yield this.createEvent("workflow_failed", context, undefined, {
          failedSteps: failedSteps.map(([id]) => id),
        });

        return this.createResult(context, workflow, startTime, false, {
          code: "STEPS_FAILED",
          message: `${failedSteps.length} step(s) failed`,
        });
      }

      yield this.createEvent("workflow_completed", context);

      return this.createResult(context, workflow, startTime, true);
    } catch (error) {
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
   * 并行执行步骤
   */
  private async executeParallel(
    steps: WorkflowStep[],
    context: ExecutionContext,
    onEvent: (event: ExecutionEvent) => void,
  ): Promise<Record<string, StepResult>> {
    const results: Record<string, StepResult> = {};
    const pending = [...steps];
    const running = new Map<string, Promise<void>>();

    while (pending.length > 0 || running.size > 0) {
      // 检查取消信号
      if (context.signal?.aborted) {
        // 取消所有运行中的步骤
        for (const stepId of running.keys()) {
          results[stepId] = {
            stepId,
            status: "cancelled",
            startTime: new Date(),
            endTime: new Date(),
            duration: 0,
          };
        }
        break;
      }

      // 启动新的步骤（不超过并发限制）
      let startedAny = false;
      let consecutiveSkips = 0;
      while (running.size < this.maxConcurrency && pending.length > 0) {
        // All remaining steps have unmet deps — break inner loop to avoid infinite cycling
        if (consecutiveSkips >= pending.length) {
          break;
        }

        const step = pending.shift()!;

        // 检查依赖是否满足
        if (step.dependsOn && step.dependsOn.length > 0) {
          const unmetDeps = step.dependsOn.filter(
            (depId) => !results[depId] || results[depId].status !== "completed",
          );

          if (unmetDeps.length > 0) {
            // 依赖未满足，放回队列末尾
            pending.push(step);
            consecutiveSkips++;
            continue;
          }
        }

        startedAny = true;
        consecutiveSkips = 0;

        // 启动步骤执行
        const promise = (async () => {
          onEvent(
            this.createEvent("step_started", context, step.id, {
              step: { id: step.id, name: step.name },
            }),
          );

          const result = await this.executeStep(step, context);
          results[step.id] = result;
          running.delete(step.id);
        })();

        running.set(step.id, promise);
      }

      // 死锁检测：所有 pending 步骤的依赖都指向已失败/跳过节点
      if (!startedAny && running.size === 0) {
        this.logger.error(
          "Deadlock detected: unresolvable step dependencies, breaking execution loop",
        );
        break;
      }

      // 等待至少一个步骤完成
      if (running.size > 0) {
        await Promise.race(running.values());
      }
    }

    return results;
  }

  /**
   * 创建执行结果
   */
  private createResult(
    context: ExecutionContext,
    workflow: Workflow,
    startTime: Date,
    success: boolean,
    error?: { code: string; message: string },
  ): ExecutionResult {
    const endTime = new Date();
    const stepResults = Array.from(context.stepResults.values());

    // 合并所有成功步骤的输出
    const output: Record<string, unknown> = {};
    for (const result of stepResults) {
      if (result.status === "completed" && result.output) {
        output[result.stepId] = result.output;
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
