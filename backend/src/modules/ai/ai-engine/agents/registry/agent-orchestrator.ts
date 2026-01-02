/**
 * AI Engine - Agent Orchestrator
 * Agent 编排器 - 协调 Agent 执行
 */

import { Injectable, Logger } from "@nestjs/common";
import { AgentId, AgentInput, AgentEvent } from "../../core/types/agent.types";
import { AgentRegistry } from "./agent-registry";

/**
 * 状态报告项
 */
export interface AgentStatusReport {
  agentId: AgentId;
  name: string;
  available: boolean;
  executions: number;
  errors: number;
}

/**
 * Agent 编排器
 * 负责选择和调度 Agent 执行任务
 */
@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger(AgentOrchestrator.name);

  constructor(private readonly registry: AgentRegistry) {}

  /**
   * 执行 Agent 任务
   * 流式返回执行事件
   */
  async *execute(
    input: AgentInput,
    agentId?: AgentId,
    _userId?: string,
  ): AsyncGenerator<AgentEvent> {
    // 选择 Agent
    const selectedAgentId = agentId || (await this.selectAgent(input));

    if (!selectedAgentId) {
      yield {
        type: "error",
        error: "No suitable agent found for the request",
      };
      return;
    }

    if (!this.registry.has(selectedAgentId)) {
      yield {
        type: "error",
        error: `Agent not found: ${selectedAgentId}`,
      };
      return;
    }

    const agent = this.registry.get(selectedAgentId);

    this.logger.log(
      `[execute] Using agent: ${agent.id} for prompt: ${input.prompt?.substring(0, 50)}...`,
    );

    try {
      // 生成执行计划
      const plan = await agent.plan(input);

      // 执行计划
      for await (const event of agent.execute(plan)) {
        yield event;

        // 记录完成或错误
        if (event.type === "complete") {
          this.registry.recordExecution(selectedAgentId, event.result.success);
        } else if (event.type === "error") {
          this.registry.recordExecution(selectedAgentId, false);
        }
      }
    } catch (error) {
      this.logger.error(`[execute] Agent execution failed: ${error}`);
      this.registry.recordExecution(selectedAgentId, false);

      yield {
        type: "error",
        error:
          error instanceof Error ? error.message : "Agent execution failed",
      };
    }
  }

  /**
   * 选择适合的 Agent
   * 基于输入内容自动选择
   */
  private async selectAgent(input: AgentInput): Promise<AgentId | null> {
    const prompt = input.prompt?.toLowerCase() || "";

    // 简单的关键词匹配
    if (
      prompt.includes("ppt") ||
      prompt.includes("演示") ||
      prompt.includes("幻灯片") ||
      prompt.includes("slides")
    ) {
      return "slides";
    }

    if (
      prompt.includes("文档") ||
      prompt.includes("报告") ||
      prompt.includes("doc") ||
      prompt.includes("word")
    ) {
      return "docs";
    }

    if (
      prompt.includes("设计") ||
      prompt.includes("海报") ||
      prompt.includes("logo") ||
      prompt.includes("banner")
    ) {
      return "designer";
    }

    if (
      prompt.includes("代码") ||
      prompt.includes("程序") ||
      prompt.includes("code") ||
      prompt.includes("编程")
    ) {
      return "developer";
    }

    if (
      prompt.includes("研究") ||
      prompt.includes("调研") ||
      prompt.includes("分析") ||
      prompt.includes("research")
    ) {
      return "researcher";
    }

    // 默认使用 docs agent
    const agents = this.registry.getAllIds();
    return agents.length > 0 ? agents[0] : null;
  }

  /**
   * 获取状态报告
   */
  getStatusReport(): AgentStatusReport[] {
    const stats = this.registry.getStats();
    const agents = this.registry.getAll();

    return agents.map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      available: true,
      executions: stats.byId[agent.id]?.executions || 0,
      errors: stats.byId[agent.id]?.errors || 0,
    }));
  }
}
