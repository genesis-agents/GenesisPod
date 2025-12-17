import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MessageContentType } from "@prisma/client";
import { AiChatService, ChatMessage } from "../ai-core/ai-chat.service";
import { SearchService } from "../ai-core/search.service";
import {
  ContextRouterService,
  ContextStrategy,
} from "./context-router.service";
import { ParsedUrl } from "./url-parser.service";

/**
 * Service responsible for generating AI responses in topics
 * Extracted from AiTeamsService to reduce file size and improve maintainability
 */
@Injectable()
export class AiResponseService {
  private readonly logger = new Logger(AiResponseService.name);

  constructor(
    private prisma: PrismaService,
    private aiChatService: AiChatService,
    private searchService: SearchService,
    private contextRouter: ContextRouterService,
  ) {}

  /**
   * 智能上下文管理器 - 对消息进行重要性评分和筛选
   * 确保AI能理解关键对话脉络，而不只是简单取最近N条
   * @param topicId Topic ID
   * @param aiMemberId 当前AI成员ID
   * @param maxMessages 最大消息数
   * @param debateOpponentId 辩论对手ID（如果有）- 用于优先包含对手的最新发言
   */
  async buildSmartContext(
    topicId: string,
    aiMemberId: string,
    maxMessages: number = 15,
    debateOpponentId?: string,
  ): Promise<{
    messages: Array<{
      id: string;
      content: string;
      senderId: string | null;
      aiMemberId: string | null;
      sender: { username: string | null; fullName: string | null } | null;
      aiMember: { displayName: string } | null;
      createdAt: Date;
      score: number;
      parsedUrls?: ParsedUrl[] | null;
      replyTo?: {
        id: string;
        senderId: string | null;
        aiMemberId: string | null;
        content: string;
        sender: { username: string | null; fullName: string | null } | null;
        aiMember: { displayName: string } | null;
      } | null;
    }>;
    summary: string | null;
    parsedUrlsContext: string;
  }> {
    // 1. 获取最近50条消息用于评分（比最终输出多，用于智能筛选）
    const recentMessages = await this.prisma.topicMessage.findMany({
      where: { topicId, deletedAt: null },
      include: {
        sender: { select: { username: true, fullName: true } },
        aiMember: { select: { displayName: true } },
        mentions: {
          select: { aiMemberId: true, userId: true, mentionType: true },
        },
        replyTo: {
          select: {
            id: true,
            senderId: true,
            aiMemberId: true,
            content: true,
            sender: { select: { username: true, fullName: true } },
            aiMember: { select: { displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (recentMessages.length === 0) {
      return { messages: [], summary: null, parsedUrlsContext: "" };
    }

    // 2. 为每条消息计算重要性分数
    const scoredMessages = recentMessages.map((msg, index) => {
      let score = 0;

      // 时间递减分数（最新消息+5分，逐渐递减）
      score += Math.max(0, 5 - index * 0.1);

      // @当前AI的消息 +10分
      const mentionsThisAI = msg.mentions.some(
        (m) => m.aiMemberId === aiMemberId,
      );
      if (mentionsThisAI) score += 10;

      // 被回复的消息 +8分
      const isRepliedTo = recentMessages.some(
        (other) => other.replyTo?.id === msg.id,
      );
      if (isRepliedTo) score += 8;

      // 包含@提及的消息 +3分
      if (msg.mentions.length > 0) score += 3;

      // 用户消息比AI消息稍重要 +2分
      if (msg.senderId) score += 2;

      // 包含问号的消息（可能是问题） +2分
      if (msg.content.includes("?") || msg.content.includes("？")) score += 2;

      // 包含URL的消息 +2分
      if (msg.content.includes("http://") || msg.content.includes("https://")) {
        score += 2;
      }

      // 消息长度适中（100-500字）+1分
      const len = msg.content.length;
      if (len >= 100 && len <= 500) score += 1;

      // 当前AI自己发的消息 +3分（保持对话连贯）
      if (msg.aiMemberId === aiMemberId) score += 3;

      // 【辩论模式优化】对手的消息 +15分（确保能看到对手的最新发言）
      if (debateOpponentId && msg.aiMemberId === debateOpponentId) {
        score += 15;
        // 对手最近的3条消息额外加分
        const opponentMsgs = recentMessages.filter(
          (m) => m.aiMemberId === debateOpponentId,
        );
        const opponentIndex = opponentMsgs.findIndex((m) => m.id === msg.id);
        if (opponentIndex < 3) {
          score += 10 - opponentIndex * 3; // 最新+10，第二新+7，第三新+4
        }
      }

      return {
        ...msg,
        score,
      };
    });

    // 3. 按分数排序，取top N，然后按时间重新排序
    // CRITICAL: Always include the latest user message (it contains the current request!)
    const latestUserMessage = recentMessages.find((m) => m.senderId);

    let topMessages = scoredMessages
      .sort((a, b) => b.score - a.score)
      .slice(0, maxMessages)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Ensure the latest user message is always included
    if (
      latestUserMessage &&
      !topMessages.find((m) => m.id === latestUserMessage.id)
    ) {
      this.logger.log(
        `[SmartContext] Force-adding latest user message: "${latestUserMessage.content.substring(0, 50)}..."`,
      );
      // Add it and re-sort by time
      topMessages = [...topMessages, { ...latestUserMessage, score: 100 }].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
    }

    // 4. 如果消息被截断太多，生成早期消息的摘要
    let summary: string | null = null;
    const droppedCount = recentMessages.length - topMessages.length;
    if (droppedCount > 10) {
      // 获取被丢弃的早期消息的简要摘要
      const droppedMessages = scoredMessages
        .filter((m) => !topMessages.find((t) => t.id === m.id))
        .slice(0, 10);

      if (droppedMessages.length > 0) {
        const participants = [
          ...new Set(
            droppedMessages.map(
              (m) =>
                m.sender?.fullName ||
                m.sender?.username ||
                m.aiMember?.displayName ||
                "Unknown",
            ),
          ),
        ];
        summary = `[Earlier discussion (${droppedCount} messages) involved: ${participants.join(", ")}]`;
      }
    }

    // 5. 收集所有消息中的 parsedUrls，生成 AI 上下文
    const allParsedUrls: ParsedUrl[] = [];
    for (const msg of topMessages) {
      // parsedUrls 存储在数据库中作为 JSON
      const msgParsedUrls = (msg as any).parsedUrls as ParsedUrl[] | null;
      if (msgParsedUrls && Array.isArray(msgParsedUrls)) {
        allParsedUrls.push(...msgParsedUrls);
      }
    }

    // 去重并生成上下文
    const uniqueParsedUrls = allParsedUrls.filter(
      (url, index, self) => index === self.findIndex((u) => u.url === url.url),
    );

    // Generate context from parsed URLs
    let parsedUrlsContext = "";
    if (uniqueParsedUrls.length > 0) {
      const urlSummaries = uniqueParsedUrls
        .map((parsed) => {
          let summary = `**URL**: ${parsed.url}\n`;
          if (parsed.preview?.title)
            summary += `**Title**: ${parsed.preview.title}\n`;
          if (parsed.preview?.description)
            summary += `**Description**: ${parsed.preview.description}\n`;
          if (parsed.extractedContent?.fullText) {
            const contentPreview = parsed.extractedContent.fullText.substring(
              0,
              500,
            );
            summary += `**Content Preview**: ${contentPreview}${parsed.extractedContent.fullText.length > 500 ? "..." : ""}\n`;
          }
          return summary;
        })
        .join("\n---\n\n");

      parsedUrlsContext = `\n\n## Referenced URLs\nThe following URLs were shared in the discussion:\n\n${urlSummaries}`;
    }

    return {
      messages: topMessages.map((m) => ({
        id: m.id,
        content: m.content,
        senderId: m.senderId,
        aiMemberId: m.aiMemberId,
        sender: m.sender,
        aiMember: m.aiMember,
        createdAt: m.createdAt,
        score: m.score,
        parsedUrls: (m as any).parsedUrls as ParsedUrl[] | null,
        replyTo: m.replyTo,
      })),
      summary,
      parsedUrlsContext,
    };
  }

  async generateAIResponse(
    topicId: string,
    _userId: string,
    aiMemberId: string,
    _contextMessageIds: string[],
    debateRole?: {
      role: "red" | "blue";
      opponent: { id: string; displayName: string };
      topic: string;
    } | null,
  ) {
    const aiMember = await this.prisma.topicAIMember.findFirst({
      where: { id: aiMemberId, topicId },
      select: {
        id: true,
        aiModel: true,
        displayName: true,
        avatar: true,
        roleDescription: true,
        systemPrompt: true,
        contextWindow: true,
        capabilities: true,
        canMentionOtherAI: true,
        collaborationStyle: true,
      },
    });

    if (!aiMember) {
      throw new NotFoundException("AI member not found");
    }

    // 使用智能上下文管理器获取消息
    const MAX_CONTEXT_MESSAGES = 30;
    const debateOpponentId = debateRole?.opponent?.id;
    const smartContext = await this.buildSmartContext(
      topicId,
      aiMemberId,
      Math.min(aiMember.contextWindow || 20, MAX_CONTEXT_MESSAGES),
      debateOpponentId,
    );

    const contextMessages = smartContext.messages;
    const contextSummary = smartContext.summary;
    const parsedUrlsContext = smartContext.parsedUrlsContext;

    // 构建Prompt
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      select: { name: true, description: true },
    });

    // 获取Topic关联的资源内容作为上下文
    const topicResources = await this.prisma.topicResource.findMany({
      where: { topicId },
      include: {
        resource: {
          select: {
            title: true,
            abstract: true,
            sourceUrl: true,
            type: true,
          },
        },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    });

    // 构建资源上下文
    let resourceContext = "";
    if (topicResources.length > 0) {
      const resourceSummaries = topicResources
        .filter((tr) => tr.resource)
        .map((tr) => {
          const r = tr.resource!;
          let summary = `- **${r.title || tr.name}**`;
          if (r.sourceUrl) summary += ` (${r.sourceUrl})`;
          if (r.abstract) {
            const abstractPreview = r.abstract.substring(0, 300);
            summary += `\n  ${abstractPreview}${r.abstract.length > 300 ? "..." : ""}`;
          }
          return summary;
        })
        .join("\n\n");

      if (resourceSummaries) {
        resourceContext = `\n\n## Reference Materials\nThe following resources have been shared in this discussion group. Use them to provide more informed responses:\n\n${resourceSummaries}`;
      }
    }

    // 检测是否需要搜索实时信息或抓取URL
    const recentUserMessages = contextMessages
      .filter((m) => m.senderId)
      .slice(0, 5);
    let searchContext = "";
    let urlContext = "";

    // 1. 从最近的用户消息中提取所有URL
    const allUrls: string[] = [];
    for (const msg of recentUserMessages) {
      const messageSample = msg.content.substring(0, 10000);
      const urls = this.searchService.extractUrls(messageSample);
      allUrls.push(...urls);
    }
    const uniqueUrls = [...new Set(allUrls)].slice(0, 2);

    if (uniqueUrls.length > 0) {
      this.logger.log(
        `Found ${uniqueUrls.length} URLs in recent messages, fetching content...`,
      );
      urlContext = await this.searchService.fetchUrlsForContext(uniqueUrls);
      if (urlContext) {
        this.logger.log(`Added URL content to context`);
      }
    }

    // 2. 检测是否需要搜索实时信息（仅当没有URL时才搜索）
    const lastUserMessage = recentUserMessages[0];
    if (
      lastUserMessage &&
      !urlContext &&
      this.shouldSearchForInfo(lastUserMessage.content)
    ) {
      this.logger.log(
        `Searching for real-time info: "${lastUserMessage.content.substring(0, 100)}..."`,
      );
      const searchResults = await this.searchService.search(
        lastUserMessage.content,
        5,
      );
      if (searchResults.success && searchResults.results.length > 0) {
        searchContext =
          "\n\n" +
          this.searchService.formatResultsForContext(searchResults.results);
        this.logger.log(
          `Added ${searchResults.results.length} search results to context`,
        );
      }
    }

    // 构建上下文摘要部分
    const contextSummarySection = contextSummary
      ? `\n\n## Earlier Discussion Context\n${contextSummary}`
      : "";

    // ==================== 辩论模式处理 ====================
    let debatePrompt = "";

    if (debateRole) {
      const isRedTeam = debateRole.role === "red";
      const opponentName = debateRole.opponent.displayName;
      const debateTopic = debateRole.topic;
      const myName = aiMember.displayName;

      this.logger.log(
        `[Debate Mode] Using Controller-assigned role: AI=${myName}, role=${isRedTeam ? "红方/正方" : "蓝方/反方"}, opponent=${opponentName}, topic=${debateTopic}`,
      );

      // 过滤上下文消息
      const filteredContextMessages = contextMessages.filter((msg) => {
        if (msg.senderId) return true;
        if (msg.aiMemberId === debateRole.opponent.id) return true;
        if (msg.aiMemberId === aiMemberId) return true;
        return false;
      });

      const recentContextMessages = filteredContextMessages.slice(-5);

      this.logger.log(
        `[Debate Mode] Context filtered: ${contextMessages.length} -> ${recentContextMessages.length} messages`,
      );

      contextMessages.length = 0;
      contextMessages.push(...recentContextMessages);

      if (isRedTeam) {
        debatePrompt = `
#############################################
#  🔴 辩论系统指令 - 你是【红方/正方】       #
#############################################

【最高优先级指令 - 必须严格遵守】

## 当前辩论主题（唯一主题）
# >>> ${debateTopic} <<<
你只能讨论这个主题，禁止讨论任何其他话题！

## 你的身份
- 你是：${myName}
- 角色：红方/正方辩手
- 对手：${opponentName}

## 强制规则
1. 你的立场是【正方/支持】
2. 只讨论【${debateTopic}】，不讨论其他任何话题
3. 如果历史消息中有其他辩题（如"AI取代人类"等），完全忽略
4. 发言结尾必须 @${opponentName}

## 发言格式
**辩论主题**：${debateTopic}
**我方立场**：正方/支持 [表态]
**核心论点**：[2-3个论点]
**数据佐证**：[证据来源]
**向对方提问**：[问题]

@${opponentName} 请回应
`;
      } else {
        debatePrompt = `
#############################################
#  🔵 辩论系统指令 - 你是【蓝方/反方】       #
#############################################

【最高优先级指令 - 必须严格遵守】

## 当前辩论主题（唯一主题）
# >>> ${debateTopic} <<<
你只能讨论这个主题，禁止讨论任何其他话题！

## 你的身份
- 你是：${myName}
- 角色：蓝方/反方辩手
- 对手：${opponentName}

## 强制规则
1. 你的立场是【反方/反对】
2. 只讨论【${debateTopic}】，不讨论其他任何话题
3. 如果历史消息中有其他辩题（如"AI取代人类"等），完全忽略
4. 必须针对 ${opponentName} 的观点进行反驳
5. 发言结尾必须 @${opponentName}

## 发言格式
**辩论主题**：${debateTopic}
**对方观点问题**：[指出对方问题]
**我方反驳**：[2-3个反驳点]
**反面证据**：[证据来源]
**质疑点**：[尖锐问题]

@${opponentName} 请继续
`;
      }
    }

    // AI-AI协作
    let aiCollaborationPrompt = "";
    if (aiMember.canMentionOtherAI) {
      const otherAIs = await this.prisma.topicAIMember.findMany({
        where: {
          topicId,
          id: { not: aiMemberId },
        },
        select: {
          displayName: true,
          roleDescription: true,
        },
      });

      if (otherAIs.length > 0) {
        const aiList = otherAIs
          .map(
            (ai) =>
              `- @${ai.displayName}${ai.roleDescription ? ` (${ai.roleDescription})` : ""}`,
          )
          .join("\n");
        aiCollaborationPrompt = `\n\n## AI 协作功能（重要）

你可以通过 @AI名称 来触发其他 AI 助手响应。当你在回复中写 "@AI-Name" 时，系统会**自动调用该 AI 的 API**，他们**会真实地生成响应**。

**这不是文本装饰，是真实的函数调用！**

可以调用的 AI 助手：
${aiList}

**使用方法：**
- 在回复中任意位置写 "@AI-Name" 即可触发
- 被@的 AI 会看到你的消息并生成回复
- 你可以向他们提问、请求专业意见、或进行辩论

**示例：**
"关于这个技术方案，@AI-Claude 你有什么看法？"
→ 系统会自动触发 AI-Claude 生成响应

**注意：** 最大递归深度为 3 轮，避免无限循环。`;
      }
    }

    const combinedUrlContext = parsedUrlsContext || urlContext;

    const systemPrompt = debatePrompt
      ? `You are ${aiMember.displayName}.
${debatePrompt}
${contextSummarySection}${resourceContext}${combinedUrlContext}${searchContext}`
      : aiMember.systemPrompt ||
        `You are ${aiMember.displayName}, an AI assistant participating in a group discussion.
${aiMember.roleDescription ? `Your role: ${aiMember.roleDescription}` : ""}
You are in a discussion group called "${topic?.name}".
${topic?.description ? `Group description: ${topic.description}` : ""}${contextSummarySection}${resourceContext}${combinedUrlContext}${searchContext}${aiCollaborationPrompt}

Respond naturally and helpfully to the discussion. When relevant, reference the shared materials, fetched web content, and search results to provide accurate, up-to-date information. Keep your responses concise but informative.`;

    // 使用 ContextRouter 智能路由上下文
    const userMessages = contextMessages.filter((m) => m.senderId);
    const lastUserMsg = userMessages[userMessages.length - 1];
    const userMessageContent = lastUserMsg?.content || "";

    this.logger.log(
      `[ContextRouter] Last user message: "${userMessageContent.substring(0, 100)}..."`,
    );

    const routeResult = await this.contextRouter.routeContext(
      topicId,
      userMessageContent,
      [],
    );

    this.logger.log(
      `[ContextRouter] Intent: ${routeResult.intent}, Strategy: ${routeResult.strategy}`,
    );

    let filteredContextMessages = contextMessages;
    let intentSystemPrompt = "";

    if (!debateRole) {
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

      const isDebateMessage = (content: string): boolean => {
        return debatePatterns.some((pattern) => pattern.test(content));
      };

      const extractDebateSummary = (
        content: string,
        senderName: string,
      ): string => {
        const corePointsMatch = content.match(
          /核心论点[：:]([\s\S]*?)(?=\n\n|\*\*|$)/,
        );
        const stanceMatch = content.match(/我方立场[：:]\s*([^\n]+)/);

        let summary = `【${senderName}的观点】`;
        if (stanceMatch) {
          summary += `立场：${stanceMatch[1].trim()}。`;
        }
        if (corePointsMatch) {
          const points = corePointsMatch[1]
            .replace(/^\d+\.\s*/gm, "")
            .replace(/\*\*/g, "")
            .trim()
            .split("\n")
            .filter((p) => p.trim())
            .slice(0, 3)
            .join("；");
          summary += `论点：${points}`;
        }
        return summary || content.substring(0, 200) + "...";
      };

      switch (routeResult.strategy) {
        case ContextStrategy.REFERENCE_RECENT:
          this.logger.log(`[ContextRouter] Using REFERENCE_RECENT strategy`);
          filteredContextMessages = contextMessages.map((msg) => {
            if (msg.aiMemberId && isDebateMessage(msg.content)) {
              const senderName = msg.aiMember?.displayName || "AI";
              return {
                ...msg,
                content: extractDebateSummary(msg.content, senderName),
              };
            }
            return msg;
          });
          const MAX_REF_CONTEXT = 12;
          if (filteredContextMessages.length > MAX_REF_CONTEXT) {
            filteredContextMessages =
              filteredContextMessages.slice(-MAX_REF_CONTEXT);
          }
          intentSystemPrompt = routeResult.systemPromptAddition || "";
          break;

        case ContextStrategy.STANDARD:
        default:
          this.logger.log(`[ContextRouter] Using STANDARD strategy`);

          let standardFiltered = contextMessages.filter((msg) => {
            if (msg.senderId) return true;
            if (msg.aiMemberId && isDebateMessage(msg.content)) {
              this.logger.log(
                `[Context Filter] Removing debate message from ${msg.aiMember?.displayName || "AI"}`,
              );
              return false;
            }
            return true;
          });

          const userMessagesInContext = standardFiltered.filter(
            (m) => m.senderId,
          );
          const latestUserMsgForContext =
            userMessagesInContext[userMessagesInContext.length - 1];

          const MAX_NORMAL_CONTEXT = 6;
          if (standardFiltered.length > MAX_NORMAL_CONTEXT) {
            const recentMessages = standardFiltered.slice(-MAX_NORMAL_CONTEXT);

            if (
              latestUserMsgForContext &&
              !recentMessages.find((m) => m.id === latestUserMsgForContext.id)
            ) {
              recentMessages.shift();
              recentMessages.push(latestUserMsgForContext);
              recentMessages.sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
              );
            }
            standardFiltered = recentMessages;
          }

          if (latestUserMsgForContext) {
            const lastMsg = standardFiltered[standardFiltered.length - 1];
            if (lastMsg && lastMsg.id !== latestUserMsgForContext.id) {
              standardFiltered = standardFiltered.filter(
                (m) => m.id !== latestUserMsgForContext.id,
              );
              standardFiltered.push(latestUserMsgForContext);
            }
          }

          filteredContextMessages = standardFiltered;

          this.logger.log(
            `[STANDARD] Latest user msg: "${latestUserMsgForContext?.content.substring(0, 50)}..."`,
          );
          break;
      }

      this.logger.log(
        `[ContextRouter] Context: ${contextMessages.length} -> ${filteredContextMessages.length} messages`,
      );
    }

    let finalSystemPrompt = systemPrompt;
    if (intentSystemPrompt) {
      finalSystemPrompt = systemPrompt + "\n\n" + intentSystemPrompt;
    }

    // Build chat messages for AI service
    const MAX_MESSAGE_LENGTH = 4000;

    const missionMessagePatterns = [
      /^\[任务规划\]/,
      /^\[任务分解\]/,
      /^\[任务分配\]/,
      /^\[任务进度\]/,
      /^\[开始工作\]/,
      /^\[工作汇报\]/,
      /^\[任务修改\]/,
      /^\[结果整合\]/,
      /^\[最终交付\]/,
      /^\[Leader反馈\]/,
      /^\[Mission\]/i,
      /^\[AgentTask\]/i,
      /\(本报告由.*共同完成.*\)/,
      /\*\(系统提示[：:].*任务流.*\)\*/,
      /^🚀\s*\*\*团队任务已创建\*\*/,
      /^📋\s*\[任务分配\]/,
      /^❌\s*任务.*失败/,
      /^❌\s*任务执行出错/,
    ];

    const isMissionSystemMessage = (content: string): boolean => {
      const trimmedContent = content.trim();
      if (
        missionMessagePatterns.some((pattern) => pattern.test(trimmedContent))
      ) {
        return true;
      }
      if (
        trimmedContent.includes("[任务分解]") ||
        trimmedContent.includes("[工作汇报]") ||
        trimmedContent.includes("[最终交付]") ||
        trimmedContent.includes("[Leader反馈]") ||
        trimmedContent.includes("[结果整合]")
      ) {
        return true;
      }
      return false;
    };

    let normalContextMessages = filteredContextMessages.filter((msg) => {
      if (isMissionSystemMessage(msg.content)) {
        this.logger.log(
          `[Context Filter] Removing mission message: "${msg.content.substring(0, 50)}..."`,
        );
        return false;
      }
      return true;
    });

    this.logger.log(
      `[Context Filter] After mission filter: ${filteredContextMessages.length} -> ${normalContextMessages.length} messages`,
    );

    // ========== Context Size Management ==========
    // Best practice: Limit both message count AND total context size
    // to prevent exceeding model's context window

    // 1. Limit message count to last 25 messages (keep most recent context)
    const MAX_CHAT_CONTEXT_MESSAGES = 25;
    if (normalContextMessages.length > MAX_CHAT_CONTEXT_MESSAGES) {
      this.logger.log(
        `[Context Management] Trimming messages: ${normalContextMessages.length} -> ${MAX_CHAT_CONTEXT_MESSAGES}`,
      );
      normalContextMessages = normalContextMessages.slice(
        -MAX_CHAT_CONTEXT_MESSAGES,
      );
    }

    // 2. Calculate and limit total context size
    // Roughly 4 chars = 1 token, target ~30k tokens = ~120k chars for context
    // Leave room for system prompt (~5k) and response (~8k tokens)
    const MAX_TOTAL_CONTEXT_CHARS = 100000;
    let totalContextChars = normalContextMessages.reduce(
      (sum, m) => sum + m.content.length,
      0,
    );

    // If still too large, progressively trim oldest messages
    while (
      totalContextChars > MAX_TOTAL_CONTEXT_CHARS &&
      normalContextMessages.length > 3
    ) {
      const removed = normalContextMessages.shift();
      if (removed) {
        totalContextChars -= removed.content.length;
        this.logger.log(
          `[Context Management] Removed oldest message (${removed.content.length} chars), remaining: ${normalContextMessages.length} messages, ${totalContextChars} chars`,
        );
      }
    }

    this.logger.log(
      `[Context Management] Final context: ${normalContextMessages.length} messages, ~${Math.round(totalContextChars / 4)} tokens`,
    );

    const chatMessages: ChatMessage[] = normalContextMessages.map((m) => {
      const senderName = m.sender
        ? m.sender.fullName || m.sender.username || "User"
        : m.aiMember?.displayName || "AI";
      const isAI = !!m.aiMemberId;

      let content = m.content;

      if (m.replyTo && m.replyTo.content) {
        const replyToSender = m.replyTo.sender
          ? m.replyTo.sender.fullName || m.replyTo.sender.username || "User"
          : m.replyTo.aiMember?.displayName || "AI";
        const quotedContent =
          m.replyTo.content.length > 500
            ? m.replyTo.content.substring(0, 500) + "..."
            : m.replyTo.content;
        content = `[引用 ${replyToSender} 的消息: "${quotedContent}"]\n\n${m.content}`;
      }

      if (content.length > MAX_MESSAGE_LENGTH) {
        content =
          content.substring(0, MAX_MESSAGE_LENGTH) +
          "\n\n[Message truncated due to length...]";
        this.logger.warn(
          `Message ${m.id} truncated from ${m.content.length} to ${MAX_MESSAGE_LENGTH} chars`,
        );
      }

      return {
        role: isAI ? "assistant" : "user",
        content,
        name: senderName,
      } as ChatMessage;
    });

    // Get AI model configuration
    this.logger.log(
      `[AI Model Lookup] aiMember.aiModel = "${aiMember.aiModel}", displayName = "${aiMember.displayName}"`,
    );

    let aiModelConfig = await this.prisma.aIModel.findFirst({
      where: {
        modelId: {
          equals: aiMember.aiModel,
          mode: "insensitive",
        },
        isEnabled: true,
      },
      select: {
        id: true,
        name: true,
        modelId: true,
        provider: true,
        apiKey: true,
        apiEndpoint: true,
        temperature: true,
        isEnabled: true,
      },
    });

    this.logger.log(
      `[AI Model Lookup] By modelId "${aiMember.aiModel}": ${aiModelConfig ? `found (id=${aiModelConfig.id}, hasApiKey=${!!aiModelConfig.apiKey})` : "NOT FOUND"}`,
    );

    // Fallback to name lookup
    if (!aiModelConfig) {
      this.logger.log(
        `[AI Model Lookup] Falling back to name lookup: "${aiMember.aiModel}"`,
      );
      aiModelConfig = await this.prisma.aIModel.findFirst({
        where: {
          name: {
            equals: aiMember.aiModel,
            mode: "insensitive",
          },
          isEnabled: true,
        },
        select: {
          id: true,
          name: true,
          modelId: true,
          provider: true,
          apiKey: true,
          apiEndpoint: true,
          temperature: true,
          isEnabled: true,
        },
      });
    }

    // Call AI service
    this.logger.log(
      `Generating AI response for topic ${topicId} using ${aiMember.aiModel}`,
    );
    let aiResponse: string;
    let tokensUsed = 0;

    try {
      let result;

      let apiKey: string | null = null;
      let apiKeySource = "none";

      if (aiModelConfig?.apiKey) {
        apiKey = aiModelConfig.apiKey;
        apiKeySource = "database";
      } else {
        const provider = aiModelConfig?.provider?.toLowerCase() || "";
        const modelIdLower = aiMember.aiModel.toLowerCase();

        let envKeyName: string | null = null;
        if (provider === "xai" || modelIdLower.includes("grok")) {
          envKeyName = "XAI_API_KEY";
        } else if (
          provider === "openai" ||
          modelIdLower.includes("gpt") ||
          modelIdLower.startsWith("o1") ||
          modelIdLower.startsWith("o3")
        ) {
          envKeyName = "OPENAI_API_KEY";
        } else if (
          provider === "anthropic" ||
          modelIdLower.includes("claude")
        ) {
          envKeyName = "ANTHROPIC_API_KEY";
        } else if (provider === "google" || modelIdLower.includes("gemini")) {
          envKeyName = "GOOGLE_AI_API_KEY";
        }

        if (envKeyName && process.env[envKeyName]) {
          apiKey = process.env[envKeyName] as string;
          apiKeySource = `env:${envKeyName}`;
        }
      }

      this.logger.log(
        `API key source for ${aiMember.aiModel}: ${apiKeySource}, hasKey=${!!apiKey}`,
      );

      if (apiKey) {
        const provider = aiModelConfig?.provider || aiMember.aiModel;
        const modelId =
          aiModelConfig?.modelId || this.getDefaultModelId(aiMember.aiModel);
        const apiEndpoint =
          aiModelConfig?.apiEndpoint ||
          this.getDefaultEndpoint(aiMember.aiModel);

        // Determine max_tokens based on model capabilities
        // Reasoning models and large context models can handle more output
        const isReasoningModel =
          modelId.includes("gpt-5") ||
          modelId.startsWith("o1") ||
          modelId.startsWith("o3") ||
          modelId.includes("gemini-3-pro");
        const isLargeModel =
          modelId.includes("gpt-4") ||
          modelId.includes("claude") ||
          modelId.includes("gemini");

        // Increased max_tokens to prevent truncation in team conversations
        // - Reasoning models: 8192 tokens (complex multi-step tasks)
        // - Large models: 4096 tokens (standard conversations)
        // - Other models: 2048 tokens (simpler responses)
        const effectiveMaxTokens = isReasoningModel
          ? 8192
          : isLargeModel
            ? 4096
            : 2048;

        this.logger.log(
          `Calling AI API: provider=${provider}, modelId=${modelId}, maxTokens=${effectiveMaxTokens}`,
        );

        let effectiveCapabilities: string[] = (aiMember.capabilities || []).map(
          (c) => String(c),
        );
        if (
          aiMember.displayName.toLowerCase().includes("image") &&
          !effectiveCapabilities.includes("IMAGE_GENERATION")
        ) {
          effectiveCapabilities = [
            ...effectiveCapabilities,
            "IMAGE_GENERATION",
          ];
          this.logger.log(
            `[AI Capabilities] Inferred IMAGE_GENERATION for ${aiMember.displayName}`,
          );
        }

        result = await this.aiChatService.generateChatCompletionWithKey({
          provider,
          modelId,
          apiKey,
          apiEndpoint,
          systemPrompt: finalSystemPrompt,
          messages: chatMessages,
          maxTokens: effectiveMaxTokens,
          temperature: aiModelConfig?.temperature || 0.7,
          displayName: aiMember.displayName,
          capabilities: effectiveCapabilities,
        });
      } else {
        this.logger.warn(
          `No API key found for ${aiMember.aiModel}. Configure API key in Admin panel or set environment variable.`,
        );
        result = await this.aiChatService.generateChatCompletion({
          model: aiMember.aiModel,
          systemPrompt: finalSystemPrompt,
          messages: chatMessages,
          maxTokens: 4096, // Increased from 1024 to prevent truncation
          temperature: 0.7,
        });
      }
      aiResponse = result.content;
      tokensUsed = result.tokensUsed;
      this.logger.log(
        `[AI Response Debug] Content received from AI, length: ${aiResponse?.length || 0}`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      this.logger.error(`Failed to generate AI response: ${errorMsg}`);
      aiResponse = `**AI 响应生成失败**

我是 ${aiMember.displayName}，生成回复时遇到错误：

**错误信息**：${errorMsg}

请稍后重试，或联系管理员检查 API 配置。`;
    }

    // 创建AI消息
    this.logger.log(
      `[AI Response Debug] Saving to DB, content length: ${aiResponse?.length || 0}`,
    );
    const message = await this.prisma.topicMessage.create({
      data: {
        topicId,
        aiMemberId,
        content: aiResponse,
        contentType: MessageContentType.TEXT,
        prompt: systemPrompt,
        modelUsed: aiMember.aiModel,
        tokensUsed,
      },
      include: {
        aiMember: {
          select: {
            id: true,
            aiModel: true,
            displayName: true,
            avatar: true,
            roleDescription: true,
          },
        },
      },
    });

    this.logger.log(
      `[AI Response Debug] Saved to DB, message.content length: ${message.content?.length || 0}`,
    );

    // 更新Topic的updatedAt
    await this.prisma.topic.update({
      where: { id: topicId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  /**
   * 创建AI消息（用于辩论系统等场景）
   */
  async createAIMessage(
    topicId: string,
    aiMemberId: string,
    content: string,
    modelUsed: string,
    tokensUsed?: number,
  ) {
    const message = await this.prisma.topicMessage.create({
      data: {
        topicId,
        aiMemberId,
        content,
        contentType: MessageContentType.TEXT,
        modelUsed,
        tokensUsed: tokensUsed || 0,
      },
      include: {
        aiMember: {
          select: {
            id: true,
            aiModel: true,
            displayName: true,
            avatar: true,
            roleDescription: true,
          },
        },
      },
    });

    await this.prisma.topic.update({
      where: { id: topicId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  /**
   * 从消息内容中解析@提及的AI成员
   */
  async parseAIMentionsFromContent(
    topicId: string,
    content: string,
    excludeAiMemberId?: string,
  ): Promise<Array<{ id: string; displayName: string }>> {
    const aiMembers = await this.prisma.topicAIMember.findMany({
      where: {
        topicId,
        ...(excludeAiMemberId ? { id: { not: excludeAiMemberId } } : {}),
      },
      select: {
        id: true,
        displayName: true,
        autoRespond: true,
      },
    });

    if (aiMembers.length === 0) {
      return [];
    }

    const mentionedAIs: Array<{ id: string; displayName: string }> = [];

    for (const ai of aiMembers) {
      const patterns = [
        new RegExp(`@${this.escapeRegExp(ai.displayName)}(?![\\w])`, "i"),
        new RegExp(`@"${this.escapeRegExp(ai.displayName)}"`, "i"),
        new RegExp(`@'${this.escapeRegExp(ai.displayName)}'`, "i"),
      ];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          mentionedAIs.push({ id: ai.id, displayName: ai.displayName });
          this.logger.log(
            `[AI-AI] Detected mention of ${ai.displayName} in content`,
          );
          break;
        }
      }
    }

    return mentionedAIs;
  }

  /**
   * Determine if a message likely needs real-time information
   */
  private shouldSearchForInfo(content: string): boolean {
    const lowerContent = content.toLowerCase();

    const searchTriggers = [
      "最新",
      "最近",
      "今天",
      "昨天",
      "本周",
      "这周",
      "本月",
      "latest",
      "recent",
      "today",
      "yesterday",
      "this week",
      "this month",
      "current",
      "now",
      "2024",
      "2025",
      "什么是",
      "是什么",
      "怎么样",
      "如何",
      "为什么",
      "哪些",
      "哪个",
      "what is",
      "how to",
      "why",
      "which",
      "who is",
      "where",
      "新闻",
      "动态",
      "趋势",
      "发展",
      "进展",
      "消息",
      "news",
      "trend",
      "update",
      "development",
      "announcement",
      "比较",
      "对比",
      "区别",
      "评价",
      "评测",
      "推荐",
      "compare",
      "versus",
      "vs",
      "difference",
      "review",
      "recommend",
      "价格",
      "股价",
      "天气",
      "汇率",
      "price",
      "stock",
      "weather",
      "rate",
    ];

    return searchTriggers.some((trigger) => lowerContent.includes(trigger));
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Get default model ID for a given AI model identifier
   */
  private getDefaultModelId(modelIdentifier: string): string {
    const lower = modelIdentifier.toLowerCase();

    if (
      lower.includes("-") &&
      (lower.includes("grok") ||
        lower.includes("gpt") ||
        lower.includes("claude") ||
        lower.includes("gemini") ||
        lower.startsWith("o1") ||
        lower.startsWith("o3"))
    ) {
      return modelIdentifier;
    }

    const defaults: Record<string, string> = {
      grok: "grok-3-latest",
      "gpt-4": "gpt-4-turbo",
      claude: "claude-sonnet-4-20250514",
      gemini: "gemini-2.0-flash",
    };
    return defaults[lower] || modelIdentifier;
  }

  /**
   * Get default API endpoint for a given AI model identifier
   */
  private getDefaultEndpoint(modelIdentifier: string): string {
    const lower = modelIdentifier.toLowerCase();

    if (lower.includes("grok")) {
      return "https://api.x.ai/v1/chat/completions";
    }
    if (
      lower.includes("gpt") ||
      lower.startsWith("o1") ||
      lower.startsWith("o3")
    ) {
      return "https://api.openai.com/v1/chat/completions";
    }
    if (lower.includes("claude")) {
      return "https://api.anthropic.com/v1/messages";
    }
    if (lower.includes("gemini")) {
      return "https://generativelanguage.googleapis.com/v1beta/models";
    }

    return "";
  }
}
