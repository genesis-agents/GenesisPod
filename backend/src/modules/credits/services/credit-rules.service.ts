import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CreditRule } from "@prisma/client";

/**
 * 默认积分规则
 */
const DEFAULT_RULES = [
  // AI Ask
  {
    moduleType: "ai-ask",
    operationType: "chat",
    baseCredits: 10,
    name: "AI问答对话",
  },
  {
    moduleType: "ai-ask",
    operationType: "rag-chat",
    baseCredits: 15,
    name: "AI知识库问答",
  },
  // AI Studio
  {
    moduleType: "ai-studio",
    operationType: "research-quick",
    baseCredits: 200,
    name: "快速研究",
  },
  {
    moduleType: "ai-studio",
    operationType: "research-standard",
    baseCredits: 500,
    name: "标准研究",
  },
  {
    moduleType: "ai-studio",
    operationType: "research-deep",
    baseCredits: 1000,
    name: "深度研究",
  },
  // Topic Research (专题研究)
  {
    moduleType: "topic-research",
    operationType: "refresh",
    baseCredits: 2000,
    name: "专题研究刷新",
  },
  // AI Teams
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
  // AI Office
  {
    moduleType: "ai-office",
    operationType: "generate-ppt",
    baseCredits: 300,
    name: "生成PPT",
  },
  {
    moduleType: "ai-office",
    operationType: "generate-doc",
    baseCredits: 200,
    name: "生成文档",
  },
  {
    moduleType: "ai-office",
    operationType: "generate-image",
    baseCredits: 100,
    name: "生成图片",
  },
  // AI Coding
  {
    moduleType: "ai-coding",
    operationType: "code-generate",
    baseCredits: 50,
    name: "代码生成",
  },
  {
    moduleType: "ai-coding",
    operationType: "code-review",
    baseCredits: 30,
    name: "代码审查",
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
   */
  private async initializeDefaultRules() {
    try {
      for (const rule of DEFAULT_RULES) {
        await this.prisma.creditRule.upsert({
          where: {
            moduleType_operationType: {
              moduleType: rule.moduleType,
              operationType: rule.operationType,
            },
          },
          update: {},
          create: {
            ...rule,
            tokenMultiplier: 1.0,
            modelMultipliers: {},
          },
        });
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
      data: data as any,
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
