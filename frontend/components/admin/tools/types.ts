/**
 * Shared types for AI Tools management
 *
 * 集中定义工具管理相关的共享类型，避免循环依赖和重复定义
 */

/**
 * 内置工具定义
 */
export interface BuiltinTool {
  id: string;
  name: string;
  displayName?: string;
  category: string;
  enabled: boolean;
  implemented: boolean;
  description?: string;
}

/**
 * 外部工具状态
 */
export interface ExternalTool {
  id: string;
  name: string;
  category: string;
  url: string;
  hasApiKey: boolean;
  status: 'configured' | 'not_configured' | 'error';
  noKeyRequired?: boolean;
  freeQuota?: string;
  pricing?: string;
  secretKey?: string | null;
}

/**
 * 外部工具状态（简化版，用于能力视图）
 */
export interface ExternalToolStatus {
  id: string;
  hasApiKey: boolean;
  status: 'configured' | 'not_configured' | 'error';
  secretKey?: string | null;
}

/**
 * Provider 状态
 */
export interface ProviderStatus {
  id: string;
  configured: boolean;
  hasApiKey: boolean;
  secretKey?: string | null;
  isActive?: boolean;
  enabled?: boolean; // 用于 independentProviders 模式
}
