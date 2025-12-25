import { JSONSchema7 } from "json-schema";

/**
 * 能力执行模式
 */
export enum CapabilityMode {
  SYNC = "sync",
  ASYNC = "async",
  STREAMING = "streaming",
}

/**
 * 能力分类
 */
export enum CapabilityCategory {
  RESEARCH = "research",
  GENERATION = "generation",
  COLLABORATION = "collaboration",
  VISUAL = "visual",
  ORCHESTRATION = "orchestration",
}

/**
 * 能力元数据
 */
export interface CapabilityMetadata {
  id: string;
  name: string;
  description: string;
  category: CapabilityCategory;
  provider: string;
  mode: CapabilityMode;
  inputSchema: JSONSchema7;
  outputSchema: JSONSchema7;
  tags: string[];
  version: string;
  enabled: boolean;
}

/**
 * 执行上下文
 */
export interface CapabilityContext {
  userId: string;
  requestId: string;
  traceId?: string;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 执行结果
 */
export interface CapabilityResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    duration: number;
    tokensUsed?: number;
  };
}

/**
 * 流式事件
 */
export interface CapabilityEvent<T = unknown> {
  type: "progress" | "data" | "complete" | "error";
  progress?: number;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 能力接口
 */
export interface ICapability<TInput = unknown, TOutput = unknown> {
  getMetadata(): CapabilityMetadata;
  execute(
    input: TInput,
    context: CapabilityContext,
  ): Promise<CapabilityResult<TOutput>>;
  executeStream?(
    input: TInput,
    context: CapabilityContext,
  ): AsyncGenerator<CapabilityEvent<TOutput>>;
  validateInput?(input: TInput): { valid: boolean; errors?: string[] };
}

/**
 * 能力提供者装饰器标记
 */
export const CAPABILITY_METADATA_KEY = "capability:metadata";
