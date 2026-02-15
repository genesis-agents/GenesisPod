import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AIEngineFacade } from "../../../ai-engine/facade";
import {
  CreateResearchIdeaDto,
  UpdateResearchIdeaDto,
} from "./research-idea.dto";

@Injectable()
export class ResearchIdeaService {
  private readonly logger = new Logger(ResearchIdeaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFacade: AIEngineFacade,
  ) {}

  /**
   * Verify that the project belongs to the user
   */
  private async verifyProjectOwnership(
    userId: string,
    projectId: string,
  ): Promise<void> {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }
  }

  async listByProject(userId: string, projectId: string) {
    await this.verifyProjectOwnership(userId, projectId);

    return this.prisma.researchIdea.findMany({
      where: { projectId },
      include: { demos: { select: { id: true, status: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(userId: string, projectId: string, dto: CreateResearchIdeaDto) {
    await this.verifyProjectOwnership(userId, projectId);

    return this.prisma.researchIdea.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        sessionId: dto.sessionId,
        sourceMessageId: dto.sourceMessageId,
        agentRole: dto.agentRole,
        agentName: dto.agentName,
        tags: dto.tags || [],
      },
    });
  }

  async update(
    userId: string,
    projectId: string,
    ideaId: string,
    dto: UpdateResearchIdeaDto,
  ) {
    await this.verifyProjectOwnership(userId, projectId);

    try {
      return await this.prisma.researchIdea.update({
        where: { id: ideaId, projectId },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.tags !== undefined && { tags: dto.tags }),
        },
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        throw new NotFoundException("Idea not found");
      }
      throw error;
    }
  }

  async delete(userId: string, projectId: string, ideaId: string) {
    await this.verifyProjectOwnership(userId, projectId);

    try {
      return await this.prisma.researchIdea.delete({
        where: { id: ideaId, projectId },
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        throw new NotFoundException("Idea not found");
      }
      throw error;
    }
  }

  /**
   * AI-powered idea extraction from discussion session.
   * Analyzes all discussion messages and synthesizes refined research ideas
   * with clear titles, concise descriptions, and proper attribution.
   */
  async extractFromSession(
    userId: string,
    projectId: string,
    sessionId: string,
  ) {
    await this.verifyProjectOwnership(userId, projectId);

    const session = await this.prisma.deepResearchSession.findUnique({
      where: { id: sessionId, projectId },
    });
    if (!session) throw new NotFoundException("Session not found");

    const discussion = (session.discussion || []) as Array<{
      id: string;
      agentRole: string;
      agentName: string;
      content: string;
      phase: string;
      messageType: string;
    }>;

    if (discussion.length === 0) {
      return [];
    }

    // Check for existing ideas - if already extracted, return them
    const existingIdeas = await this.prisma.researchIdea.findMany({
      where: { sessionId },
      include: { demos: { select: { id: true, status: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (existingIdeas.length > 0) {
      // Re-extract: delete old ideas and re-analyze
      await this.prisma.researchIdea.deleteMany({ where: { sessionId } });
      this.logger.log(
        `Cleared ${existingIdeas.length} old ideas for re-extraction`,
      );
    }

    // Prepare discussion content for AI analysis
    const discussionContent = this.prepareDiscussionForAnalysis(discussion);

    // Use AI to extract refined ideas
    const extractedIdeas = await this.aiExtractIdeas(discussionContent);

    if (extractedIdeas.length === 0) {
      this.logger.warn(
        `AI extraction produced no ideas for session ${sessionId}`,
      );
      return [];
    }

    // Save extracted ideas with structured metadata
    const ideaData = extractedIdeas.map((idea) => ({
      projectId,
      sessionId,
      title: idea.title,
      description: idea.coreInsight,
      agentRole: idea.sourceAgent || null,
      agentName: idea.sourceAgent || null,
      tags: idea.tags || [],
      metadata: {
        coreInsight: idea.coreInsight,
        evidence: idea.evidence,
        researchDirection: idea.researchDirection,
        impactLevel: idea.impactLevel,
      },
    }));

    await this.prisma.researchIdea.createMany({ data: ideaData });
    this.logger.log(
      `AI extracted ${ideaData.length} refined ideas from session ${sessionId}`,
    );

    return this.prisma.researchIdea.findMany({
      where: { sessionId },
      include: { demos: { select: { id: true, status: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Prepare discussion messages for AI analysis.
   * Condenses messages into a structured summary for the AI to analyze.
   */
  private prepareDiscussionForAnalysis(
    discussion: Array<{
      agentRole: string;
      agentName: string;
      content: string;
      phase: string;
      messageType: string;
    }>,
  ): string {
    // Group by phase for context
    const phases = new Map<string, string[]>();
    for (const msg of discussion) {
      const phase = msg.phase || "unknown";
      if (!phases.has(phase)) phases.set(phase, []);
      // Truncate very long messages but keep enough context
      const truncated =
        msg.content.length > 2000
          ? msg.content.substring(0, 2000) + "..."
          : msg.content;
      phases
        .get(phase)!
        .push(
          `[${msg.agentName || msg.agentRole}] (${msg.messageType})\n${truncated}`,
        );
    }

    const parts: string[] = [];
    for (const [phase, messages] of phases) {
      parts.push(`## 阶段: ${phase}\n\n${messages.join("\n\n---\n\n")}`);
    }

    return parts.join("\n\n========\n\n");
  }

  /**
   * Use AI to extract refined research ideas from discussion content.
   */
  private async aiExtractIdeas(discussionContent: string): Promise<
    Array<{
      title: string;
      coreInsight: string;
      evidence: string[];
      researchDirection: string;
      impactLevel: "high" | "medium" | "low";
      sourceAgent: string;
      tags: string[];
    }>
  > {
    const systemPrompt = `你是一位专业的研究洞察分析师。你的任务是从多Agent研究讨论中提炼出结构化的、高质量的研究洞察和判断。

## 核心要求
从讨论内容中提炼出 8-15 个高价值的研究洞察。每个洞察必须是：
1. **明确的判断**（不是总结，是带有判断力的结论，例如"CUDA生态锁定正被边缘AI瓦解"而非"研究AI芯片市场"）
2. **有论据支撑**（从讨论中提取2-4个具体的支撑论据）
3. **有后续方向**（基于这个洞察应该进一步研究什么）
4. **标题简洁有力**（15-40字，必须是核心判断陈述，禁止使用"各位同事"、"总监"等对话开头）
5. **影响力评估**（high/medium/low）

## 洞察类型
- **技术趋势判断**: 技术演进方向、技术格局变化的判断
- **市场机会识别**: 未被充分认识的市场空间和时间窗口
- **战略风险预警**: 潜在的战略盲区、路径依赖、生态锁定
- **跨领域发现**: 不同领域之间的关联、迁移、颠覆性机会
- **反共识观点**: 与主流认知不同的判断和理由

## 输出格式
只输出 JSON 数组，不要其他内容：
\`\`\`json
[
  {
    "title": "核心判断标题（15-40字）",
    "coreInsight": "用1-2句话清晰表达核心洞察和判断。这是what和why的结合。",
    "evidence": [
      "支撑论据1：从讨论中提取的具体证据或观点",
      "支撑论据2：具体的数据、案例、分析",
      "支撑论据3：额外的支撑信息"
    ],
    "researchDirection": "基于此洞察的下一步研究方向。如果验证这个判断，应该去研究什么？",
    "impactLevel": "high",
    "sourceAgent": "提出核心观点的Agent名称",
    "tags": ["类型标签", "领域标签"]
  }
]
\`\`\`

## 质量标准（必须严格遵守）
- title: 必须是判断性陈述，不能是问题、不能是总结性描述
- title: 禁止以"各位"、"总监"、"同事"等称呼开头
- coreInsight: 必须说清楚"是什么判断"和"为什么这样判断"
- evidence: 必须是从讨论中提取的具体内容，不能泛泛而谈
- researchDirection: 必须是可执行的下一步研究方向
- impactLevel: high=可能改变格局，medium=值得深入，low=补充性发现
- 不要简单复制消息内容，必须提炼、升华、形成判断
- 每个洞察必须有独特的切入角度，避免重复`;

    const userPrompt = `请从以下研究团队讨论中提炼出高质量的结构化洞察：

${discussionContent}`;

    try {
      const result = await this.aiFacade.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "medium",
          outputLength: "long",
        },
      });

      const jsonStr = result.content.replace(/```json\s*|\s*```/g, "").trim();
      const ideas = JSON.parse(jsonStr);

      if (!Array.isArray(ideas)) {
        this.logger.warn("AI extraction did not return an array");
        return [];
      }

      // Validate and clean each idea with strict quality checks
      return ideas
        .filter(
          (idea: {
            title?: string;
            coreInsight?: string;
            evidence?: string[];
            researchDirection?: string;
            impactLevel?: string;
          }) => {
            // Must have all required fields
            if (
              !idea.title ||
              !idea.coreInsight ||
              !idea.evidence ||
              !idea.researchDirection ||
              !idea.impactLevel
            ) {
              return false;
            }
            // Title quality checks
            if (idea.title.length < 5) return false;
            if (
              idea.title.startsWith("各位") ||
              idea.title.startsWith("总监")
            ) {
              return false;
            }
            // Core insight must be substantial
            if (idea.coreInsight.length < 10) return false;
            // Evidence must be an array with at least 1 item
            if (!Array.isArray(idea.evidence) || idea.evidence.length < 1) {
              return false;
            }
            // Impact level must be valid
            if (!["high", "medium", "low"].includes(idea.impactLevel)) {
              return false;
            }
            return true;
          },
        )
        .map(
          (idea: {
            title: string;
            coreInsight: string;
            evidence: string[];
            researchDirection: string;
            impactLevel: "high" | "medium" | "low";
            sourceAgent?: string;
            tags?: string[];
          }) => ({
            title: idea.title.substring(0, 200),
            coreInsight: idea.coreInsight.substring(0, 2000),
            evidence: idea.evidence.slice(0, 4).map((e) => e.substring(0, 500)),
            researchDirection: idea.researchDirection.substring(0, 500),
            impactLevel: idea.impactLevel,
            sourceAgent: idea.sourceAgent || "",
            tags: Array.isArray(idea.tags) ? idea.tags.slice(0, 5) : [],
          }),
        );
    } catch (error) {
      this.logger.error(`AI idea extraction failed: ${error}`);
      return [];
    }
  }
}
