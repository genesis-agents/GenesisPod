/**
 * AI Engine LLM Types
 *
 * 导出所有 LLM 相关的类型定义
 */

export {
  // 核心类型
  TaskProfile,
  CreativityLevel,
  OutputLengthLevel,
  TaskType,
  OutputFormat,
  // 映射常量
  CREATIVITY_TO_TEMPERATURE,
  OUTPUT_LENGTH_TO_TOKENS,
  REASONING_MODEL_MIN_TOKENS,
  JSON_OUTPUT_MAX_TEMPERATURE,
  MODEL_KNOWN_LIMITS,
} from "./task-profile";

export { inferIsReasoning, getKnownModelLimit } from "./model-utils";
