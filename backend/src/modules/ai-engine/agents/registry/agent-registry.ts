/**
 * AI Engine - Agent Registry
 * Agent 注册中心
 */

import { Injectable, Logger } from "@nestjs/common";
import { AgentId, AgentConfig } from "../../core/types/agent.types";
import { IPlanBasedAgent } from "../base/plan-based-agent";

/**
 * Agent 注册表统计信息
 */
export interface AgentRegistryStats {
  total: number;
  byId: Record<string, { executions: number; errors: number }>;
}

/**
 * Agent 注册中心
 * 管理所有已注册的 Agent 实例
 */
@Injectable()
export class AgentRegistry {
  private readonly logger = new Logger(AgentRegistry.name);
  private readonly agents = new Map<AgentId, IPlanBasedAgent>();
  private readonly stats: AgentRegistryStats = {
    total: 0,
    byId: {},
  };

  /**
   * 注册 Agent
   */
  register(agent: IPlanBasedAgent): void {
    // 如果已经注册，静默跳过（正常情况，无需告警）
    if (this.agents.has(agent.id)) {
      return;
    }

    this.agents.set(agent.id, agent);
    this.stats.total = this.agents.size;
    this.stats.byId[agent.id] = { executions: 0, errors: 0 };

    this.logger.log(`Agent registered: ${agent.id} (${agent.name})`);
  }

  /**
   * 检查是否已注册
   */
  has(agentId: AgentId): boolean {
    return this.agents.has(agentId);
  }

  /**
   * 获取 Agent
   */
  get(agentId: AgentId): IPlanBasedAgent {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return agent;
  }

  /**
   * 尝试获取 Agent（不抛出异常）
   */
  tryGet(agentId: AgentId): IPlanBasedAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取已注册的 Agent 数量
   */
  size(): number {
    return this.agents.size;
  }

  /**
   * 获取所有已注册的 Agent
   */
  getAll(): IPlanBasedAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * 获取所有 Agent ID
   */
  getAllIds(): AgentId[] {
    return Array.from(this.agents.keys());
  }

  /**
   * 获取所有 Agent 配置
   */
  getAllConfigs(): AgentConfig[] {
    return this.getAll().map((agent) => agent.getConfig());
  }

  /**
   * 获取 Agent 配置
   */
  getConfig(agentId: AgentId): AgentConfig | undefined {
    const agent = this.agents.get(agentId);
    return agent?.getConfig();
  }

  /**
   * 获取统计信息
   */
  getStats(): AgentRegistryStats {
    return { ...this.stats };
  }

  /**
   * 记录执行
   */
  recordExecution(agentId: AgentId, success: boolean): void {
    if (this.stats.byId[agentId]) {
      this.stats.byId[agentId].executions++;
      if (!success) {
        this.stats.byId[agentId].errors++;
      }
    }
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.agents.clear();
    this.stats.total = 0;
    this.stats.byId = {};
  }
}
