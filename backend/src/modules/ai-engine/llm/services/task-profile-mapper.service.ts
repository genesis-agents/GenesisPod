import { Injectable, Logger } from "@nestjs/common";
import {
  TaskProfile,
  CreativityLevel,
  OutputLengthLevel,
  CREATIVITY_TO_TEMPERATURE,
  OUTPUT_LENGTH_TO_TOKENS,
  REASONING_MODEL_MIN_TOKENS,
  JSON_OUTPUT_MAX_TEMPERATURE,
} from "../types";
import { AIModelConfig } from "./ai-chat.service";

/**
 * TaskProfile 参数映射结果
 */
export interface MappedParameters {
  temperature: number;
  maxTokens: number;
}

/**
 * TaskProfileMapperService - 将语义化任务配置映射为模型参数
 *
 * 职责：
 * - 将 TaskProfile 的语义化描述映射为具体的模型参数
 * - 根据模型特性（如推理模型）自动调整参数
 * - 处理输出格式对参数的影响
 *
 * 这是 AI Engine 中唯一了解模型参数细节的服务，
 * AI App 层不应直接操作 temperature/maxTokens
 */
@Injectable()
export class TaskProfileMapperService {
  private readonly logger = new Logger(TaskProfileMapperService.name);

  /**
   * 将 TaskProfile 映射为具体模型参数
   *
   * @param profile 任务配置
   * @param modelConfig 模型配置（用于获取 isReasoning、maxTokens 上限等）
   * @returns 映射后的参数
   */
  mapToParameters(
    profile: TaskProfile | undefined,
    modelConfig: AIModelConfig | null,
  ): MappedParameters {
    // 如果没有 profile，返回模型默认值或系统默认值
    if (!profile) {
      const defaultParams = {
        temperature: modelConfig?.temperature ?? 0.7,
        maxTokens: modelConfig?.maxTokens ?? 4096,
      };
      this.logger.debug(
        `[mapToParameters] No TaskProfile provided, using defaults: ` +
          `temp=${defaultParams.temperature}, maxTokens=${defaultParams.maxTokens}`,
      );
      return defaultParams;
    }

    // 1. 基础映射
    const baseTemperature = this.mapCreativityToTemperature(profile.creativity);
    const baseMaxTokens = this.mapOutputLengthToTokens(profile.outputLength);

    this.logger.debug(
      `[mapToParameters] Base mapping: ` +
        `creativity=${profile.creativity ?? "default"} → temp=${baseTemperature}, ` +
        `outputLength=${profile.outputLength ?? "default"} → tokens=${baseMaxTokens}`,
    );

    // 2. 推理模型调整
    // ★ 推理模型需要大量额外 tokens 用于内部 Chain of Thought
    // 实际输出可能只占 completion_tokens 的 10-20%
    const isReasoning = modelConfig?.isReasoning ?? false;
    let effectiveMaxTokens = baseMaxTokens;

    if (isReasoning) {
      const originalTokens = effectiveMaxTokens;

      // ★ 推理模型的基础最小值（25000）
      effectiveMaxTokens = Math.max(baseMaxTokens, REASONING_MODEL_MIN_TOKENS);

      // 对于 extended 输出，推理模型需要更多空间（32000+）
      if (profile.outputLength === "extended") {
        effectiveMaxTokens = Math.max(effectiveMaxTokens, 32000);
      } else if (profile.outputLength === "long") {
        // long 输出也需要更多（28000+）
        effectiveMaxTokens = Math.max(effectiveMaxTokens, 28000);
      }

      if (effectiveMaxTokens !== originalTokens) {
        this.logger.log(
          `[mapToParameters] ★ Reasoning model token boost: ` +
            `${originalTokens} → ${effectiveMaxTokens} tokens ` +
            `(outputLength=${profile.outputLength || "default"})`,
        );
      }
    }

    // 3. 处理模型配置的最大值
    const modelMaxTokens = modelConfig?.maxTokens;
    if (modelMaxTokens && effectiveMaxTokens > modelMaxTokens) {
      if (isReasoning) {
        // ★ 推理模型：检查是否需要降低到模型实际限制
        // 推理模型需要更多 tokens，但不能超过模型的实际最大值
        // 如果数据库配置的 maxTokens 太低，使用模型最大值并警告
        if (modelMaxTokens >= REASONING_MODEL_MIN_TOKENS) {
          // 模型支持足够的 tokens，使用模型最大值
          this.logger.debug(
            `[mapToParameters] Reasoning model: capping at model max: ` +
              `${effectiveMaxTokens} → ${modelMaxTokens}`,
          );
          effectiveMaxTokens = modelMaxTokens;
        } else {
          // 模型的 maxTokens 低于推理模型最小值
          // 使用模型最大值，但警告用户更新配置
          this.logger.warn(
            `[mapToParameters] ⚠️ Reasoning model config issue: ` +
              `Model max (${modelMaxTokens}) is below recommended minimum (${REASONING_MODEL_MIN_TOKENS}). ` +
              `Using model max to prevent API errors. ` +
              `Consider updating model config in database for better reasoning output.`,
          );
          effectiveMaxTokens = modelMaxTokens;
        }
      } else {
        // 非推理模型：正常限制
        this.logger.debug(
          `[mapToParameters] Capping tokens at model max: ` +
            `${effectiveMaxTokens} → ${modelMaxTokens}`,
        );
        effectiveMaxTokens = modelMaxTokens;
      }
    }

    // 4. JSON 格式需要更低 temperature（Phase 2 完整实现）
    let effectiveTemperature = baseTemperature;
    if (profile.outputFormat === "json") {
      const originalTemp = effectiveTemperature;
      effectiveTemperature = Math.min(
        effectiveTemperature,
        JSON_OUTPUT_MAX_TEMPERATURE,
      );
      if (effectiveTemperature !== originalTemp) {
        this.logger.debug(
          `[mapToParameters] JSON output format adjustment: ` +
            `temp ${originalTemp} → ${effectiveTemperature}`,
        );
      }
    }

    // 5. 记录最终结果
    this.logger.debug(
      `[mapToParameters] Final parameters: ` +
        `temp=${effectiveTemperature}, maxTokens=${effectiveMaxTokens} ` +
        `(profile: ${JSON.stringify(profile)}, isReasoning=${isReasoning})`,
    );

    return {
      temperature: effectiveTemperature,
      maxTokens: effectiveMaxTokens,
    };
  }

  /**
   * 将创意度等级映射为 temperature
   */
  private mapCreativityToTemperature(
    level: CreativityLevel | undefined,
  ): number {
    if (!level) {
      return 0.7; // 默认中等创意度
    }
    return CREATIVITY_TO_TEMPERATURE[level];
  }

  /**
   * 将输出长度等级映射为 maxTokens
   */
  private mapOutputLengthToTokens(
    level: OutputLengthLevel | undefined,
  ): number {
    if (!level) {
      return 4096; // 默认中等长度
    }
    return OUTPUT_LENGTH_TO_TOKENS[level];
  }
}
