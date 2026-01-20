/**
 * Policy Data Service
 * 政策工具共享服务 - 提供 API Key 获取和 HTTP 请求功能
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SecretsService } from "@/modules/core/secrets/secrets.service";
import { firstValueFrom } from "rxjs";

@Injectable()
export class PolicyDataService {
  private readonly logger = new Logger(PolicyDataService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
  ) {}

  /**
   * 获取工具的 API Key
   * 优先从 Secret Manager 获取，否则从 ToolConfig 获取
   */
  async getApiKey(toolId: string): Promise<string | null> {
    try {
      // 1. 查找工具配置
      const toolConfig = await this.prisma.toolConfig.findUnique({
        where: { toolId },
      });

      // 2. 如果有 secretKey，从 Secret Manager 获取
      if (toolConfig?.secretKey) {
        const secretValue = await this.secretsService.getValue(
          toolConfig.secretKey,
        );
        if (secretValue) {
          this.logger.debug(
            `[getApiKey] Retrieved API key for ${toolId} from Secret Manager`,
          );
          return secretValue;
        }
      }

      // 3. 检查配置中的直接 apiKey
      const config = toolConfig?.config as Record<string, unknown> | null;
      if (config?.apiKey && typeof config.apiKey === "string") {
        return config.apiKey;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `[getApiKey] Failed to get API key for ${toolId}: ${error}`,
      );
      return null;
    }
  }

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

    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, {
          params: cleanParams,
          headers: {
            "User-Agent": "DeepDive-Engine/1.0",
            ...headers,
          },
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`[httpGet] HTTP GET request failed: ${url}`, error);
      throw new Error(`HTTP GET request failed: ${errorMessage}`);
    }
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
            "User-Agent": "DeepDive-Engine/1.0",
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
