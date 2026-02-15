import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  CreateResearchIdeaDto,
  UpdateResearchIdeaDto,
} from "./research-idea.dto";

@Injectable()
export class ResearchIdeaService {
  private readonly logger = new Logger(ResearchIdeaService.name);

  constructor(private readonly prisma: PrismaService) {}

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
   * Extract ideas from a discussion session's messages.
   * Looks for messages with messageType: 'idea', 'proposal', 'findings'
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

    // Filter messages that represent ideas
    const ideaMessages = discussion.filter((msg) =>
      ["idea", "proposal", "findings", "synthesis", "cross_check"].includes(
        msg.messageType,
      ),
    );

    if (ideaMessages.length === 0) {
      this.logger.debug(`No idea messages found in session ${sessionId}`);
      return [];
    }

    // Check for existing ideas from this session to avoid duplicates
    const existingIdeas = await this.prisma.researchIdea.findMany({
      where: { sessionId },
      select: { sourceMessageId: true },
    });
    const existingMessageIds = new Set(
      existingIdeas.map((i) => i.sourceMessageId),
    );

    const newIdeas = ideaMessages
      .filter((msg) => !existingMessageIds.has(msg.id))
      .map((msg) => ({
        projectId,
        sessionId,
        title: this.extractTitle(msg.content),
        description:
          msg.content.length > 1000
            ? msg.content.substring(0, 1000) + "..."
            : msg.content,
        sourceMessageId: msg.id,
        agentRole: msg.agentRole,
        agentName: msg.agentName,
        tags: [msg.messageType, msg.phase],
      }));

    if (newIdeas.length === 0) return [];

    await this.prisma.researchIdea.createMany({ data: newIdeas });
    this.logger.log(
      `Extracted ${newIdeas.length} ideas from session ${sessionId}`,
    );

    return this.prisma.researchIdea.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });
  }

  private extractTitle(content: string): string {
    // Try to extract first heading or first sentence
    const headingMatch = content.match(/^#+\s+(.+)$/m);
    if (headingMatch) return headingMatch[1].substring(0, 200);

    const firstLine = content.split("\n")[0].trim();
    if (firstLine.length <= 200) return firstLine;
    return firstLine.substring(0, 197) + "...";
  }
}
