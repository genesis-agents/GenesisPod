/**
 * Agent 注册中心
 * 管理所有已注册的 Agent
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { IAgent } from "./agent.interface";
import { AgentType, AgentConfig, AGENT_CONFIGS } from "./agent.types";

/**
 * Agent 注册中心
 * 单例模式，管理所有 Agent 的注册和获取
 */
@Injectable()
export class AgentRegistry implements OnModuleInit {
  private readonly logger = new Logger(AgentRegistry.name);
  private readonly agents = new Map<AgentType, IAgent>();

  onModuleInit() {
    this.logger.log("Agent Registry initialized");
  }

  /**
   * 注册 Agent
   *
   * @param agent Agent 实例
   */
  register(agent: IAgent): void {
    if (this.agents.has(agent.type)) {
      this.logger.warn(`Agent ${agent.type} already registered, overwriting`);
    }
    this.agents.set(agent.type, agent);
    this.logger.log(`Agent ${agent.type} registered: ${agent.name}`);
  }

  /**
   * 获取 Agent
   *
   * @param type Agent 类型
   * @returns Agent 实例
   * @throws Error 如果 Agent 未注册
   */
  get(type: AgentType): IAgent {
    const agent = this.agents.get(type);
    if (!agent) {
      throw new Error(`Agent ${type} not registered`);
    }
    return agent;
  }

  /**
   * 获取 Agent（可选）
   *
   * @param type Agent 类型
   * @returns Agent 实例或 undefined
   */
  getOptional(type: AgentType): IAgent | undefined {
    return this.agents.get(type);
  }

  /**
   * 检查 Agent 是否已注册
   *
   * @param type Agent 类型
   * @returns 是否已注册
   */
  has(type: AgentType): boolean {
    return this.agents.has(type);
  }

  /**
   * 获取所有已注册的 Agent
   *
   * @returns Agent 列表
   */
  getAll(): IAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * 获取所有已注册的 Agent 类型
   *
   * @returns Agent 类型列表
   */
  getRegisteredTypes(): AgentType[] {
    return Array.from(this.agents.keys());
  }

  /**
   * 获取所有 Agent 配置（包括未注册的）
   *
   * @returns Agent 配置列表
   */
  getAllConfigs(): AgentConfig[] {
    return Object.values(AGENT_CONFIGS).map((config) => {
      const agent = this.agents.get(config.type);
      if (agent) {
        // 如果 Agent 已注册，使用其实际配置
        return agent.getConfig();
      }
      // 否则返回默认配置
      return config;
    });
  }

  /**
   * 注销 Agent
   *
   * @param type Agent 类型
   * @returns 是否成功注销
   */
  unregister(type: AgentType): boolean {
    const result = this.agents.delete(type);
    if (result) {
      this.logger.log(`Agent ${type} unregistered`);
    }
    return result;
  }

  /**
   * 清空所有 Agent
   */
  clear(): void {
    this.agents.clear();
    this.logger.log("All agents cleared");
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; registered: AgentType[] } {
    return {
      total: this.agents.size,
      registered: this.getRegisteredTypes(),
    };
  }
}
