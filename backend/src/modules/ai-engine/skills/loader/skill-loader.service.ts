/**
 * AI Engine - Skill Loader Service
 *
 * 负责加载和管理 SKILL.md 文件
 * 支持本地 Skills 和远程 SkillsMP Skills
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import {
  SkillMdDefinition,
  SkillDomain,
  GetSkillsOptions,
} from "../types/skill-md.types";
import { parseSkillMd, estimateTokens } from "./skill-parser";
import { SkillCacheService } from "./skill-cache.service";

/**
 * Skill 目录配置
 */
interface SkillDirectoryConfig {
  /** 目录路径 */
  path: string;
  /** 领域 */
  domain: SkillDomain;
  /** 是否递归扫描 */
  recursive?: boolean;
}

@Injectable()
export class SkillLoaderService implements OnModuleInit {
  private readonly logger = new Logger(SkillLoaderService.name);

  /** 已加载的本地 Skills（内存缓存） */
  private localSkills: Map<string, SkillMdDefinition> = new Map();

  /** Skill 目录配置 */
  private readonly skillDirectories: SkillDirectoryConfig[] = [];

  /** 基础 Skills 目录 */
  private readonly baseSkillsDir: string;

  constructor(private readonly cacheService: SkillCacheService) {
    // 基于当前模块位置计算 Skills 目录
    this.baseSkillsDir = path.resolve(__dirname, "../../ai-app");

    // 配置各领域的 Skill 目录
    this.skillDirectories = [
      {
        path: path.join(this.baseSkillsDir, "writing/skills"),
        domain: "writing",
        recursive: false,
      },
      {
        path: path.join(this.baseSkillsDir, "research/skills"),
        domain: "research",
        recursive: false,
      },
      {
        path: path.join(this.baseSkillsDir, "office/skills"),
        domain: "office",
        recursive: false,
      },
    ];
  }

  async onModuleInit(): Promise<void> {
    await this.loadAllLocalSkills();
  }

  /**
   * 加载所有本地 Skills
   */
  async loadAllLocalSkills(): Promise<void> {
    this.logger.log("Loading all local SKILL.md files...");

    let totalLoaded = 0;
    let totalFailed = 0;

    for (const config of this.skillDirectories) {
      try {
        const skills = await this.loadSkillsFromDirectory(config);
        for (const skill of skills) {
          this.localSkills.set(skill.metadata.id, skill);
          totalLoaded++;
        }
      } catch (error) {
        // 目录不存在是正常情况，只记录 debug
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          this.logger.debug(`Skill directory not found: ${config.path}`);
        } else {
          this.logger.warn(
            `Failed to load skills from ${config.path}: ${(error as Error).message}`,
          );
          totalFailed++;
        }
      }
    }

    this.logger.log(
      `Loaded ${totalLoaded} local Skills (${totalFailed} directories failed)`,
    );
  }

  /**
   * 从目录加载 Skills
   */
  private async loadSkillsFromDirectory(
    config: SkillDirectoryConfig,
  ): Promise<SkillMdDefinition[]> {
    const pattern = config.recursive
      ? path.join(config.path, "**/*.skill.md")
      : path.join(config.path, "*.skill.md");

    // 使用 glob 查找所有 .skill.md 文件
    const files = await glob(pattern.replace(/\\/g, "/"));

    if (files.length === 0) {
      this.logger.debug(`No SKILL.md files found in ${config.path}`);
      return [];
    }

    const skills: SkillMdDefinition[] = [];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const skill = parseSkillMd(content, filePath);

        // 确保领域与目录配置一致
        if (skill.metadata.domain !== config.domain) {
          this.logger.warn(
            `Skill ${skill.metadata.id} domain mismatch: expected ${config.domain}, got ${skill.metadata.domain}`,
          );
        }

        skills.push(skill);
        this.logger.debug(
          `Loaded skill: ${skill.metadata.id} from ${filePath}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to parse SKILL.md: ${filePath} - ${(error as Error).message}`,
        );
      }
    }

    return skills;
  }

  /**
   * 按领域加载本地 Skills
   */
  async loadLocalSkills(domain: SkillDomain): Promise<SkillMdDefinition[]> {
    const skills: SkillMdDefinition[] = [];

    for (const [, skill] of this.localSkills) {
      if (
        skill.metadata.domain === domain &&
        skill.metadata.enabled !== false
      ) {
        skills.push(skill);
      }
    }

    // 按优先级排序（高优先级在前）
    skills.sort((a, b) => b.metadata.priority - a.metadata.priority);

    return skills;
  }

  /**
   * 按 ID 获取 Skill
   */
  async getSkillById(skillId: string): Promise<SkillMdDefinition | null> {
    // 1. 先从本地缓存查找
    const localSkill = this.localSkills.get(skillId);
    if (localSkill) {
      return localSkill;
    }

    // 2. 从持久化缓存查找（远程 Skills）
    const cachedSkill = await this.cacheService.get(skillId);
    if (cachedSkill) {
      return cachedSkill;
    }

    return null;
  }

  /**
   * 按任务类型获取 Skills
   *
   * @param options - 获取选项
   * @returns 匹配的 Skills（按优先级排序）
   */
  async getSkillsForTask(
    options: GetSkillsOptions,
  ): Promise<SkillMdDefinition[]> {
    const { taskType, domain, additionalSkillIds, maxTokenBudget } = options;

    const matchedSkills: SkillMdDefinition[] = [];
    let currentTokens = 0;

    // 1. 获取领域内所有启用的 Skills
    const domainSkills = await this.loadLocalSkills(domain);

    // 2. 筛选匹配任务类型的 Skills
    for (const skill of domainSkills) {
      // 检查是否匹配任务类型
      const matchesTaskType =
        skill.metadata.taskTypes.includes(taskType) ||
        skill.metadata.taskTypes.includes("*"); // * 表示匹配所有任务

      if (matchesTaskType) {
        // Token 预算检查
        if (maxTokenBudget) {
          const skillTokens =
            skill.metadata.tokenBudget || estimateTokens(skill.content);
          if (currentTokens + skillTokens > maxTokenBudget) {
            this.logger.debug(
              `Skipping skill ${skill.metadata.id}: exceeds token budget`,
            );
            continue;
          }
          currentTokens += skillTokens;
        }

        matchedSkills.push(skill);
      }
    }

    // 3. 添加额外指定的 Skills
    if (additionalSkillIds && additionalSkillIds.length > 0) {
      for (const skillId of additionalSkillIds) {
        // 避免重复添加
        if (matchedSkills.some((s) => s.metadata.id === skillId)) {
          continue;
        }

        const skill = await this.getSkillById(skillId);
        if (skill) {
          // Token 预算检查
          if (maxTokenBudget) {
            const skillTokens =
              skill.metadata.tokenBudget || estimateTokens(skill.content);
            if (currentTokens + skillTokens > maxTokenBudget) {
              this.logger.debug(
                `Skipping additional skill ${skillId}: exceeds token budget`,
              );
              continue;
            }
            currentTokens += skillTokens;
          }

          matchedSkills.push(skill);
        } else {
          this.logger.warn(`Additional skill not found: ${skillId}`);
        }
      }
    }

    this.logger.debug(
      `getSkillsForTask: taskType=${taskType}, domain=${domain}, matched=${matchedSkills.length}, tokens=${currentTokens}`,
    );

    return matchedSkills;
  }

  /**
   * 重新加载所有 Skills
   */
  async reloadSkills(): Promise<void> {
    this.localSkills.clear();
    await this.loadAllLocalSkills();
  }

  /**
   * 获取所有已加载的 Skills
   */
  getAllLoadedSkills(): SkillMdDefinition[] {
    return Array.from(this.localSkills.values());
  }

  /**
   * 获取 Skills 统计信息
   */
  getStats(): {
    totalSkills: number;
    byDomain: Record<string, number>;
    totalTokenBudget: number;
  } {
    const byDomain: Record<string, number> = {};
    let totalTokenBudget = 0;

    for (const skill of this.localSkills.values()) {
      const domain = skill.metadata.domain;
      byDomain[domain] = (byDomain[domain] || 0) + 1;
      totalTokenBudget +=
        skill.metadata.tokenBudget || estimateTokens(skill.content);
    }

    return {
      totalSkills: this.localSkills.size,
      byDomain,
      totalTokenBudget,
    };
  }

  /**
   * 添加自定义 Skill 目录
   *
   * 安全措施：验证路径是否在允许的范围内，防止路径遍历攻击
   */
  addSkillDirectory(config: SkillDirectoryConfig): void {
    // 安全检查：验证路径是否在允许的基础目录内
    const normalizedPath = path.normalize(config.path);
    const resolvedPath = path.resolve(normalizedPath);

    // 允许的基础目录列表
    const allowedBaseDirs = [
      path.resolve(this.baseSkillsDir), // ai-app 目录
      path.resolve(__dirname, "../../../../"), // 项目根目录
    ];

    const isAllowed = allowedBaseDirs.some((baseDir) =>
      resolvedPath.startsWith(baseDir),
    );

    if (!isAllowed) {
      this.logger.warn(
        `[Security] Rejected skill directory outside allowed paths: ${config.path}`,
      );
      throw new Error(
        `Skill directory must be within allowed paths. Rejected: ${config.path}`,
      );
    }

    // 检查路径中是否包含可疑的路径遍历模式
    if (
      config.path.includes("..") ||
      normalizedPath.includes("..") ||
      /[<>:"|?*]/.test(config.path)
    ) {
      this.logger.warn(
        `[Security] Rejected skill directory with suspicious pattern: ${config.path}`,
      );
      throw new Error(
        `Invalid skill directory path: contains suspicious patterns`,
      );
    }

    this.skillDirectories.push(config);
    this.logger.debug(`Added skill directory: ${config.path}`);
  }

  /**
   * 手动注册 Skill（用于测试或动态添加）
   */
  registerSkill(skill: SkillMdDefinition): void {
    this.localSkills.set(skill.metadata.id, skill);
    this.logger.debug(`Manually registered skill: ${skill.metadata.id}`);
  }

  /**
   * 注销 Skill
   */
  unregisterSkill(skillId: string): boolean {
    const removed = this.localSkills.delete(skillId);
    if (removed) {
      this.logger.debug(`Unregistered skill: ${skillId}`);
    }
    return removed;
  }
}
