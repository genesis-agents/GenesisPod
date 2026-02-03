/**
 * 应用全局配置
 * ★ 统一管理品牌名称、URL 等配置，避免硬编码
 */

// ==================== 核心品牌配置（唯一定义处）====================
const BRAND_NAME = "Raven";
const BRAND_FULL_NAME = "Raven AI Engine";
const RAILWAY_DOMAIN = "raven-ai-engine";

/**
 * 应用配置常量
 * 所有品牌名称、URL 等配置统一从这里获取
 */
export const APP_CONFIG = {
  // ==================== 品牌信息 ====================
  brand: {
    /** 品牌简称 */
    name: BRAND_NAME,
    /** 品牌全称 */
    fullName: BRAND_FULL_NAME,
    /** HTTP User-Agent */
    userAgent: `${BRAND_NAME}-AI-Engine/1.0`,
    /** Webhook User-Agent */
    webhookUserAgent: `${BRAND_NAME}-Webhook/1.0`,
    /** 默认邮件发送者 */
    emailFrom: `${BRAND_NAME} <noreply@${BRAND_NAME.toLowerCase()}.ai>`,
    /** 站点名称 */
    siteName: BRAND_NAME,
  },

  // ==================== Railway 域名配置 ====================
  railway: {
    /** Railway 域名前缀 */
    domain: RAILWAY_DOMAIN,
    /** 前端 Railway URL */
    get frontendUrl() {
      return `https://${RAILWAY_DOMAIN}.up.railway.app`;
    },
    /** 后端 Railway URL */
    get backendUrl() {
      return `https://${RAILWAY_DOMAIN}-backend.up.railway.app`;
    },
  },

  // ==================== 动态 URL（优先使用环境变量）====================
  urls: {
    /** 前端 URL */
    get frontend() {
      return process.env.FRONTEND_URL || APP_CONFIG.railway.frontendUrl;
    },
    /** 后端 URL */
    get backend() {
      return (
        process.env.BACKEND_URL ||
        process.env.RAILWAY_PUBLIC_DOMAIN ||
        "http://localhost:4000"
      );
    },
  },

  // ==================== GitHub 配置 ====================
  github: {
    /** 默认 GitHub 仓库所有者 */
    owner: process.env.GITHUB_OWNER || "JUNJIE-DUAN",
    /** 默认 GitHub 仓库名称 */
    repo: process.env.GITHUB_REPO || "raven-ai-engine",
  },

  // ==================== 辅助方法 ====================
  /**
   * 获取完整 API URL
   */
  getApiUrl(path: string): string {
    return `${APP_CONFIG.urls.backend}/api/v1${path}`;
  },

  /**
   * 检查是否在 Railway 环境
   */
  isRailway(): boolean {
    return !!process.env.RAILWAY_ENVIRONMENT;
  },
} as const;

// 导出便捷常量
export const BRAND = APP_CONFIG.brand;
export const URLS = APP_CONFIG.urls;
