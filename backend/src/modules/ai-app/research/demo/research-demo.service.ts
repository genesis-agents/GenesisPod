import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";

@Injectable()
export class ResearchDemoService {
  private readonly logger = new Logger(ResearchDemoService.name);

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

    return this.prisma.researchDemo.findMany({
      where: { projectId },
      include: {
        idea: { select: { id: true, title: true, agentRole: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(userId: string, projectId: string, demoId: string) {
    await this.verifyProjectOwnership(userId, projectId);

    const demo = await this.prisma.researchDemo.findUnique({
      where: { id: demoId, projectId },
      include: {
        idea: {
          select: {
            id: true,
            title: true,
            description: true,
            agentRole: true,
          },
        },
      },
    });
    if (!demo) throw new NotFoundException("Demo not found");
    return demo;
  }

  async createForIdea(
    userId: string,
    projectId: string,
    ideaId: string,
    title?: string,
  ) {
    await this.verifyProjectOwnership(userId, projectId);

    const idea = await this.prisma.researchIdea.findUnique({
      where: { id: ideaId, projectId },
    });
    if (!idea) throw new NotFoundException("Idea not found");

    const demo = await this.prisma.researchDemo.create({
      data: {
        ideaId,
        projectId,
        title: title || `Demo: ${idea.title}`,
        htmlContent: "",
        status: "PENDING",
      },
    });

    // TODO: Trigger AI generation asynchronously
    // For now, create with PENDING status. The actual HTML generation
    // will be implemented as a separate AI service task.
    this.logger.log(
      `Created demo ${demo.id} for idea ${ideaId}, pending generation`,
    );

    return demo;
  }

  async delete(userId: string, projectId: string, demoId: string) {
    await this.verifyProjectOwnership(userId, projectId);

    try {
      return await this.prisma.researchDemo.delete({
        where: { id: demoId, projectId },
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        throw new NotFoundException("Demo not found");
      }
      throw error;
    }
  }
}
