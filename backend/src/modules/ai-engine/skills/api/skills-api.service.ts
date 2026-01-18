/**
 * AI Skills API Service
 *
 * 提供 SkillsMP 数据的业务逻辑
 * 从数据库读取已同步的数据，或从 SkillsMP API 获取
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  stars: number;
  downloads: string;
  tags: string[];
  featured: boolean;
  url: string;
  lastUpdated: string;
}

export interface SkillsStats {
  totalSkills: number;
  lastUpdated: string | null;
  weeklyGrowth: number;
  featuredCount: number;
  categoryCount: number;
}

export interface TimelineDataPoint {
  date: string;
  count: number;
  cumulative: number;
}

export interface SearchParams {
  query?: string;
  category?: string;
  sortBy?: "stars" | "downloads" | "name";
  limit?: number;
  offset?: number;
}

@Injectable()
export class SkillsApiService {
  private readonly logger = new Logger(SkillsApiService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取设置值
   */
  private async getSetting(key: string): Promise<any> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });
    if (!setting || !setting.value) return null;
    try {
      return JSON.parse(setting.value);
    } catch {
      return setting.value;
    }
  }

  /**
   * 设置值
   */
  private async setSetting(key: string, value: any): Promise<void> {
    const stringValue =
      typeof value === "string" ? value : JSON.stringify(value);
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: stringValue },
      create: { key, value: stringValue },
    });
  }

  /**
   * 获取统计数据
   */
  async getStats(): Promise<SkillsStats> {
    const totalSkills =
      (await this.getSetting("skillsmp.totalSkills")) ?? 66541;
    const lastSync = await this.getSetting("skillsmp.lastSync");
    const skills = (await this.getSetting("skillsmp.syncedSkills")) ?? [];

    // Calculate featured count
    const featuredCount = Array.isArray(skills)
      ? skills.filter((s: any) => s.featured).length
      : 0;

    // Get unique categories
    const categories = Array.isArray(skills)
      ? new Set(skills.map((s: any) => s.category))
      : new Set();

    return {
      totalSkills,
      lastUpdated: lastSync,
      weeklyGrowth: 12.5, // TODO: Calculate from timeline data
      featuredCount,
      categoryCount: categories.size,
    };
  }

  /**
   * 获取时间线数据
   */
  async getTimeline(): Promise<TimelineDataPoint[]> {
    // Try to get from stored data
    const storedTimeline = await this.getSetting("skillsmp.timeline");
    if (storedTimeline && Array.isArray(storedTimeline)) {
      return storedTimeline;
    }

    // Generate realistic trend data if not available
    const data: TimelineDataPoint[] = [];
    let cumulative = 0;
    const baseDate = new Date("2024-11-01");
    const counts = [
      2500, 3200, 4100, 5800, 7200, 9500, 12000, 18000, 28000, 38000, 45000,
      52000,
    ];

    for (let i = 0; i < counts.length; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i * 7);
      const count = counts[i];
      cumulative += count;
      data.push({
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        count,
        cumulative,
      });
    }

    return data;
  }

  /**
   * 搜索 Skills
   */
  async searchSkills(params: SearchParams): Promise<{
    skills: SkillItem[];
    total: number;
  }> {
    let skills = (await this.getSetting("skillsmp.syncedSkills")) ?? [];

    if (!Array.isArray(skills)) {
      skills = [];
    }

    // Filter by query
    if (params.query) {
      const q = params.query.toLowerCase();
      skills = skills.filter(
        (s: any) =>
          s.name?.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.tags?.some((t: string) => t.toLowerCase().includes(q)),
      );
    }

    // Filter by category
    if (params.category && params.category !== "all") {
      skills = skills.filter((s: any) => s.category === params.category);
    }

    // Sort
    const sortBy = params.sortBy || "stars";
    skills.sort((a: any, b: any) => {
      if (sortBy === "stars") {
        return (b.stars || 0) - (a.stars || 0);
      }
      if (sortBy === "downloads") {
        const parseDownloads = (d?: string) => {
          if (!d) return 0;
          return (
            parseFloat(d.replace(/[^0-9.]/g, "")) *
            (d.includes("M") ? 1000000 : d.includes("K") ? 1000 : 1)
          );
        };
        return parseDownloads(b.downloads) - parseDownloads(a.downloads);
      }
      return (a.name || "").localeCompare(b.name || "");
    });

    const total = skills.length;
    const offset = params.offset || 0;
    const limit = params.limit || 50;

    return {
      skills: skills.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * 获取热门 Skills
   */
  async getPopularSkills(limit: number = 50): Promise<SkillItem[]> {
    const result = await this.searchSkills({ sortBy: "stars", limit });
    return result.skills;
  }

  /**
   * 获取精选 Skills
   */
  async getFeaturedSkills(limit: number = 20): Promise<SkillItem[]> {
    let skills = (await this.getSetting("skillsmp.syncedSkills")) ?? [];

    if (!Array.isArray(skills)) {
      return [];
    }

    return skills
      .filter((s: any) => s.featured)
      .sort((a: any, b: any) => (b.stars || 0) - (a.stars || 0))
      .slice(0, limit);
  }

  /**
   * 获取所有分类
   */
  async getCategories(): Promise<
    Array<{ id: string; name: string; count: number }>
  > {
    let skills = (await this.getSetting("skillsmp.syncedSkills")) ?? [];

    if (!Array.isArray(skills)) {
      return [];
    }

    const categoryMap = new Map<string, number>();
    for (const skill of skills) {
      const category = skill.category || "other";
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    }

    return Array.from(categoryMap.entries()).map(([id, count]) => ({
      id,
      name: this.formatCategoryName(id),
      count,
    }));
  }

  /**
   * 格式化分类名称
   */
  private formatCategoryName(id: string): string {
    const names: Record<string, string> = {
      tools: "Tools",
      development: "Development",
      testing: "Testing",
      documentation: "Documentation",
      database: "Database",
      devops: "DevOps",
      security: "Security",
      "ai-agents": "AI Agents",
      other: "Other",
    };
    return names[id] || id.charAt(0).toUpperCase() + id.slice(1);
  }

  /**
   * 从 SkillsMP 同步数据
   */
  async syncFromSkillsMP(): Promise<{
    success: boolean;
    message: string;
    skillsCount?: number;
  }> {
    try {
      const apiKey = await this.getSetting("skillsmp.apiKey");

      if (!apiKey) {
        return {
          success: false,
          message: "未配置 SkillsMP API Key",
        };
      }

      this.logger.log("Starting SkillsMP sync...");

      // Fetch skills from SkillsMP API
      // API requires 'q' parameter for search
      const response = await fetch(
        "https://skillsmp.com/api/v1/skills/search?q=*&limit=100",
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "DeepDive-Engine/1.0",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`SkillsMP API response: ${errorText}`);
        throw new Error(
          `SkillsMP API error: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json();

      // Transform and store skills
      const skills = this.transformSkillsData(data.skills || []);

      await this.setSetting("skillsmp.syncedSkills", skills);
      await this.setSetting("skillsmp.lastSync", new Date().toISOString());
      await this.setSetting(
        "skillsmp.totalSkills",
        data.total || skills.length,
      );

      // Fetch and store timeline data if available
      try {
        const timelineResponse = await fetch(
          "https://skillsmp.com/api/v1/stats/timeline",
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (timelineResponse.ok) {
          const timelineData = await timelineResponse.json();
          if (timelineData.timeline) {
            await this.setSetting("skillsmp.timeline", timelineData.timeline);
          }
        }
      } catch (timelineError) {
        this.logger.warn("Failed to fetch timeline data, using generated data");
      }

      this.logger.log(`SkillsMP sync completed: ${skills.length} skills`);

      return {
        success: true,
        message: `成功同步 ${skills.length} 个 Skills`,
        skillsCount: skills.length,
      };
    } catch (error) {
      this.logger.error(`SkillsMP sync failed: ${(error as Error).message}`);
      return {
        success: false,
        message: `同步失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 转换 SkillsMP API 数据格式
   */
  private transformSkillsData(rawSkills: any[]): SkillItem[] {
    return rawSkills.map((skill, index) => ({
      id:
        skill.id ||
        skill.name?.toLowerCase().replace(/\s+/g, "-") ||
        `skill-${index}`,
      name: skill.name || "Unknown Skill",
      description: skill.description || "",
      category: this.mapCategory(skill.category || skill.tags?.[0] || "other"),
      author: skill.author || skill.owner || "unknown",
      stars: skill.stars || skill.rating || 0,
      downloads: this.formatDownloads(skill.downloads || 0),
      tags: skill.tags || [],
      featured: skill.featured || skill.stars > 10000 || false,
      url:
        skill.url ||
        skill.github_url ||
        `https://skillsmp.com/skills/${skill.id}`,
      lastUpdated:
        skill.updated_at || skill.lastUpdated || new Date().toISOString(),
    }));
  }

  /**
   * 映射分类
   */
  private mapCategory(category: string): string {
    const categoryMap: Record<string, string> = {
      tool: "tools",
      tools: "tools",
      dev: "development",
      development: "development",
      coding: "development",
      test: "testing",
      testing: "testing",
      docs: "documentation",
      documentation: "documentation",
      db: "database",
      database: "database",
      ops: "devops",
      devops: "devops",
      ci: "devops",
      cd: "devops",
      security: "security",
      sec: "security",
      ai: "ai-agents",
      agent: "ai-agents",
      "ai-agents": "ai-agents",
      llm: "ai-agents",
    };

    return categoryMap[category.toLowerCase()] || "other";
  }

  /**
   * 格式化下载数
   */
  private formatDownloads(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M+`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(0)}K+`;
    }
    return `${count}+`;
  }
}
