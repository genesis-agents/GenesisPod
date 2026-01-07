/**
 * 应用配置
 * 统一管理环境变量和配置
 */

// Railway 生产环境后端 URL (仅用于服务端调用)
const RAILWAY_BACKEND_URL = 'https://deepdive-engine-backend.up.railway.app';

// 检测是否在浏览器环境
const isBrowser = () => typeof window !== 'undefined';

// 检测是否在 Railway 生产环境（通过检查当前域名）
const isRailwayProduction = () => {
  if (isBrowser()) {
    return window.location.hostname.includes('railway.app');
  }
  return process.env.RAILWAY_ENVIRONMENT === 'production';
};

// 获取正确的 API 基础 URL
// 浏览器环境使用相对路径，通过 Next.js rewrites 代理到后端，避免 CORS 问题
const getApiBaseUrl = () => {
  // 浏览器环境：使用相对路径，Next.js rewrites 会代理到后端
  if (isBrowser()) {
    return ''; // 相对路径，如 /api/v1/...
  }

  // 服务端环境：直接调用后端 URL
  // 1. 优先使用环境变量
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // 2. Railway 生产环境使用硬编码的后端 URL
  if (isRailwayProduction()) {
    return RAILWAY_BACKEND_URL;
  }
  // 3. 开发环境默认 localhost
  return 'http://localhost:4000';
};

export const config = {
  /**
   * API基础URL
   * 从环境变量读取，Railway 生产环境使用后端 URL，开发环境默认localhost:4000
   */
  apiBaseUrl: getApiBaseUrl(),

  /**
   * API版本
   */
  apiVersion: process.env.NEXT_PUBLIC_API_VERSION || 'v1',

  /**
   * 完整API URL前缀
   */
  get apiUrl() {
    return `${this.apiBaseUrl}/api/${this.apiVersion}`;
  },

  /**
   * Workspace AI v2 开启状态
   */
  get workspaceAiV2Enabled() {
    const value =
      process.env.NEXT_PUBLIC_WORKSPACE_AI_V2_ENABLED ??
      process.env.WORKSPACE_AI_V2_ENABLED ??
      'false';
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  },

  /**
   * 环境标识
   */
  env: process.env.NEXT_PUBLIC_ENV || process.env.NODE_ENV || 'development',

  /**
   * 是否开发环境
   */
  get isDevelopment() {
    return this.env === 'development';
  },

  /**
   * 是否生产环境
   */
  get isProduction() {
    return this.env === 'production';
  },

  /**
   * Git commit hash (构建时注入)
   */
  gitCommitHash: process.env.NEXT_PUBLIC_GIT_COMMIT_HASH || 'dev',

  /**
   * Git commit hash 完整版 (构建时注入)
   */
  gitCommitHashFull: process.env.NEXT_PUBLIC_GIT_COMMIT_HASH_FULL || 'dev',

  /**
   * 构建时间 (构建时注入)
   */
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString(),
} as const;
