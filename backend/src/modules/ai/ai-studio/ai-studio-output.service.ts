import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { InputJsonValue } from "@prisma/client/runtime/library";
import { GenerateOutputDto, OutputTypeValue } from "./dto";

// Output type configurations
const OUTPUT_CONFIGS: Record<
  OutputTypeValue,
  {
    title: string;
    prompt: string;
    icon: string;
  }
> = {
  STUDY_GUIDE: {
    title: "Study Guide",
    prompt:
      "Generate a comprehensive study guide based on the provided sources. Include key concepts, definitions, and learning objectives.",
    icon: "📖",
  },
  BRIEFING_DOC: {
    title: "Briefing Document",
    prompt:
      "Create an executive briefing document summarizing the key points, findings, and recommendations from the provided sources.",
    icon: "📋",
  },
  FAQ: {
    title: "FAQ",
    prompt:
      "Generate a list of frequently asked questions and detailed answers based on the provided sources.",
    icon: "❓",
  },
  TIMELINE: {
    title: "Timeline",
    prompt:
      "Create a chronological timeline of events, developments, and milestones mentioned in the provided sources.",
    icon: "📅",
  },
  AUDIO_OVERVIEW: {
    title: "Audio Overview",
    prompt:
      "Generate a script for an audio overview/podcast episode that discusses the key topics from the provided sources.",
    icon: "🎙️",
  },
  TREND_REPORT: {
    title: "Trend Report",
    prompt:
      "Analyze the provided sources to identify trends, patterns, and future predictions in the relevant field.",
    icon: "📈",
  },
  COMPARISON: {
    title: "Comparison Analysis",
    prompt:
      "Create a detailed comparison analysis of the different approaches, methods, or technologies discussed in the provided sources.",
    icon: "⚖️",
  },
  KNOWLEDGE_GRAPH: {
    title: "Knowledge Graph",
    prompt:
      "Generate a structured knowledge graph showing relationships between key concepts, entities, and topics from the provided sources.",
    icon: "🕸️",
  },
  CUSTOM: {
    title: "Custom Output",
    prompt: "Generate a custom output based on the user's requirements.",
    icon: "✨",
  },
};

@Injectable()
export class AiStudioOutputService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get available output types
   */
  getOutputTypes() {
    return Object.entries(OUTPUT_CONFIGS).map(([type, config]) => ({
      type,
      ...config,
    }));
  }

  /**
   * Generate an output for a project
   */
  async generateOutput(
    userId: string,
    projectId: string,
    dto: GenerateOutputDto,
  ) {
    // Verify project ownership
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
      include: {
        sources: true,
      },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    // Get sources for context
    let sources = project.sources;
    if (dto.selectedSourceIds && dto.selectedSourceIds.length > 0) {
      sources = sources.filter((s) => dto.selectedSourceIds!.includes(s.id));
    }

    // Get output config
    const config = OUTPUT_CONFIGS[dto.type];
    const title = dto.customTitle || config.title;

    // Create output record with PENDING status
    const output = await this.prisma.researchProjectOutput.create({
      data: {
        projectId,
        type: dto.type,
        title,
        status: "PENDING",
        metadata: {
          sourceIds: sources.map((s) => s.id),
          options: dto.options || {},
          icon: config.icon,
        } as unknown as InputJsonValue,
      },
    });

    // In a real implementation, this would trigger an async AI generation job
    // For now, we'll return the pending output and the client will poll for updates

    return {
      output,
      config,
      sourceCount: sources.length,
    };
  }

  /**
   * Get all outputs for a project
   */
  async getOutputs(userId: string, projectId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return this.prisma.researchProjectOutput.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get a single output
   */
  async getOutput(userId: string, projectId: string, outputId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const output = await this.prisma.researchProjectOutput.findUnique({
      where: { id: outputId },
    });

    if (!output || output.projectId !== projectId) {
      throw new NotFoundException("Output not found");
    }

    return output;
  }

  /**
   * Update output status and content (used by AI generation job)
   */
  async updateOutput(
    outputId: string,
    status: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED",
    content?: string,
    error?: string,
    tokensUsed?: number,
  ) {
    return this.prisma.researchProjectOutput.update({
      where: { id: outputId },
      data: {
        status,
        ...(content && { content }),
        ...(error && { error }),
        ...(tokensUsed && { tokensUsed }),
        ...(status === "COMPLETED" && { completedAt: new Date() }),
      },
    });
  }

  /**
   * Delete an output
   */
  async deleteOutput(userId: string, projectId: string, outputId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const output = await this.prisma.researchProjectOutput.findUnique({
      where: { id: outputId },
    });

    if (!output || output.projectId !== projectId) {
      throw new NotFoundException("Output not found");
    }

    await this.prisma.researchProjectOutput.delete({
      where: { id: outputId },
    });

    return { success: true };
  }

  /**
   * Regenerate an output
   */
  async regenerateOutput(userId: string, projectId: string, outputId: string) {
    // Verify access by getting the output (throws if not found or unauthorized)
    await this.getOutput(userId, projectId, outputId);

    // Reset status to pending
    return this.prisma.researchProjectOutput.update({
      where: { id: outputId },
      data: {
        status: "PENDING",
        content: null,
        error: null,
        completedAt: null,
      },
    });
  }
}
