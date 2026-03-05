import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { CreditRule, Prisma } from "@prisma/client";

/**
 * 默认积分规则
 * 基于菜单模块划分，积分约为 Token 消耗的 2 倍
 */
const DEFAULT_RULES = [
  // ============================================
  // AI Ask (AI 问答)
  // ============================================
  {
    moduleType: "ai-ask",
    operationType: "chat",
    baseCredits: 10,
    name: "AI问答对话",
  },
  {
    moduleType: "ai-ask",
    operationType: "rag-chat",
    baseCredits: 20,
    name: "AI知识库问答",
  },
  {
    moduleType: "ai-ask",
    operationType: "regenerate",
    baseCredits: 10,
    name: "重新生成回复",
  },

  // ============================================
  // AI Research (AI 研究 - Deep Research)
  // ============================================
  {
    moduleType: "deep-research",
    operationType: "research-quick",
    baseCredits: 200,
    name: "快速研究",
  },
  {
    moduleType: "deep-research",
    operationType: "research-standard",
    baseCredits: 500,
    name: "标准研究",
  },
  {
    moduleType: "deep-research",
    operationType: "research-deep",
    baseCredits: 1000,
    name: "深度研究",
  },

  // ============================================
  // Topic Research (专题研究)
  // ============================================
  {
    moduleType: "topic-insights",
    operationType: "refresh",
    baseCredits: 2000,
    name: "专题研究刷新",
  },
  {
    moduleType: "topic-insights",
    operationType: "create",
    baseCredits: 500,
    name: "创建专题",
  },
  {
    moduleType: "topic-insights",
    operationType: "ai-edit",
    baseCredits: 50,
    name: "AI编辑报告",
  },
  {
    moduleType: "topic-insights",
    operationType: "research",
    baseCredits: 500,
    name: "专题研究执行",
  },

  // ============================================
  // Notebook Research (笔记本研究)
  // ============================================
  {
    moduleType: "notebook-research",
    operationType: "chat",
    baseCredits: 20,
    name: "笔记本研究对话",
  },

  // ============================================
  // AI Teams (AI 团队)
  // ============================================
  {
    moduleType: "ai-teams",
    operationType: "ai-reply",
    baseCredits: 30,
    name: "AI团队回复",
  },
  {
    moduleType: "ai-teams",
    operationType: "debate",
    baseCredits: 50,
    name: "AI辩论",
  },
  {
    moduleType: "ai-teams",
    operationType: "summary",
    baseCredits: 40,
    name: "团队总结",
  },

  // ============================================
  // AI Office (AI 报告/PPT)
  // ============================================
  {
    moduleType: "ai-office",
    operationType: "generate-ppt",
    baseCredits: 500,
    name: "生成PPT",
  },
  {
    moduleType: "ai-office",
    operationType: "generate-doc",
    baseCredits: 300,
    name: "生成文档",
  },
  {
    moduleType: "ai-office",
    operationType: "rerender-page",
    baseCredits: 50,
    name: "重新渲染页面",
  },

  // ============================================
  // AI Writing (AI 写作)
  // ============================================
  {
    moduleType: "ai-writing",
    operationType: "generate-article",
    baseCredits: 200,
    name: "生成文章",
  },
  {
    moduleType: "ai-writing",
    operationType: "generate-chapter",
    baseCredits: 100,
    name: "生成章节",
  },
  {
    moduleType: "ai-writing",
    operationType: "rewrite",
    baseCredits: 50,
    name: "内容改写",
  },
  {
    moduleType: "ai-writing",
    operationType: "continue",
    baseCredits: 30,
    name: "续写内容",
  },
  {
    moduleType: "ai-writing",
    operationType: "mission-GENERATE_FULL_STORY",
    baseCredits: 500,
    name: "生成完整故事",
  },
  {
    moduleType: "ai-writing",
    operationType: "mission-GENERATE_CHAPTERS",
    baseCredits: 300,
    name: "生成多章节",
  },
  {
    moduleType: "ai-writing",
    operationType: "mission-REWRITE_CHAPTER",
    baseCredits: 100,
    name: "重写章节",
  },
  {
    moduleType: "ai-writing",
    operationType: "mission-REFINE_CHAPTER",
    baseCredits: 80,
    name: "精炼章节",
  },
  {
    moduleType: "ai-writing",
    operationType: "mission-EXPAND_OUTLINE",
    baseCredits: 100,
    name: "扩展大纲",
  },

  // ============================================
  // AI Image (AI 绘画)
  // ============================================
  {
    moduleType: "ai-image",
    operationType: "generate",
    baseCredits: 100,
    name: "生成图片",
  },
  {
    moduleType: "ai-image",
    operationType: "edit",
    baseCredits: 80,
    name: "编辑图片",
  },
  {
    moduleType: "ai-image",
    operationType: "variation",
    baseCredits: 60,
    name: "图片变体",
  },

  // ============================================
  // AI Planning (AI 规划)
  // ============================================
  {
    moduleType: "ai-planning",
    operationType: "execute-phase",
    baseCredits: 300,
    name: "执行规划阶段",
  },
  {
    moduleType: "ai-planning",
    operationType: "utility",
    baseCredits: 5,
    name: "规划辅助调用",
  },

  // ============================================
  // AI Simulation (AI 模拟)
  // ============================================
  {
    moduleType: "ai-simulation",
    operationType: "run",
    baseCredits: 100,
    name: "运行模拟",
  },
  {
    moduleType: "ai-simulation",
    operationType: "analysis",
    baseCredits: 50,
    name: "模拟分析",
  },

  // ============================================
  // AI Social (AI 社交内容)
  // ============================================
  {
    moduleType: "ai-social",
    operationType: "generate-post",
    baseCredits: 30,
    name: "生成社交帖子",
  },
  {
    moduleType: "ai-social",
    operationType: "generate-thread",
    baseCredits: 60,
    name: "生成帖子串",
  },
  {
    moduleType: "ai-social",
    operationType: "adapt-version",
    baseCredits: 20,
    name: "适配平台版本",
  },

  // ============================================
  // Library (资源库 - AI 摘要等)
  // ============================================
  {
    moduleType: "library",
    operationType: "ai-summary",
    baseCredits: 30,
    name: "AI摘要",
  },
  {
    moduleType: "library",
    operationType: "ai-extract",
    baseCredits: 20,
    name: "AI提取",
  },
  {
    moduleType: "library",
    operationType: "ai-explanation",
    baseCredits: 20,
    name: "AI解释",
  },
  {
    moduleType: "library",
    operationType: "ai-classify",
    baseCredits: 15,
    name: "AI智能分类",
  },
  {
    moduleType: "library",
    operationType: "ai-cluster",
    baseCredits: 25,
    name: "AI主题聚类",
  },

  // ============================================
  // Notes (笔记 - AI 操作)
  // ============================================
  {
    moduleType: "notes",
    operationType: "ai-explanation",
    baseCredits: 20,
    name: "AI解释",
  },
  {
    moduleType: "notes",
    operationType: "extract-key-points",
    baseCredits: 15,
    name: "提取要点",
  },
  {
    moduleType: "notes",
    operationType: "find-connections",
    baseCredits: 20,
    name: "发现关联",
  },
  {
    moduleType: "notes",
    operationType: "summarize",
    baseCredits: 25,
    name: "笔记总结",
  },

  // ============================================
  // Collections (收藏集 - AI 操作)
  // ============================================
  {
    moduleType: "collections",
    operationType: "ai-batch-tags",
    baseCredits: 20,
    name: "AI批量标签",
  },
  {
    moduleType: "collections",
    operationType: "ai-smart-classify",
    baseCredits: 25,
    name: "AI智能分类",
  },
  {
    moduleType: "collections",
    operationType: "ai-theme-cluster",
    baseCredits: 30,
    name: "AI主题聚类",
  },
  {
    moduleType: "collections",
    operationType: "ai-summary",
    baseCredits: 20,
    name: "AI收藏摘要",
  },

  // ============================================
  // AI Engine (通用引擎层调用)
  // ============================================
  {
    moduleType: "ai-engine",
    operationType: "chat",
    baseCredits: 10,
    name: "AI引擎通用对话",
  },

  // ============================================
  // Explore (探索 - AI 相关操作)
  // ============================================
  {
    moduleType: "explore",
    operationType: "ai-search",
    baseCredits: 15,
    name: "AI搜索",
  },
  {
    moduleType: "explore",
    operationType: "ai-recommend",
    baseCredits: 10,
    name: "AI推荐",
  },
  {
    moduleType: "explore",
    operationType: "summary",
    baseCredits: 15,
    name: "AI摘要生成",
  },
  {
    moduleType: "explore",
    operationType: "insights",
    baseCredits: 15,
    name: "AI洞察提取",
  },
  {
    moduleType: "explore",
    operationType: "translate",
    baseCredits: 10,
    name: "AI翻译",
  },
];

/**
 * 积分规则服务
 * 负责管理积分消耗规则
 */
@Injectable()
export class CreditRulesService implements OnModuleInit {
  private readonly logger = new Logger(CreditRulesService.name);
  private rulesCache: Map<string, CreditRule> = new Map();

  constructor(private prisma: PrismaService) {}

  /**
   * 模块初始化时加载规则
   */
  async onModuleInit() {
    await this.initializeDefaultRules();
    await this.loadRulesIntoCache();
  }

  /**
   * 初始化默认规则
   * 使用并发执行提升启动性能
   */
  private async initializeDefaultRules() {
    try {
      // 并发执行所有 upsert 操作，而不是顺序执行
      const BATCH_SIZE = 10; // 每批 10 个，避免数据库连接池压力
      const batches: (typeof DEFAULT_RULES)[] = [];

      for (let i = 0; i < DEFAULT_RULES.length; i += BATCH_SIZE) {
        batches.push(DEFAULT_RULES.slice(i, i + BATCH_SIZE));
      }

      for (const batch of batches) {
        await Promise.all(
          batch.map((rule) =>
            this.prisma.creditRule.upsert({
              where: {
                moduleType_operationType: {
                  moduleType: rule.moduleType,
                  operationType: rule.operationType,
                },
              },
              update: {},
              create: {
                ...rule,
                tokenMultiplier: 2.0, // Token 消耗 × 2 计算积分
                modelMultipliers: {},
              },
            }),
          ),
        );
      }
      this.logger.log("Default credit rules initialized");
    } catch (error) {
      this.logger.warn(
        "Failed to initialize default rules, will retry on first access",
      );
    }
  }

  /**
   * 加载规则到缓存
   */
  private async loadRulesIntoCache() {
    try {
      const rules = await this.prisma.creditRule.findMany({
        where: { isActive: true },
      });
      this.rulesCache.clear();
      for (const rule of rules) {
        const key = `${rule.moduleType}:${rule.operationType}`;
        this.rulesCache.set(key, rule);
      }
      this.logger.log(`Loaded ${rules.length} credit rules into cache`);
    } catch (error) {
      this.logger.warn("Failed to load rules into cache");
    }
  }

  /**
   * 获取规则
   */
  async getRule(
    moduleType: string,
    operationType: string,
  ): Promise<CreditRule | null> {
    const key = `${moduleType}:${operationType}`;

    // 先从缓存获取
    if (this.rulesCache.has(key)) {
      return this.rulesCache.get(key)!;
    }

    // 缓存未命中，从数据库获取
    const rule = await this.prisma.creditRule.findUnique({
      where: {
        moduleType_operationType: {
          moduleType,
          operationType,
        },
      },
    });

    if (rule && rule.isActive) {
      this.rulesCache.set(key, rule);
      return rule;
    }

    return null;
  }

  /**
   * 计算积分消耗
   */
  async calculateCredits(
    moduleType: string,
    operationType: string,
    tokenCount?: number,
    modelName?: string,
  ): Promise<number> {
    const rule = await this.getRule(moduleType, operationType);

    if (!rule) {
      // 未找到规则，使用默认值
      this.logger.warn(
        `No rule found for ${moduleType}:${operationType}, using default`,
      );
      return 10;
    }

    let credits = rule.baseCredits;

    // 应用 token 乘数
    if (tokenCount && rule.tokenMultiplier > 0) {
      // 每1000 tokens 按 baseCredits * tokenMultiplier 计算
      const tokenCredits = Math.ceil(
        (tokenCount / 1000) * rule.baseCredits * rule.tokenMultiplier,
      );
      credits = Math.max(credits, tokenCredits);
    }

    // 应用模型乘数
    if (modelName && rule.modelMultipliers) {
      const multipliers = rule.modelMultipliers as Record<string, number>;
      const modelMultiplier = multipliers[modelName] || 1.0;
      credits = Math.ceil(credits * modelMultiplier);
    }

    return credits;
  }

  /**
   * 刷新规则缓存
   */
  async refreshCache() {
    await this.loadRulesIntoCache();
  }

  /**
   * 获取所有规则
   */
  async getAllRules(): Promise<CreditRule[]> {
    return this.prisma.creditRule.findMany({
      orderBy: [{ moduleType: "asc" }, { operationType: "asc" }],
    });
  }

  /**
   * 更新规则
   */
  async updateRule(
    moduleType: string,
    operationType: string,
    data: Partial<
      Pick<
        CreditRule,
        "baseCredits" | "tokenMultiplier" | "modelMultipliers" | "isActive"
      >
    >,
  ): Promise<CreditRule> {
    const rule = await this.prisma.creditRule.update({
      where: {
        moduleType_operationType: {
          moduleType,
          operationType,
        },
      },
      data: data as Prisma.CreditRuleUpdateInput,
    });

    // 更新缓存
    const key = `${moduleType}:${operationType}`;
    if (rule.isActive) {
      this.rulesCache.set(key, rule);
    } else {
      this.rulesCache.delete(key);
    }

    return rule;
  }
}
