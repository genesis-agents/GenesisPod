import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AIEngineFacade } from "../../../ai-engine/facade";
import {
  DiscussionRole,
  AgentState,
  AGENT_ICONS,
  AGENT_NAMES_ZH,
  DiscussionMessage,
  DiscussionPhase,
  DiscussionMessageType,
  ResearchDirection,
} from "./discussion-types";

/**
 * 讨论 Agent 服务
 * 管理多角色 LLM 调用，每个 Agent 独立对话历史
 */
@Injectable()
export class DiscussionAgentService {
  private readonly logger = new Logger(DiscussionAgentService.name);

  constructor(private readonly aiFacade: AIEngineFacade) {}

  /**
   * 初始化 Agent 团队
   */
  initializeTeam(query: string): Map<string, AgentState> {
    const team = new Map<string, AgentState>();

    const agents: Array<{
      id: string;
      role: DiscussionRole;
      systemPrompt: string;
    }> = [
      {
        id: "director",
        role: "director",
        systemPrompt: this.buildDirectorPrompt(query),
      },
      {
        id: "researcher-a",
        role: "researcher",
        systemPrompt: this.buildResearcherPrompt(query, "A", "技术与产品视角"),
      },
      {
        id: "researcher-b",
        role: "researcher",
        systemPrompt: this.buildResearcherPrompt(query, "B", "市场与商业视角"),
      },
      {
        id: "researcher-c",
        role: "researcher",
        systemPrompt: this.buildResearcherPrompt(
          query,
          "C",
          "用户与社会影响视角",
        ),
      },
      {
        id: "analyst",
        role: "analyst",
        systemPrompt: this.buildAnalystPrompt(query),
      },
      {
        id: "writer",
        role: "writer",
        systemPrompt: this.buildWriterPrompt(query),
      },
      {
        id: "reviewer",
        role: "reviewer",
        systemPrompt: this.buildReviewerPrompt(query),
      },
    ];

    for (const agent of agents) {
      team.set(agent.id, {
        config: {
          role: agent.role,
          name: AGENT_NAMES_ZH[agent.id] || agent.id,
          icon: AGENT_ICONS[agent.role],
          systemPrompt: agent.systemPrompt,
        },
        conversationHistory: [{ role: "system", content: agent.systemPrompt }],
        status: "idle",
      });
    }

    return team;
  }

  /**
   * 让指定 Agent 发言
   */
  async speak(
    agentState: AgentState,
    context: string,
    options?: {
      creativity?: "deterministic" | "low" | "medium" | "high";
      outputLength?: "minimal" | "short" | "medium" | "long";
      modelType?: AIModelType;
    },
  ): Promise<string> {
    // 添加上下文到对话历史
    agentState.conversationHistory.push({
      role: "user",
      content: context,
    });

    // 防止对话历史无限增长：保留 system prompt + 最近 10 条消息
    this.trimConversationHistory(agentState, 10);

    try {
      const result = await this.aiFacade.chat({
        messages: agentState.conversationHistory.map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        })),
        modelType: options?.modelType || AIModelType.CHAT,
        taskProfile: {
          creativity: options?.creativity || "medium",
          outputLength: options?.outputLength || "short",
        },
      });

      const response = result.content;

      // 记录回复到对话历史
      agentState.conversationHistory.push({
        role: "assistant",
        content: response,
      });

      return response;
    } catch (error) {
      this.logger.error(
        `Agent ${agentState.config.name} speak failed: ${error}`,
      );
      throw error;
    }
  }

  /**
   * 创建讨论消息
   */
  createMessage(
    agentState: AgentState,
    content: string,
    phase: DiscussionPhase,
    messageType: DiscussionMessageType,
    metadata?: DiscussionMessage["metadata"],
  ): DiscussionMessage {
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      agentRole: agentState.config.role,
      agentName: agentState.config.name,
      agentIcon: agentState.config.icon,
      content,
      phase,
      messageType,
      metadata,
      timestamp: new Date(),
    };
  }

  /**
   * 创建系统消息
   */
  createSystemMessage(
    content: string,
    phase: DiscussionPhase,
  ): DiscussionMessage {
    return {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      agentRole: "director",
      agentName: "System",
      agentIcon: "info",
      content,
      phase,
      messageType: "system",
      timestamp: new Date(),
    };
  }

  /**
   * 从总监的综合发言中解析研究方向
   */
  parseDirections(directorResponse: string): ResearchDirection[] {
    // 尝试 JSON 解析
    const jsonMatch =
      directorResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
      directorResponse.match(/\[\s*\{[\s\S]*"title"[\s\S]*\}\s*\]/);

    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          return parsed.map((d: Partial<ResearchDirection>, i: number) => ({
            title: d.title || `方向 ${i + 1}`,
            description: d.description || "",
            assignedTo: d.assignedTo || "",
            searchQueries: d.searchQueries || [],
          }));
        }
      } catch {
        // JSON 解析失败，使用文本解析
      }
    }

    // 文本解析：提取编号列表项
    const lines = directorResponse.split("\n");
    const directions: ResearchDirection[] = [];
    for (const line of lines) {
      const match = line.match(/^\s*(?:\d+[\.\)、]|[-*])\s*(.+)/);
      if (match && match[1].trim().length > 5) {
        directions.push({
          title: match[1].trim().slice(0, 100),
          description: "",
          assignedTo: "",
          searchQueries: [match[1].trim()],
        });
      }
    }

    return directions.slice(0, 5);
  }

  /**
   * 限制对话历史长度，保留 system prompt + 最近 N 条消息
   */
  private trimConversationHistory(
    agentState: AgentState,
    maxMessages: number,
  ): void {
    const history = agentState.conversationHistory;
    // system prompt (index 0) + maxMessages
    if (history.length > maxMessages + 1) {
      const systemPrompt = history[0];
      const recent = history.slice(-maxMessages);
      history.length = 0;
      history.push(systemPrompt, ...recent);
    }
  }

  // ==================== Prompt 构建 ====================

  private buildDirectorPrompt(query: string): string {
    return `你是一个资深研究总监，正在带领一个研究团队讨论课题。

## 你的职责
- 分析课题，提出研究框架
- 引导讨论方向，综合团队观点
- 最终确定研究方向并分配任务

## 研究课题
${query}

## 沟通风格
- 专业、有条理、善于总结
- 发言简洁（150-300字）
- 使用中文
- 不使用 emoji`;
  }

  private buildResearcherPrompt(
    query: string,
    label: string,
    perspective: string,
  ): string {
    return `你是研究员 ${label}，擅长从${perspective}进行分析。

## 你的职责
- 从${perspective}提出研究 Ideas
- 基于你的专业视角补充讨论
- 搜索信息后汇报发现

## 研究课题
${query}

## 沟通风格
- 有洞察力、提出具体的想法
- 发言简洁（100-200字）
- 使用中文
- 不使用 emoji`;
  }

  private buildAnalystPrompt(query: string): string {
    return `你是一个批判性分析师，擅长找出研究盲区和挑战假设。

## 你的职责
- 挑战团队的假设和盲区
- 交叉验证不同研究员的发现
- 指出矛盾和逻辑漏洞

## 研究课题
${query}

## 沟通风格
- 犀利、客观、有建设性
- 发言简洁（100-200字）
- 使用中文
- 不使用 emoji`;
  }

  private buildWriterPrompt(query: string): string {
    return `你是一个专业的研究报告撰稿人。

## 你的职责
- 基于团队讨论撰写研究报告
- 确保报告结构清晰、引用准确

## 研究课题
${query}

## 沟通风格
- 专业、严谨
- 使用中文`;
  }

  private buildReviewerPrompt(query: string): string {
    return `你是一个研究报告审稿人。

## 你的职责
- 审查报告质量、逻辑性和完整性
- 提出修改建议

## 研究课题
${query}

## 沟通风格
- 严格、有建设性
- 发言简洁（50-150字）
- 使用中文
- 不使用 emoji`;
  }
}
