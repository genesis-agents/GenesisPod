/**
 * AI Engine - Agent Registry
 * Agent 注册表实现
 */

import { Injectable } from '@nestjs/common';
import { BaseRegistry, IRegistry, RegistryStats } from '../../core/interfaces';
import { ExecutionMode } from '../../core';
import {
  IAgent,
  AgentDefinition,
  AgentCapability,
} from '../abstractions/agent.interface';

/**
 * Agent 注册表
 */
@Injectable()
export class AgentRegistry extends BaseRegistry<IAgent> implements IRegistry<IAgent> {
  private readonly byMode = new Map<string, Set<string>>();
  private readonly byCapability = new Map<string, Set<string>>();
  private readonly factories = new Map<string, () => IAgent>();

  /**
   * 注册 Agent
   */
  override register(agent: IAgent): void {
    super.register(agent);

    // 索引执行模式
    for (const mode of agent.supportedModes) {
      if (!this.byMode.has(mode)) {
        this.byMode.set(mode, new Set());
      }
      this.byMode.get(mode)!.add(agent.id);
    }

    // 索引能力
    for (const capability of agent.capabilities) {
      if (!this.byCapability.has(capability.id)) {
        this.byCapability.set(capability.id, new Set());
      }
      this.byCapability.get(capability.id)!.add(agent.id);
    }
  }

  /**
   * 注册 Agent 定义
   */
  registerDefinition<TInput, TOutput>(
    definition: AgentDefinition<TInput, TOutput>,
  ): void {
    if (definition.factory) {
      this.factories.set(definition.id, definition.factory as () => IAgent);
    }
  }

  /**
   * 注销 Agent
   */
  override unregister(id: string): boolean {
    const agent = this.tryGet(id);
    if (!agent) {
      return false;
    }

    // 清理模式索引
    for (const mode of agent.supportedModes) {
      this.byMode.get(mode)?.delete(id);
    }

    // 清理能力索引
    for (const capability of agent.capabilities) {
      this.byCapability.get(capability.id)?.delete(id);
    }

    return super.unregister(id);
  }

  /**
   * 按执行模式获取 Agent
   */
  getByMode(mode: ExecutionMode): IAgent[] {
    const ids = this.byMode.get(mode);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.tryGet(id))
      .filter((a): a is IAgent => a !== undefined);
  }

  /**
   * 按能力获取 Agent
   */
  getByCapability(capabilityId: string): IAgent[] {
    const ids = this.byCapability.get(capabilityId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.tryGet(id))
      .filter((a): a is IAgent => a !== undefined);
  }

  /**
   * 获取支持特定能力集的 Agent
   */
  getByCapabilities(capabilityIds: string[]): IAgent[] {
    const agents = this.getAll();
    return agents.filter((agent) => {
      const agentCapabilityIds = agent.capabilities.map((c) => c.id);
      return capabilityIds.every((id) => agentCapabilityIds.includes(id));
    });
  }

  /**
   * 获取所有支持的执行模式
   */
  getModes(): ExecutionMode[] {
    return Array.from(this.byMode.keys()) as ExecutionMode[];
  }

  /**
   * 获取所有能力
   */
  getCapabilities(): AgentCapability[] {
    const capabilities: AgentCapability[] = [];
    const seen = new Set<string>();

    for (const agent of this.getAll()) {
      for (const capability of agent.capabilities) {
        if (!seen.has(capability.id)) {
          capabilities.push(capability);
          seen.add(capability.id);
        }
      }
    }

    return capabilities;
  }

  /**
   * 获取统计信息
   */
  override getStats(): AgentRegistryStats {
    const baseStats = super.getStats();
    const byMode: Record<string, number> = {};
    const byCapability: Record<string, number> = {};

    for (const [mode, ids] of this.byMode.entries()) {
      byMode[mode] = ids.size;
    }
    for (const [cap, ids] of this.byCapability.entries()) {
      byCapability[cap] = ids.size;
    }

    return {
      ...baseStats,
      byMode,
      byCapability,
    };
  }

  /**
   * 搜索 Agent
   */
  search(query: AgentSearchQuery): IAgent[] {
    let results = this.getAll();

    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      results = results.filter(
        (agent) =>
          agent.id.toLowerCase().includes(keyword) ||
          agent.name.toLowerCase().includes(keyword) ||
          agent.description.toLowerCase().includes(keyword),
      );
    }

    if (query.mode) {
      results = results.filter((agent) =>
        agent.supportedModes.includes(query.mode!),
      );
    }

    if (query.capabilities && query.capabilities.length > 0) {
      results = results.filter((agent) => {
        const agentCapabilityIds = agent.capabilities.map((c) => c.id);
        return query.capabilities!.some((id) => agentCapabilityIds.includes(id));
      });
    }

    if (query.requiredTools && query.requiredTools.length > 0) {
      results = results.filter((agent) => {
        if (!agent.requiredTools) return false;
        return query.requiredTools!.every((tool) =>
          agent.requiredTools!.includes(tool),
        );
      });
    }

    return results;
  }

  /**
   * 根据意图路由到合适的 Agent
   */
  routeByIntent(intent: string, _context?: Record<string, unknown>): IAgent | null {
    // 简单的基于关键词的路由
    // 实际使用中应该使用更复杂的意图分类
    const keyword = intent.toLowerCase();
    const agents = this.getAll();

    // 优先匹配 ID
    const exactMatch = agents.find((a) => a.id === keyword);
    if (exactMatch) return exactMatch;

    // 匹配名称或描述
    const partialMatch = agents.find(
      (a) =>
        a.name.toLowerCase().includes(keyword) ||
        a.description.toLowerCase().includes(keyword),
    );

    return partialMatch || null;
  }
}

/**
 * Agent 注册表统计
 */
export interface AgentRegistryStats extends RegistryStats {
  byMode: Record<string, number>;
  byCapability: Record<string, number>;
}

/**
 * Agent 搜索查询
 */
export interface AgentSearchQuery {
  keyword?: string;
  mode?: ExecutionMode;
  capabilities?: string[];
  requiredTools?: string[];
}
