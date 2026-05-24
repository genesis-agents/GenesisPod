/**
 * AI Chat Model Config Service —— v3.1 A0 阶段 thin wrapper
 *
 * @deprecated v3.1 A0：本 service 已弃用。所有消费方应改用
 * {@link AiModelConfigService}（`./ai-model-config.service`），后者是 BYOK +
 * structured-output capability + ApiKey 解析的单一权威源（canonical）。
 *
 * 本类临时保留为薄包装：所有 public 方法委托给注入的 `AiModelConfigService`，
 * 自身不再维护独立的 `modelConfigCache` 与缓存刷新逻辑——**双缓存/双源行为
 * 已被消除**，只保留 API surface 兼容供历史 import 点继续编译通过。
 *
 * 计划：v3.1 F 阶段（消费方全部迁移完毕后）整文件删除，同步删除
 * `services/index.ts` 中的 `AiChatModelConfigService` re-export。
 *
 * 迁移指引：
 *   - 旧：`constructor(private readonly cfg: AiChatModelConfigService) {}`
 *   - 新：`constructor(private readonly cfg: AiModelConfigService) {}`
 *   方法名/签名保持一致，无需改调用处。
 */

import { Injectable } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import {
  AiModelConfigService,
  type AIModelConfig,
} from "./ai-model-config.service";

// v3.1 A0：interface 单一源已迁至 types/model-config.types.ts；本文件 re-export
// 保持下游 `import { AIModelConfig } from ".../ai-chat-model-config.service"`
// 仍可编译。新代码请直接从 `./ai-model-config.service` 或 `../types` 引用。
export type { AIModelConfig };

/**
 * @deprecated v3.1 A0：请用 {@link AiModelConfigService}。
 */
@Injectable()
export class AiChatModelConfigService {
  constructor(private readonly delegate: AiModelConfigService) {}

  /**
   * 获取模型的 API Key（系统 Secret 路径，无用户上下文）。
   */
  async getApiKeyForModel(model: AIModelConfig): Promise<string | null> {
    return this.delegate.getApiKeyForModel(model);
  }

  /**
   * 根据 provider 推断 API 格式。
   * 委托给 canonical service 的 public 同义方法 getApiFormatForProvider。
   */
  inferApiFormat(provider: string): string {
    return this.delegate.getApiFormatForProvider(provider);
  }

  /**
   * 刷新模型配置缓存（委托给 canonical service 的单缓存）。
   */
  async refreshModelConfigCache(): Promise<void> {
    return this.delegate.refreshModelConfigCache();
  }

  /**
   * 检查模型是否为推理模型。
   */
  isReasoningModel(modelId: string): boolean {
    return this.delegate.isReasoningModel(modelId);
  }

  /**
   * 获取模型配置（优先从数据库，缓存 5 分钟）。
   */
  async getModelConfig(modelId: string): Promise<AIModelConfig | null> {
    return this.delegate.getModelConfig(modelId);
  }

  /**
   * 获取默认模型配置。
   */
  async getDefaultModelConfig(): Promise<AIModelConfig | null> {
    return this.delegate.getDefaultModelConfig();
  }

  /**
   * 根据模型类型获取默认模型。
   */
  async getDefaultModelByType(
    modelType: AIModelType,
  ): Promise<AIModelConfig | null> {
    return this.delegate.getDefaultModelByType(modelType);
  }

  /**
   * 获取所有启用的模型（按类型）。
   */
  async getAllEnabledModelsByType(
    modelType: AIModelType,
    excludeModelIds: string[] = [],
  ): Promise<AIModelConfig[]> {
    return this.delegate.getAllEnabledModelsByType(modelType, excludeModelIds);
  }

  /**
   * 检查 Temperature 参数是否支持（同步）。
   * 委托给 canonical service 的同步 cache 读取实现。
   */
  isTemperatureSupported(model: string): boolean {
    return this.delegate.isTemperatureSupported(model);
  }
}
