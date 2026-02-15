/**
 * AI Engine - Skill Loader Service
 *
 * 负责加载和管理 SKILL.md 文件
 * 支持本地 Skills 和远程 SkillsMP Skills
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
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
import { SkillsMPClientService } from "../ecosystem/skillsmp-client.service";

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
export class SkillLoaderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SkillLoaderService.name);

  /** 已加载的本地 Skills（内存缓存） */
  private localSkills: Map<string, SkillMdDefinition> = new Map();

  /** Skill 目录配置 */
  private readonly skillDirectories: SkillDirectoryConfig[] = [];

  /** 基础 Skills 目录 */
  private readonly baseSkillsDir: string;

  /** SkillsMP 自动更新定时器 */
  private updateCheckInterval: NodeJS.Timeout | null = null;

  /** 更新检查间隔（毫秒）- 6小时 */
  private readonly UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

  constructor(
    private readonly cacheService: SkillCacheService,
    private readonly skillsMPClient: SkillsMPClientService,
  ) {
    // 基于当前模块位置计算 Skills 目录
    // __dirname = .../ai-engine/skills/loader/ → need 3 levels up to reach modules/
    this.baseSkillsDir = path.resolve(__dirname, "../../../ai-app");

    // 配置各领域的 Skill 目录
    this.skillDirectories = [
      {
        path: path.join(this.baseSkillsDir, "writing/skills"),
        domain: "writing",
        recursive: false,
      },
      {
        // ★ topic-insights 洞察分析技能
        path: path.join(this.baseSkillsDir, "topic-insights/skills"),
        domain: "research",
        recursive: false,
      },
      {
        path: path.join(this.baseSkillsDir, "office/skills"),
        domain: "office",
        recursive: false,
      },
      {
        // ★ Slides skills (SKILL.md per skill directory)
        path: path.join(this.baseSkillsDir, "office/slides/skills"),
        domain: "office",
        recursive: false,
      },
    ];
  }

  async onModuleInit(): Promise<void> {
    // 1. 加载本地 Skills
    await this.loadAllLocalSkills();

    // 2. 预热已安装的 Marketplace Skills（从磁盘加载到内存）
    await this.warmupInstalledSkills();

    // 3. 启动 SkillsMP 自动更新检查
    this.startUpdateChecker();
  }

  async onModuleDestroy(): Promise<void> {
    // 清理更新检查定时器
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
      this.logger.log("[Skills] Stopped SkillsMP update checker");
    }
  }

  /**
   * 启动 SkillsMP 自动更新检查
   */
  private startUpdateChecker(): void {
    // 启动时立即检查一次（延迟30秒，等待系统完全启动）
    setTimeout(() => {
      this.checkAndUpdateSkills().catch((err) => {
        this.logger.warn(
          `[Skills] Initial update check failed: ${err.message}`,
        );
      });
    }, 30000);

    // 定期检查更新
    this.updateCheckInterval = setInterval(async () => {
      await this.checkAndUpdateSkills().catch((err) => {
        this.logger.warn(
          `[Skills] Periodic update check failed: ${err.message}`,
        );
      });
    }, this.UPDATE_CHECK_INTERVAL_MS);

    this.logger.log(
      `[Skills] 🔄 Started SkillsMP auto-update checker (interval: ${this.UPDATE_CHECK_INTERVAL_MS / 1000 / 60 / 60}h)`,
    );
  }

  /**
   * 检查并更新已安装的 SkillsMP Skills
   */
  private async checkAndUpdateSkills(): Promise<void> {
    // 检查 SkillsMP 客户端是否启用
    if (!this.skillsMPClient.isEnabled()) {
      this.logger.debug(
        "[Skills] SkillsMP client disabled, skipping update check",
      );
      return;
    }

    // 获取已安装的 Skills（从缓存服务获取）
    const installedSkills = this.getInstalledMarketplaceSkills();
    if (installedSkills.length === 0) {
      this.logger.debug("[Skills] No installed Marketplace skills to check");
      return;
    }

    this.logger.log(
      `[Skills] 🔍 Checking updates for ${installedSkills.length} installed skills...`,
    );

    try {
      // 调用 SkillsMP API 检查更新
      const updates = await this.skillsMPClient.checkUpdates(installedSkills);

      if (updates.length === 0) {
        this.logger.log("[Skills] ✅ All installed skills are up to date");
        return;
      }

      this.logger.log(
        `[Skills] 📦 Found ${updates.length} skill updates available`,
      );

      // 自动更新每个有更新的 Skill
      let successCount = 0;
      let failCount = 0;

      for (const update of updates) {
        try {
          this.logger.log(
            `[Skills]   └─ Updating ${update.skillId}: ${update.currentVersion} → ${update.latestVersion}`,
          );

          const success = await this.skillsMPClient.installSkill(
            update.skillId,
          );
          if (success) {
            successCount++;
            this.logger.log(`[Skills]   ✅ Updated ${update.skillId}`);
          } else {
            failCount++;
            this.logger.warn(
              `[Skills]   ❌ Failed to update ${update.skillId}`,
            );
          }
        } catch (err) {
          failCount++;
          this.logger.warn(
            `[Skills]   ❌ Error updating ${update.skillId}: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `[Skills] 📊 Update complete: ${successCount} succeeded, ${failCount} failed`,
      );
    } catch (error) {
      this.logger.error(
        `[Skills] Failed to check updates: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 获取已安装的 Marketplace Skills 列表（ID + 版本）
   */
  private getInstalledMarketplaceSkills(): Array<{
    id: string;
    version: string;
  }> {
    const installed: Array<{ id: string; version: string }> = [];

    // 从缓存中获取所有已缓存的 Skills（这些是从 SkillsMP 安装的）
    const stats = this.cacheService.getStats();
    if (stats.size === 0) {
      return installed;
    }

    // 遍历本地缓存，排除本地 Skills（本地 Skills 在 localSkills Map 中）
    // 只返回从 SkillsMP 安装的 Skills
    for (const [skillId, skill] of this.localSkills) {
      // 本地 Skills 不需要检查更新
      if (skill.metadata.source === "local") {
        continue;
      }

      // 从 SkillsMP 安装的 Skills
      if (skill.metadata.source === "skillsmp" || !skill.metadata.source) {
        installed.push({
          id: skillId,
          version: skill.metadata.version || "0.0.0",
        });
      }
    }

    return installed;
  }

  /**
   * 预热已安装的 Marketplace Skills
   * 从 cached/skills 目录加载到内存
   */
  private async warmupInstalledSkills(): Promise<void> {
    try {
      const loadedCount = await this.cacheService.warmup();
      if (loadedCount > 0) {
        this.logger.log(
          `[Skills] ✅ Warmed up ${loadedCount} installed Marketplace Skills`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `[Skills] Failed to warmup installed skills: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 加载所有本地 Skills
   */
  async loadAllLocalSkills(): Promise<void> {
    this.logger.log("[Skills] 🔄 Loading all local SKILL.md files...");

    let totalLoaded = 0;
    let totalFailed = 0;
    const loadedByDomain: Record<string, string[]> = {};

    for (const config of this.skillDirectories) {
      try {
        const skills = await this.loadSkillsFromDirectory(config);
        for (const skill of skills) {
          this.localSkills.set(skill.metadata.id, skill);
          totalLoaded++;

          // 按领域分组记录
          if (!loadedByDomain[skill.metadata.domain]) {
            loadedByDomain[skill.metadata.domain] = [];
          }
          loadedByDomain[skill.metadata.domain].push(skill.metadata.id);
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

    // 输出详细的加载报告
    this.logger.log(
      `[Skills] ✅ Loaded ${totalLoaded} local Skills (${totalFailed} directories failed)`,
    );

    // 按领域输出详细信息
    for (const [domain, skillIds] of Object.entries(loadedByDomain)) {
      this.logger.log(
        `[Skills]   └─ ${domain}: ${skillIds.length} skills [${skillIds.join(", ")}]`,
      );
    }
  }

  /**
   * 从目录加载 Skills
   *
   * 支持两种命名约定：
   * 1. Claude Code 官方：skill-name/SKILL.md
   * 2. 我们的扩展：skill-name.skill.md
   */
  private async loadSkillsFromDirectory(
    config: SkillDirectoryConfig,
  ): Promise<SkillMdDefinition[]> {
    const patterns: string[] = [];

    if (config.recursive) {
      // 递归模式：支持两种命名
      patterns.push(
        path.join(config.path, "**/*.skill.md"), // 我们的格式
        path.join(config.path, "**/SKILL.md"), // Claude Code 格式
      );
    } else {
      // 非递归模式
      patterns.push(
        path.join(config.path, "*.skill.md"), // 我们的格式
        path.join(config.path, "*/SKILL.md"), // Claude Code 格式（子目录）
      );
    }

    // 使用 glob 查找所有匹配文件
    const allFiles = new Set<string>();
    for (const pattern of patterns) {
      const files = await glob(pattern.replace(/\\/g, "/"));
      files.forEach((f) => allFiles.add(f));
    }

    if (allFiles.size === 0) {
      this.logger.debug(`No SKILL.md files found in ${config.path}`);
      return [];
    }

    const skills: SkillMdDefinition[] = [];

    for (const filePath of allFiles) {
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

    this.logger.log(
      `[Skills] 🔍 getSkillsForTask: taskType="${taskType}", domain="${domain}", budget=${maxTokenBudget || "unlimited"}`,
    );

    const matchedSkills: SkillMdDefinition[] = [];
    const skippedSkills: string[] = [];
    let currentTokens = 0;

    // 1. 获取领域内所有启用的 Skills
    const domainSkills = await this.loadLocalSkills(domain);
    this.logger.log(
      `[Skills]   └─ Domain "${domain}" has ${domainSkills.length} enabled skills`,
    );

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
            skippedSkills.push(`${skill.metadata.id}(${skillTokens}t)`);
            continue;
          }
          currentTokens += skillTokens;
        }

        matchedSkills.push(skill);
      }
    }

    // 3. 添加额外指定的 Skills
    if (additionalSkillIds && additionalSkillIds.length > 0) {
      this.logger.log(
        `[Skills]   └─ Adding ${additionalSkillIds.length} additional skills: [${additionalSkillIds.join(", ")}]`,
      );

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
              skippedSkills.push(`${skillId}(${skillTokens}t)`);
              continue;
            }
            currentTokens += skillTokens;
          }

          matchedSkills.push(skill);
        } else {
          this.logger.warn(
            `[Skills] ⚠️ Additional skill not found: ${skillId}`,
          );
        }
      }
    }

    // 4. 输出匹配结果
    const matchedIds = matchedSkills.map((s) => s.metadata.id);
    this.logger.log(
      `[Skills] ✅ Matched ${matchedSkills.length} skills, ~${currentTokens} tokens`,
    );
    this.logger.log(`[Skills]   └─ Using: [${matchedIds.join(", ")}]`);

    if (skippedSkills.length > 0) {
      this.logger.log(
        `[Skills]   └─ Skipped (budget): [${skippedSkills.join(", ")}]`,
      );
    }

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
   * 安全措施：
   * 1. 使用 fs.realpath 解析符号链接
   * 2. 验证路径在白名单目录内（带路径分隔符防止前缀攻击）
   * 3. 验证目标是目录而非文件
   * 4. 检查可疑路径模式
   */
  async addSkillDirectory(config: SkillDirectoryConfig): Promise<void> {
    // 1. 规范化路径
    const normalizedPath = path.normalize(config.path);
    const resolvedPath = path.resolve(normalizedPath);

    // 2. 检查路径中是否包含可疑的路径遍历模式（在 realpath 前检查）
    if (
      config.path.includes("..") ||
      normalizedPath.includes("..") ||
      /[<>"|?*]/.test(config.path) // 移除 : 因为 Windows 路径包含它
    ) {
      this.logger.warn(
        `[Security] Rejected skill directory with suspicious pattern: ${config.path}`,
      );
      throw new Error(
        `Invalid skill directory path: contains suspicious patterns`,
      );
    }

    // 3. 使用 realpath 解析符号链接，获取真实路径
    let realPath: string;
    try {
      realPath = await fs.realpath(resolvedPath);
    } catch (error) {
      // 路径不存在或无法访问
      this.logger.warn(
        `[Security] Skill directory does not exist or not accessible: ${config.path}`,
      );
      throw new Error(
        `Skill directory does not exist or is not accessible: ${config.path}`,
      );
    }

    // 4. 验证是目录而非文件
    try {
      const stat = await fs.stat(realPath);
      if (!stat.isDirectory()) {
        this.logger.warn(
          `[Security] Skill path is not a directory: ${config.path}`,
        );
        throw new Error(`Skill path must be a directory: ${config.path}`);
      }
    } catch (error) {
      if ((error as Error).message.includes("must be a directory")) {
        throw error;
      }
      throw new Error(`Cannot access skill directory: ${config.path}`);
    }

    // 5. 获取允许的基础目录的真实路径
    const allowedBaseDirs: string[] = [];
    try {
      const baseSkillsRealPath = await fs.realpath(
        path.resolve(this.baseSkillsDir),
      );
      allowedBaseDirs.push(baseSkillsRealPath);
    } catch {
      // 忽略不存在的目录
    }
    try {
      const projectRootRealPath = await fs.realpath(
        path.resolve(__dirname, "../../../../"),
      );
      allowedBaseDirs.push(projectRootRealPath);
    } catch {
      // 忽略不存在的目录
    }

    // 6. 白名单检查（使用路径分隔符防止 /app 匹配 /app-evil）
    const isAllowed = allowedBaseDirs.some(
      (baseDir) =>
        realPath === baseDir || realPath.startsWith(baseDir + path.sep),
    );

    if (!isAllowed) {
      this.logger.warn(
        `[Security] Rejected skill directory outside allowed paths: ${config.path} -> ${realPath}`,
      );
      throw new Error(
        `Skill directory must be within allowed paths. Rejected: ${config.path}`,
      );
    }

    // 7. 使用真实路径添加到配置
    this.skillDirectories.push({
      ...config,
      path: realPath,
    });
    this.logger.debug(`Added skill directory: ${realPath}`);
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
