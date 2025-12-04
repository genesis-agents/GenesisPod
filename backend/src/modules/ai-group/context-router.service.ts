/**
 * ContextRouterService - 智能上下文路由器
 *
 * 基于业界最佳实践：
 * - LangChain: Intent Detection + Context Selection
 * - AutoGen: Session Isolation
 * - RAG: Relevance-based Context Retrieval
 *
 * 核心功能：
 * 1. 检测用户意图
 * 2. 根据意图选择合适的上下文策略
 * 3. 构建最优的 AI 输入
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

// 用户意图类型
export enum UserIntent {
  // 发起新辩论（需要隔离历史）
  START_DEBATE = "START_DEBATE",

  // 基于之前内容操作（需要引用历史）
  SUMMARIZE = "SUMMARIZE", // 总结
  GENERATE_IMAGE = "GENERATE_IMAGE", // 生成图片
  ANALYZE = "ANALYZE", // 分析
  CONTINUE = "CONTINUE", // 继续/追问

  // 普通对话（最近上下文）
  GENERAL_CHAT = "GENERAL_CHAT",
}

// 上下文策略
export enum ContextStrategy {
  // 完全隔离，不使用历史
  ISOLATED = "ISOLATED",

  // 引用最近的辩论/讨论结果
  REFERENCE_RECENT = "REFERENCE_RECENT",

  // 标准上下文（最近N条）
  STANDARD = "STANDARD",

  // 相关性检索（RAG式）
  RELEVANCE_BASED = "RELEVANCE_BASED",
}

// 上下文路由结果
export interface ContextRouteResult {
  intent: UserIntent;
  strategy: ContextStrategy;
  context: ContextMessage[];
  systemPromptAddition?: string;
  metadata?: {
    debateSessionId?: string;
    referenceMessageIds?: string[];
  };
}

// 上下文消息
export interface ContextMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  senderName?: string;
  timestamp: Date;
  isDebateMessage?: boolean;
}

@Injectable()
export class ContextRouterService {
  private readonly logger = new Logger(ContextRouterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 主入口：分析用户意图并路由上下文
   */
  async routeContext(
    topicId: string,
    userMessage: string,
    mentionedAiIds: string[],
  ): Promise<ContextRouteResult> {
    // 1. 检测用户意图
    const intent = this.detectIntent(userMessage, mentionedAiIds);
    this.logger.log(`[ContextRouter] Detected intent: ${intent}`);

    // 2. 根据意图选择策略
    const strategy = this.selectStrategy(intent);
    this.logger.log(`[ContextRouter] Selected strategy: ${strategy}`);

    // 3. 构建上下文
    const context = await this.buildContext(
      topicId,
      userMessage,
      intent,
      strategy,
    );

    // 4. 生成系统提示词补充
    const systemPromptAddition = this.generateSystemPromptAddition(
      intent,
      userMessage,
    );

    return {
      intent,
      strategy,
      context,
      systemPromptAddition,
    };
  }

  /**
   * 检测用户意图
   */
  private detectIntent(content: string, mentionedAiIds: string[]): UserIntent {
    const contentLower = content.toLowerCase();

    // 辩论意图检测（需要@2个AI + 辩论关键词）
    if (mentionedAiIds.length >= 2) {
      const debateKeywords = [
        "辩论",
        "辩一下",
        "辩一辩",
        "辩题",
        "思辨",
        "红蓝",
        "正方反方",
        "PK",
        "pk",
        "debate",
        "对决",
      ];
      if (
        debateKeywords.some((kw) => contentLower.includes(kw.toLowerCase()))
      ) {
        return UserIntent.START_DEBATE;
      }
    }

    // 总结意图
    const summarizeKeywords = [
      "总结",
      "归纳",
      "概括",
      "summary",
      "summarize",
      "小结",
    ];
    if (summarizeKeywords.some((kw) => contentLower.includes(kw))) {
      return UserIntent.SUMMARIZE;
    }

    // 生成图片意图
    const imageKeywords = [
      "生成图",
      "输出图",
      "画图",
      "信息图",
      "图表",
      "可视化",
      "image",
      "picture",
      "diagram",
      "chart",
      "infographic",
    ];
    if (imageKeywords.some((kw) => contentLower.includes(kw))) {
      return UserIntent.GENERATE_IMAGE;
    }

    // 分析意图
    const analyzeKeywords = [
      "分析",
      "评价",
      "评估",
      "对比",
      "analyze",
      "compare",
    ];
    if (analyzeKeywords.some((kw) => contentLower.includes(kw))) {
      return UserIntent.ANALYZE;
    }

    // 继续/追问意图
    const continueKeywords = [
      "继续",
      "接着",
      "然后呢",
      "还有呢",
      "更多",
      "详细",
      "展开",
      "深入",
      "go on",
      "continue",
      "more",
    ];
    if (continueKeywords.some((kw) => contentLower.includes(kw))) {
      return UserIntent.CONTINUE;
    }

    // 引用性关键词（表明需要基于之前内容）
    const referenceKeywords = [
      "上面",
      "之前",
      "刚才",
      "这些",
      "那些",
      "他们的",
      "你们的",
      "观点",
      "结论",
      "论点",
      "above",
      "previous",
      "these",
    ];
    if (referenceKeywords.some((kw) => contentLower.includes(kw))) {
      // 有引用关键词，根据具体动作判断
      if (imageKeywords.some((kw) => contentLower.includes(kw))) {
        return UserIntent.GENERATE_IMAGE;
      }
      if (summarizeKeywords.some((kw) => contentLower.includes(kw))) {
        return UserIntent.SUMMARIZE;
      }
      return UserIntent.ANALYZE;
    }

    return UserIntent.GENERAL_CHAT;
  }

  /**
   * 根据意图选择上下文策略
   */
  private selectStrategy(intent: UserIntent): ContextStrategy {
    switch (intent) {
      case UserIntent.START_DEBATE:
        // 辩论需要完全隔离
        return ContextStrategy.ISOLATED;

      case UserIntent.SUMMARIZE:
      case UserIntent.GENERATE_IMAGE:
      case UserIntent.ANALYZE:
        // 总结/图片/分析需要引用最近内容
        return ContextStrategy.REFERENCE_RECENT;

      case UserIntent.CONTINUE:
        // 继续追问需要标准上下文
        return ContextStrategy.STANDARD;

      case UserIntent.GENERAL_CHAT:
      default:
        return ContextStrategy.STANDARD;
    }
  }

  /**
   * 根据策略构建上下文
   */
  private async buildContext(
    topicId: string,
    _userMessage: string,
    _intent: UserIntent,
    strategy: ContextStrategy,
  ): Promise<ContextMessage[]> {
    switch (strategy) {
      case ContextStrategy.ISOLATED:
        // 完全隔离：只返回用户当前消息
        return [];

      case ContextStrategy.REFERENCE_RECENT:
        // 引用最近内容：获取最近的有价值消息（包括辩论结果）
        return await this.getRecentValueableContext(topicId, 10);

      case ContextStrategy.STANDARD:
        // 标准上下文：最近N条，但过滤掉辩论格式的消息
        return await this.getStandardContext(topicId, 8);

      case ContextStrategy.RELEVANCE_BASED:
        // 相关性检索（未来实现）
        return await this.getStandardContext(topicId, 8);

      default:
        return await this.getStandardContext(topicId, 8);
    }
  }

  /**
   * 获取最近有价值的上下文（用于总结/生成图片等）
   * 包含辩论消息，但会标记并简化
   */
  private async getRecentValueableContext(
    topicId: string,
    limit: number,
  ): Promise<ContextMessage[]> {
    const messages = await this.prisma.topicMessage.findMany({
      where: { topicId, deletedAt: null },
      include: {
        sender: { select: { username: true, fullName: true } },
        aiMember: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit * 2, // 取更多用于筛选
    });

    const result: ContextMessage[] = [];

    for (const msg of messages.reverse()) {
      const isDebate = this.isDebateMessage(msg.content);
      const senderName = msg.sender
        ? msg.sender.fullName || msg.sender.username || "用户"
        : msg.aiMember?.displayName || "AI";

      if (isDebate) {
        // 辩论消息：提取核心观点，不保留格式
        const summary = this.extractDebateSummary(msg.content, senderName);
        result.push({
          id: msg.id,
          role: msg.senderId ? "user" : "assistant",
          content: summary,
          senderName,
          timestamp: msg.createdAt,
          isDebateMessage: true,
        });
      } else {
        result.push({
          id: msg.id,
          role: msg.senderId ? "user" : "assistant",
          content: msg.content,
          senderName,
          timestamp: msg.createdAt,
          isDebateMessage: false,
        });
      }

      if (result.length >= limit) break;
    }

    this.logger.log(
      `[ContextRouter] REFERENCE_RECENT: ${messages.length} -> ${result.length} messages`,
    );

    return result;
  }

  /**
   * 获取标准上下文（普通对话）
   * 过滤掉辩论格式的消息
   */
  private async getStandardContext(
    topicId: string,
    limit: number,
  ): Promise<ContextMessage[]> {
    const messages = await this.prisma.topicMessage.findMany({
      where: { topicId, deletedAt: null },
      include: {
        sender: { select: { username: true, fullName: true } },
        aiMember: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit * 3, // 取更多用于过滤
    });

    const result: ContextMessage[] = [];

    for (const msg of messages.reverse()) {
      // 跳过辩论格式的消息
      if (msg.aiMemberId && this.isDebateMessage(msg.content)) {
        continue;
      }

      const senderName = msg.sender
        ? msg.sender.fullName || msg.sender.username || "用户"
        : msg.aiMember?.displayName || "AI";

      result.push({
        id: msg.id,
        role: msg.senderId ? "user" : "assistant",
        content: msg.content,
        senderName,
        timestamp: msg.createdAt,
        isDebateMessage: false,
      });

      if (result.length >= limit) break;
    }

    this.logger.log(
      `[ContextRouter] STANDARD: ${messages.length} -> ${result.length} messages`,
    );

    return result;
  }

  /**
   * 检测是否为辩论格式的消息
   */
  private isDebateMessage(content: string): boolean {
    const debatePatterns = [
      /辩论主题[：:]/,
      /我方立场[：:]/,
      /正方观点/,
      /反方观点/,
      /核心论点[：:]/,
      /向对方提问/,
      /@[\w\u4e00-\u9fa5\-]+\s*请回应/,
      /@[\w\u4e00-\u9fa5\-]+\s*请继续/,
    ];
    return debatePatterns.some((p) => p.test(content));
  }

  /**
   * 提取辩论消息的核心观点（用于总结等场景）
   */
  private extractDebateSummary(content: string, senderName: string): string {
    // 提取核心论点
    const corePointsMatch = content.match(
      /核心论点[：:]([\s\S]*?)(?=\n\n|\*\*|$)/,
    );
    const stanceMatch = content.match(/我方立场[：:]\s*([^\n]+)/);

    let summary = `${senderName}的观点：`;

    if (stanceMatch) {
      summary += `立场是${stanceMatch[1].trim()}。`;
    }

    if (corePointsMatch) {
      // 简化论点，去掉编号和过多格式
      const points = corePointsMatch[1]
        .replace(/^\d+\.\s*/gm, "")
        .replace(/\*\*/g, "")
        .trim()
        .split("\n")
        .filter((p) => p.trim())
        .slice(0, 3)
        .join("；");
      summary += `主要论点：${points}`;
    }

    return summary || content.substring(0, 200) + "...";
  }

  /**
   * 生成系统提示词补充
   */
  private generateSystemPromptAddition(
    intent: UserIntent,
    _userMessage: string,
  ): string {
    switch (intent) {
      case UserIntent.SUMMARIZE:
        return `
用户希望你总结之前的讨论内容。请：
1. 提取各方的核心观点
2. 归纳主要论据
3. 给出客观的总结
不要重复辩论格式，用简洁的语言总结即可。`;

      case UserIntent.GENERATE_IMAGE:
        return `
用户希望你基于之前的讨论内容生成图片/信息图。请：
1. 提取关键信息和数据
2. 设计清晰的可视化结构
3. 生成图片时突出重点
专注于生成图片，不需要重复辩论内容。`;

      case UserIntent.ANALYZE:
        return `
用户希望你分析之前的讨论内容。请：
1. 客观评价各方观点
2. 指出论证的优缺点
3. 给出你的分析结论
用分析的角度而非辩论的角度回应。`;

      case UserIntent.GENERAL_CHAT:
        return `
【重要】这是一个普通对话请求：
- 直接回应用户的问题，不要主动引入之前的讨论话题
- 不要在回复中主动 @ 其他 AI 成员，除非用户明确要求
- 保持回复简洁友好，专注于当前问题
- 如果用户只是打招呼或简单问候，就正常回应即可，不需要提及群组中的其他内容`;

      default:
        return "";
    }
  }
}
