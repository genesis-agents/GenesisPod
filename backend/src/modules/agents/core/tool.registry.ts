/**
 * Tool 注册中心
 * 管理所有已注册的工具
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ITool, ToolConfig, TOOL_CONFIGS } from "./tool.interface";
import { ToolType } from "./agent.types";

/**
 * Tool 注册中心
 * 单例模式，管理所有工具的注册和获取
 */
@Injectable()
export class ToolRegistry implements OnModuleInit {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly tools = new Map<ToolType, ITool>();

  onModuleInit() {
    this.logger.log("Tool Registry initialized");
  }

  /**
   * 注册工具
   *
   * @param tool 工具实例
   */
  register(tool: ITool): void {
    if (this.tools.has(tool.type)) {
      this.logger.warn(`Tool ${tool.type} already registered, overwriting`);
    }
    this.tools.set(tool.type, tool);
    this.logger.log(`Tool ${tool.type} registered: ${tool.name}`);
  }

  /**
   * 批量注册工具
   *
   * @param tools 工具实例列表
   */
  registerMany(tools: ITool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 获取工具
   *
   * @param type 工具类型
   * @returns 工具实例
   * @throws Error 如果工具未注册
   */
  get(type: ToolType): ITool {
    const tool = this.tools.get(type);
    if (!tool) {
      throw new Error(`Tool ${type} not registered`);
    }
    return tool;
  }

  /**
   * 获取工具（可选）
   *
   * @param type 工具类型
   * @returns 工具实例或 undefined
   */
  getOptional(type: ToolType): ITool | undefined {
    return this.tools.get(type);
  }

  /**
   * 检查工具是否已注册
   *
   * @param type 工具类型
   * @returns 是否已注册
   */
  has(type: ToolType): boolean {
    return this.tools.has(type);
  }

  /**
   * 获取所有已注册的工具
   *
   * @returns 工具列表
   */
  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取所有已注册的工具类型
   *
   * @returns 工具类型列表
   */
  getRegisteredTypes(): ToolType[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 按类别获取工具
   *
   * @param category 类别名称
   * @returns 该类别的工具列表
   */
  getByCategory(category: string): ITool[] {
    return this.getAll().filter((tool) => {
      const config = TOOL_CONFIGS[tool.type];
      return config?.category === category;
    });
  }

  /**
   * 获取所有工具配置（包括未注册的）
   *
   * @returns 工具配置列表
   */
  getAllConfigs(): ToolConfig[] {
    return Object.values(TOOL_CONFIGS).map((config) => {
      const tool = this.tools.get(config.type);
      if (tool) {
        // 如果工具已注册，使用其实际配置
        return {
          type: tool.type,
          name: tool.name,
          description: tool.description,
          icon: config.icon,
          category: config.category,
        };
      }
      // 否则返回默认配置
      return config;
    });
  }

  /**
   * 检查多个工具是否都已注册
   *
   * @param types 工具类型列表
   * @returns 是否都已注册
   */
  hasAll(types: ToolType[]): boolean {
    return types.every((type) => this.has(type));
  }

  /**
   * 获取多个工具
   *
   * @param types 工具类型列表
   * @returns 工具实例列表
   * @throws Error 如果任何工具未注册
   */
  getMany(types: ToolType[]): ITool[] {
    return types.map((type) => this.get(type));
  }

  /**
   * 注销工具
   *
   * @param type 工具类型
   * @returns 是否成功注销
   */
  unregister(type: ToolType): boolean {
    const result = this.tools.delete(type);
    if (result) {
      this.logger.log(`Tool ${type} unregistered`);
    }
    return result;
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    this.logger.log("All tools cleared");
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    registered: ToolType[];
    byCategory: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};
    for (const tool of this.tools.values()) {
      const config = TOOL_CONFIGS[tool.type];
      const category = config?.category || "unknown";
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    return {
      total: this.tools.size,
      registered: this.getRegisteredTypes(),
      byCategory,
    };
  }
}
