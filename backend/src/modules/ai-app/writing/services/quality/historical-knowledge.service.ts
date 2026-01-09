/**
 * HistoricalKnowledgeService - 历史知识库服务
 *
 * 核心职责：
 * - 管理历史朝代知识（称谓、服饰、礼仪、官制等）
 * - 检测内容中的历史错误
 * - 提供正确用法建议
 * - 初始化常见朝代知识
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

// ==================== 类型定义 ====================

/**
 * 历史知识条目
 */
export interface HistoricalKnowledgeEntry {
  dynasty: string;
  category: string;
  term: string;
  definition: string;
  correctUsage?: string;
  wrongUsage?: string;
  examples: string[];
}

/**
 * 历史错误检测结果
 */
export interface HistoricalErrorResult {
  hasErrors: boolean;
  errors: Array<{
    term: string;
    type: "anachronism" | "wrong_usage" | "mixed_dynasty";
    description: string;
    correctTerm?: string;
    suggestion: string;
  }>;
}

// ==================== 预设知识数据 ====================

/**
 * 明朝历史知识
 */
const MING_DYNASTY_KNOWLEDGE: HistoricalKnowledgeEntry[] = [
  // 称谓
  {
    dynasty: "明朝",
    category: "称谓",
    term: "皇上",
    definition: "对皇帝的尊称",
    correctUsage: "臣民对皇帝的称呼",
    wrongUsage: '皇帝自称（应用"朕"）',
    examples: ["微臣叩见皇上", "皇上龙体康健"],
  },
  {
    dynasty: "明朝",
    category: "称谓",
    term: "万岁爷",
    definition: "对皇帝的俗称，多用于宫中太监",
    correctUsage: "太监宫女称呼皇帝",
    examples: ["万岁爷驾到", "万岁爷用膳了"],
  },
  {
    dynasty: "明朝",
    category: "称谓",
    term: "娘娘",
    definition: "对皇后、妃嫔的尊称",
    correctUsage: "宫人对后妃的称呼",
    examples: ["皇后娘娘", "贵妃娘娘"],
  },
  {
    dynasty: "明朝",
    category: "称谓",
    term: "老爷",
    definition: "对官员、富商的尊称",
    correctUsage: "仆人对主人的称呼",
    examples: ["老爷请用茶", "回禀老爷"],
  },
  {
    dynasty: "明朝",
    category: "称谓",
    term: "姑娘",
    definition: "对未婚女子的称呼",
    correctUsage: "一般称呼",
    examples: ["这位姑娘", "小姑娘"],
  },
  {
    dynasty: "明朝",
    category: "称谓",
    term: "小姐",
    definition: "对官宦人家女儿的尊称",
    correctUsage: "仆人对小姐的称呼",
    wrongUsage: '明朝"小姐"是正经称呼，不同于现代含义',
    examples: ["大小姐", "二小姐"],
  },

  // 官制
  {
    dynasty: "明朝",
    category: "官制",
    term: "内阁",
    definition: "明朝中枢机构，协助皇帝处理政务",
    correctUsage: "政务讨论场景",
    examples: ["内阁议事", "入阁拜相"],
  },
  {
    dynasty: "明朝",
    category: "官制",
    term: "六部",
    definition: "吏、户、礼、兵、刑、工六部",
    correctUsage: "行政机构",
    examples: ["六部尚书", "吏部考核"],
  },
  {
    dynasty: "明朝",
    category: "官制",
    term: "锦衣卫",
    definition: "皇帝直属的侍卫和情报机构",
    correctUsage: "特务、护卫场景",
    examples: ["锦衣卫指挥使", "锦衣卫缇骑"],
  },
  {
    dynasty: "明朝",
    category: "官制",
    term: "东厂",
    definition: "由太监掌管的特务机构",
    correctUsage: "特务场景",
    examples: ["东厂番子", "东厂提督"],
  },

  // 服饰
  {
    dynasty: "明朝",
    category: "服饰",
    term: "凤冠霞帔",
    definition: "命妇正式礼服",
    correctUsage: "正式场合女性服饰",
    examples: ["凤冠霞帔盛装出席", "身着凤冠霞帔"],
  },
  {
    dynasty: "明朝",
    category: "服饰",
    term: "飞鱼服",
    definition: "锦衣卫专用服饰",
    correctUsage: "锦衣卫装扮",
    examples: ["身着飞鱼服", "飞鱼服配绣春刀"],
  },
  {
    dynasty: "明朝",
    category: "服饰",
    term: "袄裙",
    definition: "明朝女子常服，上袄下裙",
    correctUsage: "日常女性服饰",
    examples: ["一袭淡青袄裙", "换上袄裙"],
  },

  // 礼仪
  {
    dynasty: "明朝",
    category: "礼仪",
    term: "叩首",
    definition: "跪拜礼，头触地",
    correctUsage: "重大场合行礼",
    examples: ["三跪九叩", "叩首谢恩"],
  },
  {
    dynasty: "明朝",
    category: "礼仪",
    term: "万福",
    definition: "女子行礼时的祝词",
    correctUsage: "女子见礼",
    examples: ["福身道万福", "盈盈下拜"],
  },

  // 货币
  {
    dynasty: "明朝",
    category: "货币",
    term: "银两",
    definition: "明朝主要货币单位",
    correctUsage: "交易场景",
    wrongUsage: '避免使用"元"、"块"',
    examples: ["银子", "纹银", "碎银"],
  },
  {
    dynasty: "明朝",
    category: "货币",
    term: "铜钱",
    definition: "小额货币",
    correctUsage: "日常交易",
    examples: ["铜板", "文钱"],
  },
];

/**
 * 清朝历史知识
 */
const QING_DYNASTY_KNOWLEDGE: HistoricalKnowledgeEntry[] = [
  // 称谓
  {
    dynasty: "清朝",
    category: "称谓",
    term: "奴才",
    definition: "满人官员、太监对皇帝的自称",
    correctUsage: "满人对皇帝自称",
    wrongUsage: '汉人官员应自称"臣"',
    examples: ["奴才叩见皇上", "奴才遵旨"],
  },
  {
    dynasty: "清朝",
    category: "称谓",
    term: "主子",
    definition: "奴仆对主人的称呼",
    correctUsage: "满人家奴称呼",
    examples: ["主子吩咐", "给主子请安"],
  },
  {
    dynasty: "清朝",
    category: "称谓",
    term: "格格",
    definition: "清朝亲王、郡王之女的称号",
    correctUsage: "皇族女性称号",
    wrongUsage: "不是所有满族女子都称格格",
    examples: ["和硕格格", "多罗格格"],
  },
  {
    dynasty: "清朝",
    category: "称谓",
    term: "阿哥",
    definition: "皇子的称号",
    correctUsage: "对皇子的称呼",
    examples: ["大阿哥", "四阿哥"],
  },
  {
    dynasty: "清朝",
    category: "称谓",
    term: "贝勒",
    definition: "清朝爵位，位于亲王、郡王之下",
    correctUsage: "爵位称呼",
    examples: ["贝勒爷", "多罗贝勒"],
  },

  // 官制
  {
    dynasty: "清朝",
    category: "官制",
    term: "军机处",
    definition: "清朝最高决策机构",
    correctUsage: "政务场景",
    examples: ["军机大臣", "入值军机"],
  },
  {
    dynasty: "清朝",
    category: "官制",
    term: "八旗",
    definition: "清朝军事组织",
    correctUsage: "军事场景",
    examples: ["八旗子弟", "正黄旗"],
  },

  // 服饰
  {
    dynasty: "清朝",
    category: "服饰",
    term: "旗装",
    definition: "满族女子服饰",
    correctUsage: "满族女性装扮",
    examples: ["一袭旗装", "旗装打扮"],
  },
  {
    dynasty: "清朝",
    category: "服饰",
    term: "顶戴花翎",
    definition: "清朝官员帽饰",
    correctUsage: "官员装扮",
    examples: ["二品顶戴", "赏戴花翎"],
  },
  {
    dynasty: "清朝",
    category: "服饰",
    term: "辫子",
    definition: "清朝男子发式",
    correctUsage: "男子外貌描写",
    examples: ["一条大辫子", "金钱鼠尾"],
  },

  // 礼仪
  {
    dynasty: "清朝",
    category: "礼仪",
    term: "打千",
    definition: "满人特有的问安礼",
    correctUsage: "满人行礼",
    examples: ["打千问安", "屈膝打千"],
  },
  {
    dynasty: "清朝",
    category: "礼仪",
    term: "请安",
    definition: "清朝问候礼节",
    correctUsage: "日常问候",
    examples: ["给主子请安", "请安折"],
  },
];

/**
 * 常见历史错误（跨朝代混用）
 */
const COMMON_ANACHRONISMS: Array<{
  wrongTerm: string;
  correctDynasty: string;
  wrongDynasty: string;
  suggestion: string;
}> = [
  {
    wrongTerm: "军机处",
    correctDynasty: "清朝",
    wrongDynasty: "明朝",
    suggestion: '明朝应使用"内阁"',
  },
  {
    wrongTerm: "奴才",
    correctDynasty: "清朝",
    wrongDynasty: "明朝",
    suggestion: '明朝应使用"臣"或"微臣"',
  },
  {
    wrongTerm: "格格",
    correctDynasty: "清朝",
    wrongDynasty: "明朝",
    suggestion: '明朝应使用"郡主"、"县主"等',
  },
  {
    wrongTerm: "阿哥",
    correctDynasty: "清朝",
    wrongDynasty: "明朝",
    suggestion: '明朝应使用"殿下"、"皇子"',
  },
  {
    wrongTerm: "八旗",
    correctDynasty: "清朝",
    wrongDynasty: "明朝",
    suggestion: "明朝无八旗制度",
  },
  {
    wrongTerm: "辫子",
    correctDynasty: "清朝",
    wrongDynasty: "明朝",
    suggestion: "明朝男子蓄发，不剃头",
  },
  {
    wrongTerm: "锦衣卫",
    correctDynasty: "明朝",
    wrongDynasty: "清朝",
    suggestion: '清朝应使用"粘杆处"或无对应机构',
  },
  {
    wrongTerm: "东厂",
    correctDynasty: "明朝",
    wrongDynasty: "清朝",
    suggestion: "清朝无东厂",
  },
];

// ==================== 服务实现 ====================

@Injectable()
export class HistoricalKnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(HistoricalKnowledgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // 检查是否需要初始化知识库
    const count = await this.prisma.writingHistoricalKnowledge.count();
    if (count === 0) {
      this.logger.log("[HistoricalKnowledge] Initializing knowledge base...");
      await this.initializeKnowledgeBase();
    }
  }

  // ==================== 知识库初始化 ====================

  /**
   * 初始化知识库
   */
  async initializeKnowledgeBase(): Promise<void> {
    const allKnowledge = [...MING_DYNASTY_KNOWLEDGE, ...QING_DYNASTY_KNOWLEDGE];

    for (const entry of allKnowledge) {
      try {
        await this.prisma.writingHistoricalKnowledge.upsert({
          where: {
            dynasty_category_term: {
              dynasty: entry.dynasty,
              category: entry.category,
              term: entry.term,
            },
          },
          create: {
            dynasty: entry.dynasty,
            category: entry.category,
            term: entry.term,
            definition: entry.definition,
            correctUsage: entry.correctUsage,
            wrongUsage: entry.wrongUsage,
            examples: entry.examples,
          },
          update: {
            definition: entry.definition,
            correctUsage: entry.correctUsage,
            wrongUsage: entry.wrongUsage,
            examples: entry.examples,
          },
        });
      } catch (error) {
        this.logger.error(
          `[HistoricalKnowledge] Failed to insert ${entry.term}: ${error}`,
        );
      }
    }

    this.logger.log(
      `[HistoricalKnowledge] Initialized ${allKnowledge.length} entries`,
    );
  }

  // ==================== 知识查询 ====================

  /**
   * 获取指定朝代的所有知识
   */
  async getKnowledgeByDynasty(
    dynasty: string,
  ): Promise<HistoricalKnowledgeEntry[]> {
    const entries = await this.prisma.writingHistoricalKnowledge.findMany({
      where: { dynasty },
    });

    return entries.map((e) => ({
      dynasty: e.dynasty,
      category: e.category,
      term: e.term,
      definition: e.definition,
      correctUsage: e.correctUsage || undefined,
      wrongUsage: e.wrongUsage || undefined,
      examples: e.examples,
    }));
  }

  /**
   * 获取指定分类的知识
   */
  async getKnowledgeByCategory(
    dynasty: string,
    category: string,
  ): Promise<HistoricalKnowledgeEntry[]> {
    const entries = await this.prisma.writingHistoricalKnowledge.findMany({
      where: { dynasty, category },
    });

    return entries.map((e) => ({
      dynasty: e.dynasty,
      category: e.category,
      term: e.term,
      definition: e.definition,
      correctUsage: e.correctUsage || undefined,
      wrongUsage: e.wrongUsage || undefined,
      examples: e.examples,
    }));
  }

  /**
   * 搜索术语
   */
  async searchTerm(term: string): Promise<HistoricalKnowledgeEntry | null> {
    const entry = await this.prisma.writingHistoricalKnowledge.findFirst({
      where: { term },
    });

    if (!entry) return null;

    return {
      dynasty: entry.dynasty,
      category: entry.category,
      term: entry.term,
      definition: entry.definition,
      correctUsage: entry.correctUsage || undefined,
      wrongUsage: entry.wrongUsage || undefined,
      examples: entry.examples,
    };
  }

  // ==================== 历史错误检测 ====================

  /**
   * 检测内容中的历史错误
   */
  async detectHistoricalErrors(
    content: string,
    targetDynasty: string,
  ): Promise<HistoricalErrorResult> {
    const errors: HistoricalErrorResult["errors"] = [];

    // 1. 检测跨朝代术语混用
    for (const anachronism of COMMON_ANACHRONISMS) {
      if (
        content.includes(anachronism.wrongTerm) &&
        targetDynasty === anachronism.wrongDynasty
      ) {
        errors.push({
          term: anachronism.wrongTerm,
          type: "anachronism",
          description: `"${anachronism.wrongTerm}" 是${anachronism.correctDynasty}术语，不适用于${anachronism.wrongDynasty}`,
          suggestion: anachronism.suggestion,
        });
      }
    }

    // 2. 检测目标朝代的错误用法
    const targetKnowledge = await this.getKnowledgeByDynasty(targetDynasty);

    for (const entry of targetKnowledge) {
      if (content.includes(entry.term) && entry.wrongUsage) {
        // 检查是否存在错误用法
        const wrongUsagePatterns = entry.wrongUsage.split("、");
        for (const pattern of wrongUsagePatterns) {
          if (content.includes(pattern)) {
            errors.push({
              term: entry.term,
              type: "wrong_usage",
              description: `"${entry.term}" 的用法可能有误：${entry.wrongUsage}`,
              suggestion: entry.correctUsage || "请查阅正确用法",
            });
            break;
          }
        }
      }
    }

    // 3. 检测现代词汇
    const modernTerms = [
      { term: "OK", suggestion: "好、可以、行" },
      { term: "搞定", suggestion: "办妥、完成" },
      { term: "尴尬", suggestion: "窘迫、不自在" },
      { term: "牛逼", suggestion: "厉害、了得" },
      { term: "给力", suggestion: "有力、得力" },
      { term: "靠谱", suggestion: "可靠、稳妥" },
      { term: "没问题", suggestion: "无妨、可以" },
      { term: "老板", suggestion: "东家、掌柜" },
      { term: "电话", suggestion: "（古代无此物）" },
      { term: "手机", suggestion: "（古代无此物）" },
    ];

    for (const modern of modernTerms) {
      if (content.includes(modern.term)) {
        errors.push({
          term: modern.term,
          type: "anachronism",
          description: `"${modern.term}" 是现代词汇，古代不存在`,
          correctTerm: modern.suggestion,
          suggestion: `请使用古代词汇：${modern.suggestion}`,
        });
      }
    }

    return {
      hasErrors: errors.length > 0,
      errors,
    };
  }

  // ==================== 提示词生成 ====================

  /**
   * 生成历史知识约束提示词
   */
  async generateHistoricalConstraintPrompt(dynasty: string): Promise<string> {
    const knowledge = await this.getKnowledgeByDynasty(dynasty);

    if (knowledge.length === 0) {
      return "";
    }

    const parts: string[] = [`## ${dynasty}历史知识约束\n`];

    // 按分类分组
    const byCategory = new Map<string, HistoricalKnowledgeEntry[]>();
    for (const entry of knowledge) {
      if (!byCategory.has(entry.category)) {
        byCategory.set(entry.category, []);
      }
      byCategory.get(entry.category)!.push(entry);
    }

    for (const [category, entries] of byCategory) {
      parts.push(`### ${category}`);
      for (const entry of entries.slice(0, 10)) {
        let line = `- **${entry.term}**: ${entry.definition}`;
        if (entry.correctUsage) {
          line += ` (${entry.correctUsage})`;
        }
        parts.push(line);
      }
      parts.push("");
    }

    // 添加跨朝代禁忌
    const wrongTerms = COMMON_ANACHRONISMS.filter(
      (a) => a.wrongDynasty === dynasty,
    );

    if (wrongTerms.length > 0) {
      parts.push("### 禁用术语（属于其他朝代）");
      for (const wrong of wrongTerms) {
        parts.push(`- ❌ ${wrong.wrongTerm} → ${wrong.suggestion}`);
      }
    }

    return parts.join("\n");
  }

  // ==================== 知识管理 ====================

  /**
   * 添加新知识条目
   */
  async addKnowledgeEntry(entry: HistoricalKnowledgeEntry): Promise<void> {
    await this.prisma.writingHistoricalKnowledge.create({
      data: {
        dynasty: entry.dynasty,
        category: entry.category,
        term: entry.term,
        definition: entry.definition,
        correctUsage: entry.correctUsage,
        wrongUsage: entry.wrongUsage,
        examples: entry.examples,
      },
    });

    this.logger.log(
      `[HistoricalKnowledge] Added entry: ${entry.dynasty} - ${entry.term}`,
    );
  }

  /**
   * 获取知识库统计
   */
  async getKnowledgeStats(): Promise<{
    totalEntries: number;
    byDynasty: Record<string, number>;
    byCategory: Record<string, number>;
  }> {
    const [total, byDynasty, byCategory] = await Promise.all([
      this.prisma.writingHistoricalKnowledge.count(),
      this.prisma.writingHistoricalKnowledge.groupBy({
        by: ["dynasty"],
        _count: true,
      }),
      this.prisma.writingHistoricalKnowledge.groupBy({
        by: ["category"],
        _count: true,
      }),
    ]);

    const dynastyStats: Record<string, number> = {};
    for (const item of byDynasty) {
      dynastyStats[item.dynasty] = item._count;
    }

    const categoryStats: Record<string, number> = {};
    for (const item of byCategory) {
      categoryStats[item.category] = item._count;
    }

    return {
      totalEntries: total,
      byDynasty: dynastyStats,
      byCategory: categoryStats,
    };
  }
}
