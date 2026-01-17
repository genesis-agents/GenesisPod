/**
 * AI Engine - SkillsMP Client Service
 *
 * 与 SkillsMP 生态系统集成
 * 支持搜索、获取和安装远程 Skills
 *
 * SkillsMP: https://skillsmp.com
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  SkillMdDefinition,
  SkillSearchResult,
  SkillFilters,
  SkillUpdateInfo,
} from "../types/skill-md.types";
import { parseSkillMd } from "../loader/skill-parser";
import { SkillCacheService } from "../loader/skill-cache.service";

/**
 * SkillsMP API 配置
 */
interface SkillsMPConfig {
  /** API 基础 URL */
  baseUrl: string;
  /** API 密钥（可选） */
  apiKey?: string;
  /** 请求超时（毫秒） */
  timeout: number;
  /** 重试次数 */
  maxRetries: number;
}

const DEFAULT_CONFIG: SkillsMPConfig = {
  baseUrl: "https://skillsmp.com/api",
  timeout: 10000,
  maxRetries: 3,
};

/**
 * API 响应类型
 */
interface SkillsMPSearchResponse {
  skills: SkillSearchResult[];
  total: number;
  page: number;
  pageSize: number;
}

interface SkillsMPSkillResponse {
  id: string;
  name: string;
  author: string;
  version: string;
  content: string;
  downloads: number;
  rating: number;
  tags: string[];
  updatedAt: string;
}

@Injectable()
export class SkillsMPClientService {
  private readonly logger = new Logger(SkillsMPClientService.name);

  /** 配置 */
  private config: SkillsMPConfig;

  /** 是否启用（某些环境可能禁用远程访问） */
  private enabled: boolean = true;

  constructor(private readonly cacheService: SkillCacheService) {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * 配置客户端
   */
  configure(config: Partial<SkillsMPConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 启用/禁用客户端
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 搜索 Skills
   */
  async searchSkills(
    query: string,
    filters?: SkillFilters,
  ): Promise<SkillSearchResult[]> {
    if (!this.enabled) {
      this.logger.debug("SkillsMP client is disabled");
      return [];
    }

    const params = new URLSearchParams();
    params.set("q", query);

    if (filters) {
      if (filters.domain) params.set("domain", filters.domain);
      if (filters.tags?.length) params.set("tags", filters.tags.join(","));
      if (filters.author) params.set("author", filters.author);
      if (filters.minRating) params.set("minRating", String(filters.minRating));
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
      if (filters.limit) params.set("limit", String(filters.limit));
      if (filters.offset) params.set("offset", String(filters.offset));
    }

    try {
      const response = await this.fetchWithRetry<SkillsMPSearchResponse>(
        `/skills/search?${params.toString()}`,
      );

      return response.skills;
    } catch (error) {
      this.logger.error(
        `Failed to search SkillsMP: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * 获取 Skill 详情
   */
  async getSkill(skillId: string): Promise<SkillMdDefinition | null> {
    if (!this.enabled) {
      this.logger.debug("SkillsMP client is disabled");
      return null;
    }

    // 先检查缓存
    const cached = await this.cacheService.get(skillId);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.fetchWithRetry<SkillsMPSkillResponse>(
        `/skills/${skillId}`,
      );

      // 解析 Skill 内容
      const skill = parseSkillMd(response.content);

      // 缓存结果
      await this.cacheService.set(skillId, skill);

      return skill;
    } catch (error) {
      this.logger.error(
        `Failed to get skill ${skillId} from SkillsMP: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * 安装 Skill 到本地缓存
   */
  async installSkill(skillId: string): Promise<boolean> {
    const skill = await this.getSkill(skillId);
    if (!skill) {
      return false;
    }

    // 持久化到本地
    await this.cacheService.set(skillId, skill, true);

    this.logger.log(`Installed skill from SkillsMP: ${skillId}`);
    return true;
  }

  /**
   * 检查 Skills 更新
   */
  async checkUpdates(
    installedSkills: Array<{ id: string; version: string }>,
  ): Promise<SkillUpdateInfo[]> {
    if (!this.enabled || installedSkills.length === 0) {
      return [];
    }

    try {
      const response = await this.fetchWithRetry<{
        updates: SkillUpdateInfo[];
      }>("/skills/check-updates", {
        method: "POST",
        body: JSON.stringify({ skills: installedSkills }),
      });

      return response.updates;
    } catch (error) {
      this.logger.error(`Failed to check updates: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取热门 Skills
   */
  async getPopularSkills(
    domain?: string,
    limit: number = 10,
  ): Promise<SkillSearchResult[]> {
    if (!this.enabled) {
      return [];
    }

    const params = new URLSearchParams();
    params.set("sortBy", "downloads");
    params.set("sortOrder", "desc");
    params.set("limit", String(limit));
    if (domain) params.set("domain", domain);

    try {
      const response = await this.fetchWithRetry<SkillsMPSearchResponse>(
        `/skills/popular?${params.toString()}`,
      );

      return response.skills;
    } catch (error) {
      this.logger.error(
        `Failed to get popular skills: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * 获取推荐 Skills（基于已安装的 Skills）
   */
  async getRecommendedSkills(
    installedSkillIds: string[],
    limit: number = 5,
  ): Promise<SkillSearchResult[]> {
    if (!this.enabled || installedSkillIds.length === 0) {
      return [];
    }

    try {
      const response = await this.fetchWithRetry<{
        skills: SkillSearchResult[];
      }>("/skills/recommend", {
        method: "POST",
        body: JSON.stringify({ installed: installedSkillIds, limit }),
      });

      return response.skills;
    } catch (error) {
      this.logger.error(
        `Failed to get recommended skills: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * 带重试的 fetch 请求
   */
  private async fetchWithRetry<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout,
        );

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "DeepDive-Engine/1.0",
        };

        if (this.config.apiKey) {
          headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        }

        const response = await fetch(url, {
          ...options,
          headers: { ...headers, ...options.headers },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;
        this.logger.debug(
          `SkillsMP request failed (attempt ${attempt + 1}): ${lastError.message}`,
        );

        // 等待后重试
        if (attempt < this.config.maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (attempt + 1)),
          );
        }
      }
    }

    throw lastError || new Error("Unknown error");
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      await this.fetchWithRetry<{ status: string }>("/health");
      return true;
    } catch {
      return false;
    }
  }
}
