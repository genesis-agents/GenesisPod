/**
 * Policy Data Service
 * 工具共享服务 - 提供 API Key 获取（含多密钥轮转）和 HTTP 请求功能
 *
 * 多密钥支持：
 * - 密钥以逗号分隔存储在 Secret Manager 中（如 "key1,key2,key3"）
 * - Round-Robin 轮转分散并发请求
 * - 失败密钥自动冷却（429/5xx → 5分钟，400/401 → 24小时）
 * - 所有密钥耗尽时返回 null，由工具自行处理降级
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Prisma } from "@prisma/client";
import { getToolIdAliases } from "@/common/ai/tool-id-aliases";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SecretsService } from "@/modules/ai-infra/facade";
import { firstValueFrom } from "rxjs";
import { APP_CONFIG } from "@/common/config/app.config";
import * as crypto from "crypto";

// ============================================================================
// Multi-Key Health Tracking Types
// ============================================================================

/** API Key 健康状态（内部使用） */
interface KeyHealth {
  failedAt: number;
  errorCode: number;
}

/** API Key 健康状态（对外导出，供管理后台展示） */
export interface KeyHealthStatus {
  /** 密钥序号 (0-indexed) */
  index: number;
  /** 脱敏显示的密钥 (如 tvly-abcd****xyz) */
  maskedKey: string;
  /** 是否健康可用 */
  isHealthy: boolean;
  /** 最近错误描述 */
  lastError?: string;
  /** 冷却结束时间 (ISO 格式) */
  cooldownUntil?: string;
}

/** Key 冷却时间（毫秒）- 临时性错误（400/401/403/5xx）后多久重试 */
const KEY_COOLDOWN_MS = 5 * 60 * 1000; // 5 分钟

/** Key 长冷却时间（毫秒）- 配额耗尽（429 Too Many Requests）后长时间冷却 */
const KEY_QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 小时

/** 判断错误码是否为配额耗尽类（需要长冷却）— 只有 429 是真正的速率/配额限制 */
const isQuotaExhaustedError = (errorCode: number): boolean => errorCode === 429;

@Injectable()
export class PolicyDataService {
  private readonly logger = new Logger(PolicyDataService.name);

  /**
   * API Key 健康状态追踪
   * Key: SHA-256 hash of "toolId:apiKey" → Value: { failedAt, errorCode }
   * ★ 使用哈希避免 API Key 泄露到内存 Map 的 key 中
   */
  private keyHealthMap = new Map<string, KeyHealth>();

  /**
   * Round-Robin 索引追踪
   * Key: toolId → Value: next key index
   */
  private keyIndexMap = new Map<string, number>();

  /**
   * Host 级 429 冷却（防止 OpenAlex / arxiv 等无 key 的免费 API 反复打 429）
   * Key: hostname → Value: cooldownUntilMs (epoch ms)
   * 撞 429 → 90s 内同 host 直接 short-circuit，不再发请求。
   *   OpenAlex polite pool burst 限制是秒级，1 分钟内通常恢复；90s 留点余量。
   */
  private hostCooldownUntil = new Map<string, number>();
  private static readonly HOST_429_COOLDOWN_MS = 90 * 1000;

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
  ) {}

  // ============================================================================
  // Multi-Key Rotation Core
  // ============================================================================

  /**
   * 获取 Key 的哈希值（避免明文存储）
   */
  private getKeyHash(toolId: string, key: string): string {
    return crypto
      .createHash("sha256")
      .update(`${toolId}:${key}`)
      .digest("hex")
      .substring(0, 16);
  }

  /**
   * 获取 Key 的掩码显示（用于日志和管理后台）
   */
  getMaskedKeyForDisplay(key: string): string {
    if (!key || key.length < 10) {
      return "****";
    }
    const prefix = key.substring(0, 8);
    const suffix = key.substring(key.length - 3);
    return `${prefix}****${suffix}`;
  }

  /**
   * 从逗号分隔的密钥值中解析出多个密钥
   */
  private parseKeys(secretValue: string): string[] {
    return secretValue
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  /**
   * 获取健康的 API Key（Round-Robin + 冷却检查）
   *
   * ★ 使用 Round-Robin 分散并发请求到不同的 Key
   * ★ 使用哈希存储健康状态，避免 Key 泄露
   */
  private getHealthyKey(toolId: string, keys: string[]): string | null {
    const validKeys = keys.filter((k) => k && k.trim() !== "");
    if (validKeys.length === 0) return null;

    // 单个 key 直接返回（无需轮转逻辑）
    if (validKeys.length === 1) {
      const key = validKeys[0];
      const healthKey = this.getKeyHash(toolId, key);
      const health = this.keyHealthMap.get(healthKey);
      const cooldown =
        health && isQuotaExhaustedError(health.errorCode)
          ? KEY_QUOTA_COOLDOWN_MS
          : KEY_COOLDOWN_MS;
      if (!health || Date.now() - health.failedAt >= cooldown) {
        return key;
      }
      // 单 key 冷却中，跳过此数据源（避免无效重试）
      this.logger.warn(
        `[getHealthyKey] Single ${toolId} key in cooldown (${Math.ceil((cooldown - (Date.now() - health.failedAt)) / 1000)}s remaining), skipping`,
      );
      return null;
    }

    const now = Date.now();

    // Round-Robin: 获取并递增索引
    const startIndex = this.keyIndexMap.get(toolId) || 0;
    this.keyIndexMap.set(toolId, (startIndex + 1) % validKeys.length);

    // 从当前索引开始尝试所有 key
    for (let i = 0; i < validKeys.length; i++) {
      const index = (startIndex + i) % validKeys.length;
      const key = validKeys[index];
      const healthKey = this.getKeyHash(toolId, key);
      const health = this.keyHealthMap.get(healthKey);

      const cooldown =
        health && isQuotaExhaustedError(health.errorCode)
          ? KEY_QUOTA_COOLDOWN_MS
          : KEY_COOLDOWN_MS;
      if (!health || now - health.failedAt >= cooldown) {
        return key;
      }
    }

    // 所有 key 都在冷却期
    // 区分配额耗尽 vs 临时错误
    let allQuotaExhausted = true;
    let fallbackKey: string | null = null;
    let oldestFailedAt = Infinity;

    for (const key of validKeys) {
      const healthKey = this.getKeyHash(toolId, key);
      const health = this.keyHealthMap.get(healthKey);
      if (health) {
        if (!isQuotaExhaustedError(health.errorCode)) {
          allQuotaExhausted = false;
        }
        if (health.failedAt < oldestFailedAt) {
          oldestFailedAt = health.failedAt;
          fallbackKey = key;
        }
      }
    }

    if (allQuotaExhausted) {
      this.logger.warn(
        `[getHealthyKey] All ${toolId} keys quota exhausted, skipping`,
      );
      return null;
    }

    if (fallbackKey) {
      this.logger.warn(
        `[getHealthyKey] All ${toolId} keys in cooldown, using oldest failed key`,
      );
    }
    return fallbackKey;
  }

  /**
   * 标记 Key 失败
   *
   * 工具在调用外部 API 失败时应调用此方法，以便下次 getApiKey 返回其他 key。
   * @param toolId 工具 ID
   * @param key 失败的 API Key 原文
   * @param errorCode HTTP 状态码（429, 401, 500 等）
   */
  markKeyFailed(toolId: string, key: string, errorCode: number): void {
    const healthKey = this.getKeyHash(toolId, key);
    this.keyHealthMap.set(healthKey, {
      failedAt: Date.now(),
      errorCode,
    });
    this.logger.warn(
      `[markKeyFailed] ${toolId} key ${this.getMaskedKeyForDisplay(key)} marked failed (HTTP ${errorCode})`,
    );
  }

  /**
   * 清除 Key 的失败状态（成功时调用）
   */
  clearKeyFailure(toolId: string, key: string): void {
    const healthKey = this.getKeyHash(toolId, key);
    if (this.keyHealthMap.has(healthKey)) {
      this.keyHealthMap.delete(healthKey);
      this.logger.debug(
        `[clearKeyFailure] Cleared failure for ${toolId} key ${this.getMaskedKeyForDisplay(key)}`,
      );
    }
  }

  /**
   * 获取工具所有密钥的健康状态（供管理后台展示）
   */
  async getKeyHealthStatus(toolId: string): Promise<KeyHealthStatus[]> {
    const keys = await this.getAllApiKeys(toolId);
    const now = Date.now();

    return keys.map((key, index) => {
      const healthKey = this.getKeyHash(toolId, key);
      const health = this.keyHealthMap.get(healthKey);

      const cooldown =
        health && isQuotaExhaustedError(health.errorCode)
          ? KEY_QUOTA_COOLDOWN_MS
          : KEY_COOLDOWN_MS;
      const isHealthy = !health || now - health.failedAt >= cooldown;

      let cooldownUntil: string | undefined;
      if (health && !isHealthy) {
        cooldownUntil = new Date(health.failedAt + cooldown).toISOString();
      }

      return {
        index,
        maskedKey: this.getMaskedKeyForDisplay(key),
        isHealthy,
        lastError: health ? `HTTP ${health.errorCode}` : undefined,
        cooldownUntil,
      };
    });
  }

  // ============================================================================
  // API Key Retrieval
  // ============================================================================

  /**
   * 获取工具的 API Key（支持多密钥轮转）
   *
   * 密钥可以逗号分隔存储在 Secret Manager 中：
   *   "key1,key2,key3"
   * 每次调用返回下一个健康的 key（Round-Robin）。
   *
   * 优先从 Secret Manager 获取，否则从 ToolConfig.config.apiKey 获取
   */
  async getApiKey(toolId: string): Promise<string | null> {
    try {
      const keys = await this.getAllApiKeys(toolId);
      if (keys.length === 0) return null;

      // 单密钥或多密钥均走轮转逻辑
      return this.getHealthyKey(toolId, keys);
    } catch (error) {
      this.logger.error(
        `[getApiKey] Failed to get API key for ${toolId}: ${error}`,
      );
      return null;
    }
  }

  /**
   * 获取工具的所有 API Key（不做轮转选择）
   * 用于管理后台展示密钥列表或工具自行实现轮转
   */
  async getAllApiKeys(toolId: string): Promise<string[]> {
    try {
      // 1. 查找工具配置（支持 provider id / registry id 双向别名）
      let toolConfig: {
        secretKey: string | null;
        config: Prisma.JsonValue;
      } | null = null;
      for (const candidateToolId of getToolIdAliases(toolId)) {
        toolConfig = await this.prisma.toolConfig.findUnique({
          where: { toolId: candidateToolId },
          select: { secretKey: true, config: true },
        });
        if (toolConfig) break;
      }

      // 2. 如果有 secretKey，从 Secret Manager 获取
      if (toolConfig?.secretKey) {
        const secretValue = await this.secretsService.getValue(
          toolConfig.secretKey,
        );
        if (secretValue) {
          const keys = this.parseKeys(secretValue);
          if (keys.length > 0) {
            this.logger.debug(
              `[getAllApiKeys] Retrieved ${keys.length} key(s) for ${toolId} from Secret Manager`,
            );
            return keys;
          }
        }
      }

      // 3. 检查配置中的直接 apiKey（也支持逗号分隔）
      const config = toolConfig?.config as Record<string, unknown> | null;
      if (config?.apiKey && typeof config.apiKey === "string") {
        return this.parseKeys(config.apiKey);
      }

      return [];
    } catch (error) {
      this.logger.error(
        `[getAllApiKeys] Failed to get API keys for ${toolId}: ${error}`,
      );
      return [];
    }
  }

  // ============================================================================
  // HTTP Helpers
  // ============================================================================

  /**
   * 发送 HTTP GET 请求
   */
  async httpGet<T>(
    url: string,
    params?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>,
  ): Promise<T> {
    // 过滤掉 undefined 值
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          cleanParams[key] = String(value);
        }
      }
    }

    // ★ Host 级 429 冷却短路：撞过 429 的 host 在 5min 内直接 fail-fast
    //   防止 OpenAlex / ArXiv-via-OpenAlex 等无 key 免费 API 反复打 429 浪费 quota
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      // 非法 URL 走原路径让 axios 报错
    }
    if (host) {
      const cooldownUntil = this.hostCooldownUntil.get(host);
      if (cooldownUntil && Date.now() < cooldownUntil) {
        const remainingMs = cooldownUntil - Date.now();
        throw new Error(
          `Host ${host} in 429 cooldown for ${Math.ceil(remainingMs / 1000)}s more`,
        );
      }
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, {
          params: cleanParams,
          headers: {
            "User-Agent": APP_CONFIG.brand.userAgent,
            ...headers,
          },
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      // ★ 撞 429 时启动 host 级冷却
      if (host && this.is429Error(error)) {
        const until = Date.now() + PolicyDataService.HOST_429_COOLDOWN_MS;
        this.hostCooldownUntil.set(host, until);
        this.logger.warn(
          `[httpGet] ${host} hit 429 → cooling down ${PolicyDataService.HOST_429_COOLDOWN_MS / 1000}s`,
        );
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`[httpGet] HTTP GET request failed: ${url}`, error);
      throw new Error(`HTTP GET request failed: ${errorMessage}`);
    }
  }

  private is429Error(err: unknown): boolean {
    if (typeof err !== "object" || err === null) return false;
    const e = err as { response?: { status?: number }; status?: number };
    return e.response?.status === 429 || e.status === 429;
  }

  /**
   * 发送 HTTP POST 请求
   */
  async httpPost<T>(
    url: string,
    data?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, {
          headers: {
            "User-Agent": APP_CONFIG.brand.userAgent,
            "Content-Type": "application/json",
            ...headers,
          },
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`[httpPost] HTTP POST request failed: ${url}`, error);
      throw new Error(`HTTP POST request failed: ${errorMessage}`);
    }
  }

  // ============================================================================
  // Date Helpers
  // ============================================================================

  /**
   * 格式化日期为 YYYY-MM-DD 格式
   */
  formatDate(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().split("T")[0];
  }

  /**
   * 获取 N 天前的日期
   */
  getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return this.formatDate(date);
  }
}
