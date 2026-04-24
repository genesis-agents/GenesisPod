/**
 * Model Utility Functions
 *
 * 纯函数工具集，用于模型属性推断和已知限制查询
 * 共享于 AiModelConfigService 和 TaskProfileMapperService
 */

import { MODEL_KNOWN_LIMITS } from "./task-profile";

/**
 * 根据模型名称推断是否为推理模型
 * 当数据库中没有 isReasoning 字段时使用
 */
export function inferIsReasoning(modelId: string): boolean {
  if (!modelId) return false;
  const modelLower = modelId.toLowerCase();
  return (
    // OpenAI reasoning models (o1/o3/o4 families + gpt-5)
    modelLower.includes("o1") ||
    modelLower.includes("o3") ||
    modelLower.includes("o4") ||
    modelLower.includes("gpt-5") ||
    modelLower.includes("gpt5") ||
    // Google/Gemini reasoning models
    modelLower.includes("gemini-2.0-flash-thinking") ||
    modelLower.includes("gemini-2.5") || // gemini-2.5-pro / gemini-2.5-flash (thinking)
    modelLower.includes("gemini-3") || // gemini-3-pro-preview, etc.
    modelLower.includes("gemini-exp") ||
    // DeepSeek reasoning models
    modelLower.includes("deepseek-r1") ||
    modelLower.includes("deepseek-reasoner") ||
    // Anthropic reasoning models
    modelLower.includes("claude-3.5-opus") ||
    modelLower.includes("claude-4") ||
    // Generic reasoning keyword (exclude "non-reasoning" variants)
    (modelLower.includes("reasoning") &&
      !modelLower.includes("non-reasoning")) ||
    modelLower.includes("thinking")
  );
}

/**
 * 查询已知模型的实际最大 output tokens 限制
 * 使用有序前缀匹配（如 gpt-4o-mini 在 gpt-4o 之前）
 *
 * @returns 已知限制值，或 null（未知模型）
 */
export function getKnownModelLimit(modelId: string): number | null {
  if (!modelId) return null;
  const lower = modelId.toLowerCase();
  for (const [prefix, limit] of MODEL_KNOWN_LIMITS) {
    if (lower.startsWith(prefix)) return limit;
  }
  return null;
}
