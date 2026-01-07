/**
 * 应用配置
 * 统一管理环境变量和配置
 */

// Railway 生产环境后端 URL (仅用于服务端渲染时调用)
// 浏览器端请求通过 Next.js rewrites 代理，使用相对 URL
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
// 浏览器端使用相对 URL（利用 Next.js rewrites 代理，避免 CORS 问题）
// 服务端需要完整 URL
const getApiBaseUrl = () => {
  // 浏览器端：使用相对 URL，让 Next.js rewrites 代理请求到后端
  // 这样可以避免 CORS 问题，因为请求是发送到同源的 Next.js 服务器
  if (isBrowser()) {
    return ''; // 空字符串 + /api/v1 = 相对 URL /api/v1
  }

  // 服务端渲染时需要完整 URL
  // 1. 优先使用环境变量
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // 2. Railway 生产环境使用后端 URL
  if (isRailwayProduction()) {
    return RAILWAY_BACKEND_URL;
  }
  // 3. 开发环境默认 localhost
  return 'http://localhost:4000';
};

export const config = {
  /**
   * API版本
   */
  apiVersion: process.env.NEXT_PUBLIC_API_VERSION || 'v1',

  /**
   * API基础URL (getter，每次访问重新计算)
   * 浏览器端返回空字符串以使用相对URL，避免CORS问题
   * 服务端返回完整URL用于SSR
   */
  get apiBaseUrl() {
    return getApiBaseUrl();
  },

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
