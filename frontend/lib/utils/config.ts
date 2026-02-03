/**
 * 应用配置
 * ★ 统一管理环境变量、品牌名称、URL 等配置
 */

// ==================== 核心品牌配置（唯一定义处）====================
const BRAND_NAME = 'Raven';
const BRAND_FULL_NAME = 'Raven AI Engine';
const RAILWAY_DOMAIN = 'raven-ai-engine';

// ==================== Railway URL 配置 ====================
const RAILWAY_FRONTEND_URL = `https://${RAILWAY_DOMAIN}.up.railway.app`;
const RAILWAY_BACKEND_URL = `https://${RAILWAY_DOMAIN}-backend.up.railway.app`;

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
  // ==================== 品牌信息 ====================
  brand: {
    /** 品牌简称 */
    name: BRAND_NAME,
    /** 品牌全称 */
    fullName: BRAND_FULL_NAME,
    /** HTTP User-Agent */
    userAgent: `${BRAND_NAME}-AI-Engine/1.0`,
  },

  // ==================== Railway URL 配置 ====================
  railway: {
    /** Railway 域名前缀 */
    domain: RAILWAY_DOMAIN,
    /** 前端 Railway URL */
    frontendUrl: RAILWAY_FRONTEND_URL,
    /** 后端 Railway URL */
    backendUrl: RAILWAY_BACKEND_URL,
  },

  // ==================== API 配置 ====================
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
   * 获取后端 API URL（用于服务端调用）
   * 优先使用环境变量，否则使用 Railway 默认值
   */
  getBackendUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || RAILWAY_BACKEND_URL;
  },

  /**
   * 获取完整 API 路径
   */
  getApiPath(path: string): string {
    return `${this.getBackendUrl()}/api/v1${path}`;
  },

  // ==================== 环境配置 ====================
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
   * 是否 Railway 环境
   */
  get isRailway() {
    return isRailwayProduction();
  },

  // ==================== 构建信息 ====================
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

// 导出便捷常量
export const BRAND = config.brand;
export const RAILWAY_URLS = config.railway;
