import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AIEngineFacade } from "../../../ai-engine/facade";

@Injectable()
export class ResearchDemoService {
  private readonly logger = new Logger(ResearchDemoService.name);

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

    this.logger.log(
      `Created demo ${demo.id} for idea ${ideaId}, starting AI generation`,
    );

    // Trigger AI generation asynchronously (fire-and-forget)
    void this.generateDemoHtml(demo.id, idea);

    return demo;
  }

  /**
   * Generate self-contained HTML demo using AI.
   * Updates the demo record with generated content or error status.
   */
  private async generateDemoHtml(
    demoId: string,
    idea: {
      title: string;
      description: string;
      metadata: unknown;
    },
  ) {
    try {
      await this.prisma.researchDemo.update({
        where: { id: demoId },
        data: { status: "GENERATING" },
      });

      const meta = (idea.metadata || {}) as {
        concept?: string;
        innovationPoints?: string[];
        approach?: string;
        feasibility?: string;
        dimension?: string;
        coreInsight?: string;
        evidence?: string[];
        researchDirection?: string;
      };

      const contextParts = [
        `# ${idea.title}`,
        idea.description,
        meta.concept && `## 核心概念\n${meta.concept}`,
        meta.innovationPoints?.length &&
          `## 创新点\n${meta.innovationPoints.map((p) => `- ${p}`).join("\n")}`,
        meta.approach && `## 实现路径\n${meta.approach}`,
        meta.coreInsight && `## 核心洞察\n${meta.coreInsight}`,
        meta.evidence?.length &&
          `## 论据\n${meta.evidence.map((e) => `- ${e}`).join("\n")}`,
        meta.researchDirection && `## 研究方向\n${meta.researchDirection}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const systemPrompt = `你是一位专业的交互式演示设计师。根据给定的研究创意/洞察，生成一个自包含的 HTML 演示页面。

## 要求
1. 输出完整的 HTML 文档（包含 <!DOCTYPE html>）
2. 所有 CSS 必须 inline 在 <style> 标签中
3. 所有 JavaScript 必须 inline 在 <script> 标签中
4. 禁止引用任何外部资源（CDN、字体、图片URL等）
5. 使用现代、美观的设计风格（渐变背景、卡片布局、动画）
6. 必须包含交互元素（图表、动画、可点击元素等）
7. 使用 SVG 代替图片
8. 中文内容

## 演示类型建议
- 概念流程图/架构图（SVG 绘制）
- 数据可视化（Canvas/SVG 图表）
- 交互式信息卡片
- 步骤流程动画
- 对比分析面板

## 输出
只输出 HTML 代码，不要其他内容。不要用 markdown 代码块包裹。`;

      const result = await this.aiFacade.chat({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `请为以下研究内容生成一个交互式 HTML 演示：\n\n${contextParts}`,
          },
        ],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "high",
          outputLength: "long",
        },
      });

      // Clean up potential markdown code fences
      let htmlContent = result.content.trim();
      if (htmlContent.startsWith("```html")) {
        htmlContent = htmlContent.slice(7);
      }
      if (htmlContent.startsWith("```")) {
        htmlContent = htmlContent.slice(3);
      }
      if (htmlContent.endsWith("```")) {
        htmlContent = htmlContent.slice(0, -3);
      }
      htmlContent = htmlContent.trim();

      await this.prisma.researchDemo.update({
        where: { id: demoId },
        data: {
          htmlContent,
          status: "COMPLETED",
        },
      });

      this.logger.log(`Demo ${demoId} generated successfully`);
    } catch (error) {
      this.logger.error(`Demo generation failed for ${demoId}: ${error}`);
      try {
        await this.prisma.researchDemo.update({
          where: { id: demoId },
          data: {
            status: "FAILED",
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to update demo ${demoId} status to FAILED: ${updateError}`,
        );
      }
    }
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
