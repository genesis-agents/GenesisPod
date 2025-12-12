/**
 * AI Orchestration 配置
 *
 * 将所有硬编码的配置提取到此文件，支持：
 * 1. 环境变量覆盖
 * 2. 运行时热更新
 * 3. 类型安全
 */

import { registerAs } from "@nestjs/config";

/**
 * 模型成本排名配置
 */
export interface ModelRankingConfig {
  cost: Record<string, number>;
  quality: Record<string, number>;
  speed: Record<string, number>;
}

/**
 * Provider 默认端点配置
 */
export interface ProviderEndpointsConfig {
  openai: {
    chat: string;
    image: string;
  };
  anthropic: {
    messages: string;
  };
  google: {
    gemini: string;
    imagen: string;
  };
  xai: {
    chat: string;
  };
}

/**
 * 健康检查配置
 */
export interface HealthCheckConfig {
  failureThreshold: number; // 失败次数阈值
  recoveryWindowMs: number; // 恢复窗口（毫秒）
}

/**
 * Trace 配置
 */
export interface TraceConfig {
  maxSize: number;
  cleanupBatchSize: number;
  maxAgeMs: number;
  cleanupIntervalMs: number;
}

/**
 * 请求超时配置
 */
export interface TimeoutConfig {
  text: number;
  image: number;
  multimodal: number;
}

/**
 * 完整的 AI Orchestration 配置
 */
export interface AiOrchestrationConfig {
  modelRanking: ModelRankingConfig;
  providerEndpoints: ProviderEndpointsConfig;
  healthCheck: HealthCheckConfig;
  trace: TraceConfig;
  timeout: TimeoutConfig;
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: AiOrchestrationConfig = {
  modelRanking: {
    // 成本排序：数字越小越便宜
    cost: {
      "gemini-flash": 1,
      "gemini-2.0-flash": 1,
      "gpt-3.5": 2,
      "claude-haiku": 2,
      "gpt-4-turbo": 3,
      "gpt-4o": 3,
      "claude-sonnet": 4,
      grok: 4,
      "gpt-4": 5,
      "claude-opus": 6,
    },
    // 质量排序：数字越小质量越高
    quality: {
      "claude-opus": 1,
      "gpt-4": 2,
      "claude-sonnet": 3,
      grok: 3,
      "gpt-4o": 4,
      "gpt-4-turbo": 4,
      "claude-haiku": 5,
      "gpt-3.5": 6,
      "gemini-flash": 7,
    },
    // 速度排序：数字越小越快
    speed: {
      "gemini-flash": 1,
      "gemini-2.0-flash": 1,
      "claude-haiku": 2,
      "gpt-3.5": 2,
      "gpt-4o": 3,
      "gpt-4-turbo": 4,
      "claude-sonnet": 5,
      grok: 5,
      "gpt-4": 6,
      "claude-opus": 7,
    },
  },

  providerEndpoints: {
    openai: {
      chat: "https://api.openai.com/v1/chat/completions",
      image: "https://api.openai.com/v1/images/generations",
    },
    anthropic: {
      messages: "https://api.anthropic.com/v1/messages",
    },
    google: {
      gemini: "https://generativelanguage.googleapis.com/v1beta/models",
      imagen: "https://generativelanguage.googleapis.com/v1beta/models",
    },
    xai: {
      chat: "https://api.x.ai/v1/chat/completions",
    },
  },

  healthCheck: {
    failureThreshold: 3, // 连续失败 3 次标记为不健康
    recoveryWindowMs: 5 * 60 * 1000, // 5 分钟恢复窗口
  },

  trace: {
    maxSize: 1000,
    cleanupBatchSize: 100,
    maxAgeMs: 30 * 60 * 1000, // 30 分钟
    cleanupIntervalMs: 5 * 60 * 1000, // 5 分钟
  },

  timeout: {
    text: 120000, // 2 分钟
    image: 180000, // 3 分钟
    multimodal: 180000, // 3 分钟
  },
};

/**
 * NestJS Config 注册
 */
export const aiOrchestrationConfig = registerAs(
  "aiOrchestration",
  (): AiOrchestrationConfig => {
    // 可以从环境变量覆盖
    const config = { ...DEFAULT_CONFIG };

    // 覆盖超时配置
    if (process.env.AI_TEXT_TIMEOUT_MS) {
      config.timeout.text = parseInt(process.env.AI_TEXT_TIMEOUT_MS, 10);
    }
    if (process.env.AI_IMAGE_TIMEOUT_MS) {
      config.timeout.image = parseInt(process.env.AI_IMAGE_TIMEOUT_MS, 10);
    }

    // 覆盖 trace 配置
    if (process.env.AI_TRACE_MAX_SIZE) {
      config.trace.maxSize = parseInt(process.env.AI_TRACE_MAX_SIZE, 10);
    }
    if (process.env.AI_TRACE_MAX_AGE_MS) {
      config.trace.maxAgeMs = parseInt(process.env.AI_TRACE_MAX_AGE_MS, 10);
    }

    // 覆盖健康检查配置
    if (process.env.AI_HEALTH_FAILURE_THRESHOLD) {
      config.healthCheck.failureThreshold = parseInt(
        process.env.AI_HEALTH_FAILURE_THRESHOLD,
        10,
      );
    }

    return config;
  },
);

/**
 * 配置 Token (用于依赖注入)
 */
export const AI_ORCHESTRATION_CONFIG = Symbol("AI_ORCHESTRATION_CONFIG");
