/**
 * AI Engine - DAG Executor
 * 有向无环图执行器实现
 *
 * ★ 集成 Kernel 服务：
 * - ProgressTrackerService：自动进度上报（每个 step = 一个 phase）
 * - CheckpointManager：step 完成后自动保存检查点
 * - CircuitBreakerService：step 级健康检查（继承自 BaseExecutor）
 * - RetryStrategy：step 级重试（继承自 BaseExecutor）
 * - TraceCollectorService：自动 Trace/Span
 */

import { OnModuleDestroy } from "@nestjs/common";
import {
  Workflow,
  WorkflowStep,
  ExecutionContext,
  ExecutionEvent,
  ExecutionResult,
} from "../abstractions/orchestrator.interface";
import { BaseExecutor } from "./base-executor";
import type { CheckpointManager } from "../../../ai-engine/runtime/journal/checkpoint-manager";
import type { TraceCollectorService } from "../../../ai-engine/runtime/observability/trace-collector.service";

/** 默认看门狗超时（5 分钟） */
const DEFAULT_WATCHDOG_TIMEOUT = 5 * 60 * 1000;

/**
 * DAG 节点状态
 */
interface DAGNode {
  step: WorkflowStep;
  dependencies: Set<string>;
  dependents: Set<string>;
  status: "pending" | "ready" | "running" | "completed" | "failed" | "skipped";
}

/**
 * DAG 执行器
 * 基于依赖关系执行工作流
 */
export class DAGExecutor extends BaseExecutor implements OnModuleDestroy {
  readonly id = "dag-executor";
  readonly supportedModes = ["dag"];

  private maxConcurrency: number;
  private checkpointManager?: CheckpointManager;
  private traceCollector?: TraceCollectorService;

  constructor(maxConcurrency = 10) {
    super();
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * 设置检查点管理器（可选，启用自动检查点）
   */
  setCheckpointManager(checkpointManager: CheckpointManager): void {
    this.checkpointManager = checkpointManager;
  }

  /**
   * 设置追踪收集器（可选，启用自动 Trace/Span）
   */
  setTraceCollector(traceCollector: TraceCollectorService): void {
    this.traceCollector = traceCollector;
  }

  /**
   * 清理资源
   */
  onModuleDestroy(): void {
    // DAGExecutor 不持有长期资源，无需清理
    // 所有执行状态都在 executeDAG 的局部 running Map 中
  }

  async *execute(
    workflow: Workflow,
    context: ExecutionContext,
  ): AsyncGenerator<ExecutionEvent, ExecutionResult> {
    const startTime = new Date();
    const enableCheckpoints = workflow.config?.enableCheckpoints ?? false;
    const enableTracing = workflow.config?.enableTracing ?? false;

    // ★ 自动创建进度追踪任务
    if (this.progressTracker && context.metadata?.roomConfig) {
      try {
        this.progressTracker.create({
          id: context.executionId,
          type: "workflow",
          name: workflow.name,
          roomConfig: context.metadata.roomConfig as {
            roomId: string;
            roomType: "topic" | "project" | "team" | "user";
            entityId: string;
          },
          phases: workflow.steps.map((step) => ({
            id: step.id,
            name: step.name || step.id,
            weight:
              (step.metadata as { progressWeight?: number })?.progressWeight ??
              1,
          })),
          metadata: { workflowId: workflow.id },
        });
        this.progressTracker.start(context.executionId);
      } catch (err) {
        this.logger.warn(
          `[Progress] Failed to create tracker: ${(err as Error).message}`,
        );
      }
    }

    // ★ 自动创建 Trace
    let traceId: string | undefined;
    if (enableTracing && this.traceCollector) {
      try {
        traceId = this.traceCollector.startTrace({
          name: `workflow:${workflow.name}`,
          type: "team_execution",
          metadata: {
            workflowId: workflow.id,
            executionId: context.executionId,
            stepCount: workflow.steps.length,
          },
        });
      } catch (err) {
        this.logger.warn(
          `[Trace] Failed to start trace: ${(err as Error).message}`,
        );
      }
    }

    yield this.createEvent("workflow_started", context, undefined, {
      workflow: { id: workflow.id, name: workflow.name },
      mode: "dag",
    });

    try {
      // 构建 DAG
      const dag = this.buildDAG(workflow.steps);

      // 验证 DAG（检测循环依赖）
      if (!this.validateDAG(dag)) {
        yield this.createEvent("workflow_failed", context, undefined, {
          error: "Circular dependency detected",
        });

        this.finalizeTracking(
          context.executionId,
          false,
          "Circular dependency detected",
          traceId,
        );
        return this.createResult(context, workflow, startTime, false, {
          code: "CIRCULAR_DEPENDENCY",
          message: "Circular dependency detected in workflow",
        });
      }

      // 执行 DAG
      const events: ExecutionEvent[] = [];
      await this.executeDAG(
        dag,
        workflow,
        context,
        enableCheckpoints,
        traceId,
        (event) => events.push(event),
      );

      // 发送收集的事件
      for (const event of events) {
        yield event;
      }

      // 检查是否有失败的节点
      const failedNodes = Array.from(dag.values()).filter(
        (n) => n.status === "failed",
      );

      if (failedNodes.length > 0) {
        yield this.createEvent("workflow_failed", context, undefined, {
          failedSteps: failedNodes.map((n) => n.step.id),
        });

        this.finalizeTracking(
          context.executionId,
          false,
          `${failedNodes.length} step(s) failed`,
          traceId,
        );
        return this.createResult(context, workflow, startTime, false, {
          code: "STEPS_FAILED",
          message: `${failedNodes.length} step(s) failed`,
        });
      }

      yield this.createEvent("workflow_completed", context);

      this.finalizeTracking(context.executionId, true, undefined, traceId);
      return this.createResult(context, workflow, startTime, true);
    } catch (error) {
      yield this.createEvent("workflow_failed", context, undefined, {
        error: (error as Error).message,
      });

      this.finalizeTracking(
        context.executionId,
        false,
        (error as Error).message,
        traceId,
      );
      return this.createResult(context, workflow, startTime, false, {
        code: "EXECUTION_ERROR",
        message: (error as Error).message,
      });
    }
  }

  /**
   * 构建 DAG
   */
  private buildDAG(steps: WorkflowStep[]): Map<string, DAGNode> {
    const dag = new Map<string, DAGNode>();

    // 创建所有节点
    for (const step of steps) {
      dag.set(step.id, {
        step,
        dependencies: new Set(step.dependsOn || []),
        dependents: new Set(),
        status: "pending",
      });
    }

    // 建立反向依赖关系
    for (const [id, node] of dag) {
      for (const depId of node.dependencies) {
        const depNode = dag.get(depId);
        if (depNode) {
          depNode.dependents.add(id);
        }
      }
    }

    // 标记没有依赖的节点为 ready
    for (const node of dag.values()) {
      if (node.dependencies.size === 0) {
        node.status = "ready";
      }
    }

    return dag;
  }

  /**
   * 验证 DAG（检测循环依赖）
   */
  private validateDAG(dag: Map<string, DAGNode>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true; // 发现循环
      }
      if (visited.has(nodeId)) {
        return false; // 已访问过，无循环
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = dag.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (hasCycle(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of dag.keys()) {
      if (hasCycle(nodeId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 执行 DAG
   * ★ 支持: 可配置看门狗超时、自动检查点、进度上报、Trace Span
   */
  private async executeDAG(
    dag: Map<string, DAGNode>,
    workflow: Workflow,
    context: ExecutionContext,
    enableCheckpoints: boolean,
    traceId: string | undefined,
    onEvent: (event: ExecutionEvent) => void,
  ): Promise<void> {
    const running = new Map<string, Promise<void>>();
    const nodeStartTimes = new Map<string, number>();
    // ★ 可配置看门狗超时：workflow.config.timeout 或 step.timeout 或默认 5 分钟
    const globalTimeout = workflow.config?.timeout ?? DEFAULT_WATCHDOG_TIMEOUT;

    while (true) {
      // 检查取消信号
      if (context.signal?.aborted) {
        for (const node of dag.values()) {
          if (node.status === "pending" || node.status === "ready") {
            node.status = "skipped";
            // ★ 进度上报：跳过的阶段
            this.trySkipPhase(context.executionId, node.step.id, "cancelled");
          }
        }
        break;
      }

      // 检查超时的节点（watchdog）
      const timedOut: string[] = [];
      for (const [nodeId, startTime] of nodeStartTimes) {
        // 使用 step 级别超时或全局超时
        const stepNode = dag.get(nodeId);
        const nodeTimeout = stepNode?.step.timeout ?? globalTimeout;
        if (Date.now() - startTime > nodeTimeout) {
          timedOut.push(nodeId);
        }
      }
      for (const nodeId of timedOut) {
        const stuckNode = dag.get(nodeId);
        if (stuckNode && stuckNode.status === "running") {
          stuckNode.status = "failed";
          nodeStartTimes.delete(nodeId);
          running.delete(nodeId);
          this.skipDependents(nodeId, dag);

          const timeoutMsg = `Node timed out after ${((stuckNode.step.timeout ?? globalTimeout) / 1000).toFixed(0)}s`;
          // ★ 进度上报：超时失败
          this.tryFailPhase(context.executionId, nodeId, timeoutMsg);

          onEvent(
            this.createEvent("step_failed", context, nodeId, {
              error: timeoutMsg,
            }),
          );
        }
      }

      // 获取所有就绪的节点
      const readyNodes = Array.from(dag.values()).filter(
        (n) => n.status === "ready",
      );

      // 如果没有就绪节点且没有运行中的节点，结束执行
      if (readyNodes.length === 0 && running.size === 0) {
        break;
      }

      // 启动就绪节点（不超过并发限制）
      for (const node of readyNodes) {
        if (running.size >= this.maxConcurrency) {
          break;
        }

        node.status = "running";
        nodeStartTimes.set(node.step.id, Date.now());
        const promise = this.executeNode(
          node,
          dag,
          workflow,
          context,
          enableCheckpoints,
          traceId,
          onEvent,
        ).finally(() => {
          running.delete(node.step.id);
          nodeStartTimes.delete(node.step.id);
        });
        running.set(node.step.id, promise);
      }

      // 等待至少一个节点完成
      if (running.size > 0) {
        await Promise.race(running.values());
      }
    }
  }

  /**
   * 执行单个节点
   * ★ 集成：进度上报、自动检查点、Trace Span
   */
  private async executeNode(
    node: DAGNode,
    dag: Map<string, DAGNode>,
    workflow: Workflow,
    context: ExecutionContext,
    enableCheckpoints: boolean,
    traceId: string | undefined,
    onEvent: (event: ExecutionEvent) => void,
  ): Promise<void> {
    // ★ 进度上报：开始阶段
    this.tryStartPhase(context.executionId, node.step.id, node.step.name);

    // ★ 自动 Trace Span
    let spanId: string | undefined;
    if (traceId && this.traceCollector) {
      try {
        spanId = this.traceCollector.addSpan(traceId, {
          name: node.step.name || node.step.id,
          type: this.mapStepTypeToSpanType(node.step.type),
          metadata: { executor: node.step.executor, stepId: node.step.id },
        });
      } catch {
        // non-critical
      }
    }

    onEvent(
      this.createEvent("step_started", context, node.step.id, {
        step: { id: node.step.id, name: node.step.name },
      }),
    );

    const stepStartTime = Date.now();
    const result = await this.executeStep(node.step, context);
    const stepDuration = Date.now() - stepStartTime;

    if (result.status === "completed") {
      node.status = "completed";

      // ★ 进度上报：完成阶段
      this.tryCompletePhase(context.executionId, node.step.id);

      // ★ Trace Span 结束
      if (spanId && traceId && this.traceCollector) {
        try {
          this.traceCollector.endSpan(spanId, {
            status: "success",
            duration: stepDuration,
          });
        } catch {
          // non-critical
        }
      }

      // ★ 自动检查点
      if (enableCheckpoints && this.checkpointManager) {
        try {
          await this.checkpointManager.createCheckpoint(
            context.executionId,
            workflow.id,
            node.step.id,
            context,
          );
          onEvent(this.createEvent("checkpoint_saved", context, node.step.id));
        } catch (err) {
          this.logger.warn(
            `[Checkpoint] Failed to save after step "${node.step.id}": ${(err as Error).message}`,
          );
        }
      }

      onEvent(
        this.createEvent("step_completed", context, node.step.id, {
          output: result.output,
          duration: result.duration,
        }),
      );

      // 更新依赖此节点的其他节点
      for (const dependentId of node.dependents) {
        const dependent = dag.get(dependentId);
        if (dependent) {
          dependent.dependencies.delete(node.step.id);
          if (
            dependent.dependencies.size === 0 &&
            dependent.status === "pending"
          ) {
            dependent.status = "ready";
          }
        }
      }
    } else if (result.status === "failed") {
      node.status = "failed";

      // ★ 进度上报：失败阶段
      this.tryFailPhase(
        context.executionId,
        node.step.id,
        result.error?.message || "Step failed",
      );

      // ★ Trace Span 结束（失败）
      if (spanId && traceId && this.traceCollector) {
        try {
          this.traceCollector.endSpan(spanId, {
            status: "error",
            duration: stepDuration,
            error: result.error?.message,
          });
        } catch {
          // non-critical
        }
      }

      onEvent(
        this.createEvent("step_failed", context, node.step.id, {
          error: result.error,
        }),
      );

      // 标记所有依赖此节点的节点为 skipped
      this.skipDependents(node.step.id, dag);
    } else if (result.status === "skipped") {
      node.status = "skipped";

      // ★ 进度上报：跳过阶段
      this.trySkipPhase(context.executionId, node.step.id, "Condition not met");

      // ★ Trace Span 结束（跳过）
      if (spanId && traceId && this.traceCollector) {
        try {
          this.traceCollector.endSpan(spanId, {
            status: "success",
          });
        } catch {
          // non-critical
        }
      }

      onEvent(
        this.createEvent("step_skipped", context, node.step.id, {
          reason: "Condition not met",
        }),
      );
    }
  }

  /**
   * 跳过所有依赖失败节点的节点（BFS，避免深层图的递归栈溢出）
   */
  private skipDependents(nodeId: string, dag: Map<string, DAGNode>): void {
    const queue = [nodeId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = dag.get(id);
      if (!node) continue;
      for (const depId of node.dependents) {
        const dep = dag.get(depId);
        if (dep && dep.status === "pending") {
          dep.status = "skipped";
          queue.push(depId);
        }
      }
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
    error?: { code: string; message: string },
  ): ExecutionResult {
    const endTime = new Date();
    const stepResults = Array.from(context.stepResults.values());

    // 收集所有成功步骤的输出
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

  // ==================== 辅助方法 ====================

  /**
   * 完成追踪（进度 + Trace）
   */
  private finalizeTracking(
    executionId: string,
    success: boolean,
    errorMsg?: string,
    traceId?: string,
  ): void {
    // 进度追踪
    if (this.progressTracker) {
      try {
        if (success) {
          this.progressTracker.complete(executionId);
        } else {
          this.progressTracker.fail(executionId, errorMsg || "Workflow failed");
        }
      } catch {
        // non-critical
      }
    }

    // Trace
    if (traceId && this.traceCollector) {
      try {
        this.traceCollector.endTrace(traceId, {
          status: success ? "success" : "error",
        });
      } catch {
        // non-critical
      }
    }
  }

  /** 安全地开始进度阶段 */
  private tryStartPhase(
    executionId: string,
    phaseId: string,
    name?: string,
  ): void {
    if (!this.progressTracker) return;
    try {
      this.progressTracker.startPhase(executionId, phaseId, name);
    } catch {
      // non-critical
    }
  }

  /** 安全地完成进度阶段 */
  private tryCompletePhase(executionId: string, phaseId: string): void {
    if (!this.progressTracker) return;
    try {
      this.progressTracker.completePhase(executionId, phaseId);
    } catch {
      // non-critical
    }
  }

  /** 安全地标记进度阶段失败 */
  private tryFailPhase(
    executionId: string,
    phaseId: string,
    error: string,
  ): void {
    if (!this.progressTracker) return;
    try {
      this.progressTracker.failPhase(executionId, phaseId, error);
    } catch {
      // non-critical
    }
  }

  /** 安全地跳过进度阶段 */
  private trySkipPhase(
    executionId: string,
    phaseId: string,
    reason: string,
  ): void {
    if (!this.progressTracker) return;
    try {
      this.progressTracker.skipPhase(executionId, phaseId, reason);
    } catch {
      // non-critical
    }
  }

  /** 将 WorkflowStep type 映射到 SpanType */
  private mapStepTypeToSpanType(
    stepType: string,
  ):
    | "llm_call"
    | "tool_execution"
    | "search"
    | "analysis"
    | "synthesis"
    | "review"
    | "planning"
    | "phase"
    | "evaluation" {
    const mapping: Record<
      string,
      | "llm_call"
      | "tool_execution"
      | "search"
      | "analysis"
      | "synthesis"
      | "review"
      | "planning"
      | "phase"
      | "evaluation"
    > = {
      tool: "tool_execution",
      skill: "tool_execution",
      agent: "llm_call",
      handler: "phase",
      map: "phase",
      transform: "analysis",
      decision: "evaluation",
      parallel: "phase",
    };
    return mapping[stepType] || "phase";
  }
}
