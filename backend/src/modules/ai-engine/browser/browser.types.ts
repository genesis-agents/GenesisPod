/**
 * Browser Types
 * AI Engine 核心能力 - 通用浏览器管理类型定义
 */

export interface SessionData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
}

export interface BrowserPageOptions {
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  timezoneId?: string;
}
