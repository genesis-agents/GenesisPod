/**
 * AI Engine - DAG Executor
 * 有向无环图执行器实现
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

  constructor(maxConcurrency = 10) {
    super();
    this.maxConcurrency = maxConcurrency;
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

        return this.createResult(context, workflow, startTime, false, {
          code: "CIRCULAR_DEPENDENCY",
          message: "Circular dependency detected in workflow",
        });
      }

      // 执行 DAG
      const events: ExecutionEvent[] = [];
      await this.executeDAG(dag, context, (event) => events.push(event));

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

        return this.createResult(context, workflow, startTime, false, {
          code: "STEPS_FAILED",
          message: `${failedNodes.length} step(s) failed`,
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
   */
  private async executeDAG(
    dag: Map<string, DAGNode>,
    context: ExecutionContext,
    onEvent: (event: ExecutionEvent) => void,
  ): Promise<void> {
    const running = new Map<string, Promise<void>>();
    const nodeStartTimes = new Map<string, number>();
    const WATCHDOG_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    while (true) {
      // 检查取消信号
      if (context.signal?.aborted) {
        for (const node of dag.values()) {
          if (node.status === "pending" || node.status === "ready") {
            node.status = "skipped";
          }
        }
        break;
      }

      // 检查超时的节点（watchdog）
      // 先收集超时节点，避免迭代 Map 时直接删除
      const timedOut: string[] = [];
      for (const [nodeId, startTime] of nodeStartTimes) {
        if (Date.now() - startTime > WATCHDOG_TIMEOUT) {
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
          onEvent(
            this.createEvent("step_failed", context, nodeId, {
              error: `Node timed out after ${WATCHDOG_TIMEOUT / 1000}s`,
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
        const promise = this.executeNode(node, dag, context, onEvent).finally(
          () => {
            running.delete(node.step.id);
            nodeStartTimes.delete(node.step.id);
          },
        );
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
   */
  private async executeNode(
    node: DAGNode,
    dag: Map<string, DAGNode>,
    context: ExecutionContext,
    onEvent: (event: ExecutionEvent) => void,
  ): Promise<void> {
    onEvent(
      this.createEvent("step_started", context, node.step.id, {
        step: { id: node.step.id, name: node.step.name },
      }),
    );

    const result = await this.executeStep(node.step, context);

    if (result.status === "completed") {
      node.status = "completed";
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
      onEvent(
        this.createEvent("step_failed", context, node.step.id, {
          error: result.error,
        }),
      );

      // 标记所有依赖此节点的节点为 skipped
      this.skipDependents(node.step.id, dag);
    } else if (result.status === "skipped") {
      node.status = "skipped";
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
}
