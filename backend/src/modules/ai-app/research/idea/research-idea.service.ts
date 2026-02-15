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

    // Save extracted ideas
    const ideaData = extractedIdeas.map((idea) => ({
      projectId,
      sessionId,
      title: idea.title,
      description: idea.description,
      agentRole: idea.sourceAgent || null,
      agentName: idea.sourceAgent || null,
      tags: idea.tags || [],
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
      description: string;
      sourceAgent: string;
      tags: string[];
    }>
  > {
    const systemPrompt = `你是一位专业的研究洞察分析师。你的任务是从多Agent研究讨论中提炼出具体的、有价值的研究创意和洞察。

## 你需要做的
分析讨论内容，提炼出 8-15 个高质量的研究创意。每个创意必须是：
1. **具体且可操作的研究想法**（不是泛泛的讨论摘要）
2. **有明确的研究方向**（可以作为后续深入研究的起点）
3. **标题简洁有力**（15-40字，概括核心创意点）
4. **描述精炼深入**（100-200字，说明创意的核心价值、可行性、预期影响）

## 创意类型
- **技术洞察**: 从技术分析中提炼的创新点或技术趋势判断
- **市场机会**: 从市场分析中发现的未被充分认识的机会
- **战略建议**: 从综合分析中提出的战略性建议
- **风险预警**: 从批判性分析中识别的潜在风险或盲区
- **研究方向**: 值得进一步深入研究的课题方向
- **跨领域发现**: 从交叉验证中发现的跨领域关联

## 输出格式
只输出 JSON 数组，不要其他内容：
\`\`\`json
[
  {
    "title": "简洁有力的创意标题（15-40字）",
    "description": "创意的核心价值和研究方向描述。说明这个创意为什么重要、核心论点是什么、可以如何深入研究。（100-200字）",
    "sourceAgent": "提出核心观点的Agent名称",
    "tags": ["类型标签", "领域标签"]
  }
]
\`\`\`

## 重要原则
- 不要简单复制消息内容，要**提炼和升华**
- 每个创意应该有独特的切入角度，避免重复
- 标题不能是"各位同事"、"总监"等对话开头
- 描述要有见地，不是信息罗列
- 优先提炼有数据支撑、有争议性、或有创新视角的想法`;

    const userPrompt = `请从以下研究团队讨论中提炼出高质量的研究创意：

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

      // Validate and clean each idea
      return ideas
        .filter(
          (idea: { title?: string; description?: string }) =>
            idea.title &&
            idea.description &&
            idea.title.length >= 5 &&
            idea.description.length >= 20,
        )
        .map(
          (idea: {
            title: string;
            description: string;
            sourceAgent?: string;
            tags?: string[];
          }) => ({
            title: idea.title.substring(0, 200),
            description: idea.description.substring(0, 2000),
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
