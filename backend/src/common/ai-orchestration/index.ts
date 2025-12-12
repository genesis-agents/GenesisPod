/**
 * AI Orchestration Module Exports
 */

// 模块
export * from "./ai-orchestration.module";

// 核心服务
export * from "./ai-orchestration.service";
export * from "./model-selector.service";
export * from "./fallback-manager.service";
export * from "./error-classifier";

// 类型
export * from "./types";

// 配置
export * from "./config";

// Provider 相关 - 选择性导出避免命名冲突
export {
  // 接口
  IAIProvider,
  ITextProvider,
  IImageProvider,
  TextGenerationOptions,
  TextGenerationResult,
  ImageGenerationOptions,
  ImageGenerationResult,
  GeneratedImage,
  AI_PROVIDER_TOKEN,
  TEXT_PROVIDER_TOKEN,
  IMAGE_PROVIDER_TOKEN,
  // 基类
  BaseProvider,
  BaseTextProvider,
  BaseImageProvider,
  // 具体 Provider
  OpenAITextProvider,
  DallEProvider,
  AnthropicProvider,
  GeminiProvider,
  ImagenProvider,
  XAIProvider,
  // 工厂
  AIProviderFactory,
} from "./providers";
