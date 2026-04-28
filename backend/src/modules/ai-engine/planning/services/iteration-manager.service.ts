/**
 * Iteration Manager Service
 * 迭代管理服务 - AI Engine 核心能力
 *
 * 新增的核心能力，支持研究主题的持续迭代
 * 提供结构化输出、版本管理、部分更新等功能
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import {
  IIterationManagerService,
  IterationRequest,
  IterationResult,
  StructuredOutput,
  OutputSection,
  ResearchContext,
} from "./interfaces";
import { AiChatService } from "../../llm/services/ai-chat.service";
// ★ 架构重构：通过 ToolRegistry 调用工具
import { ToolRegistry } from "../../tools/registry/tool-registry";
import type { ToolContext } from "../../tools/abstractions/tool.interface";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AIModelType } from "@prisma/client";

/**
 * 版本存储（内存实现，后续可替换为数据库）
 */
interface VersionStore {
  outputs: Map<string, StructuredOutput[]>;
  contexts: Map<string, ResearchContext>;
}

@Injectable()
export class IterationManagerService implements IIterationManagerService {
  private readonly logger = new Logger(IterationManagerService.name);

  /**
   * 版本存储
   * TODO: 后续迁移到数据库持久化
   */
  private readonly store: VersionStore = {
    outputs: new Map(),
    contexts: new Map(),
  };

  constructor(
    private readonly aiChatService: AiChatService,
    // ★ 架构重构：通过 ToolRegistry 调用工具
    private readonly toolRegistry: ToolRegistry,
    // prismaService 预留用于后续版本持久化
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _prismaService: PrismaService,
  ) {}

  /**
   * 创建工具执行上下文
   */
  private createToolContext(toolId: string): ToolContext {
    return {
      executionId: `${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolId,
      createdAt: new Date(),
      callerType: "orchestrator",
    };
  }

  /**
   * 执行迭代请求
   */
  async executeIteration(
    request: IterationRequest,
    context: ResearchContext,
  ): Promise<IterationResult> {
    this.logger.log(
      `[executeIteration] Processing ${request.type} for output ${request.outputId}`,
    );

    try {
      // 获取当前版本
      const versions = this.store.outputs.get(request.outputId) || [];
      const currentOutput =
        versions.length > 0 ? versions[versions.length - 1] : null;

      if (!currentOutput && request.type !== "full_update") {
        return {
          success: false,
          output: this.createEmptyOutput(request.outputId),
          changedSectionIds: [],
          changeSummary: "未找到现有输出",
          tokensUsed: 0,
          error: "Output not found",
        };
      }

      let result: IterationResult;

      switch (request.type) {
        case "partial_update":
          result = await this.executePartialUpdate(
            request,
            currentOutput!,
            context,
          );
          break;

        case "section_expand":
          result = await this.executeSectionExpand(
            request,
            currentOutput!,
            context,
          );
          break;

        case "section_rewrite":
          result = await this.executeSectionRewrite(
            request,
            currentOutput!,
            context,
          );
          break;

        case "add_section":
          result = await this.executeAddSection(
            request,
            currentOutput!,
            context,
          );
          break;

        case "refresh":
          result = await this.executeRefresh(request, currentOutput!, context);
          break;

        case "full_update":
          result = await this.executeFullUpdate(request, context);
          break;

        default:
          return {
            success: false,
            output: currentOutput || this.createEmptyOutput(request.outputId),
            changedSectionIds: [],
            changeSummary: "不支持的迭代类型",
            tokensUsed: 0,
            error: `Unsupported iteration type: ${request.type}`,
          };
      }

      // 保存新版本
      if (result.success) {
        this.saveVersion(result.output);
      }

      return result;
    } catch (error) {
      this.logger.error(
        `[executeIteration] Failed: ${(error as Error).message}`,
      );
      return {
        success: false,
        output: this.createEmptyOutput(request.outputId),
        changedSectionIds: [],
        changeSummary: "迭代执行失败",
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 获取输出版本历史
   */
  async getVersionHistory(outputId: string): Promise<StructuredOutput[]> {
    return this.store.outputs.get(outputId) || [];
  }

  /**
   * 比较两个版本的差异
   */
  async compareVersions(
    outputId: string,
    version1: number,
    version2: number,
  ): Promise<{
    added: OutputSection[];
    removed: OutputSection[];
    modified: Array<{
      sectionId: string;
      before: string;
      after: string;
    }>;
  }> {
    const versions = this.store.outputs.get(outputId) || [];
    const v1 = versions.find((v) => v.version === version1);
    const v2 = versions.find((v) => v.version === version2);

    if (!v1 || !v2) {
      return { added: [], removed: [], modified: [] };
    }

    const v1SectionIds = new Set(v1.sections.map((s) => s.id));
    const v2SectionIds = new Set(v2.sections.map((s) => s.id));
    const v1SectionMap = new Map(v1.sections.map((s) => [s.id, s]));
    const v2SectionMap = new Map(v2.sections.map((s) => [s.id, s]));

    // 新增的部分
    const added = v2.sections.filter((s) => !v1SectionIds.has(s.id));

    // 删除的部分
    const removed = v1.sections.filter((s) => !v2SectionIds.has(s.id));

    // 修改的部分
    const modified: Array<{
      sectionId: string;
      before: string;
      after: string;
    }> = [];

    for (const [sectionId, v2Section] of v2SectionMap) {
      const v1Section = v1SectionMap.get(sectionId);
      if (v1Section && v1Section.content !== v2Section.content) {
        modified.push({
          sectionId,
          before: v1Section.content,
          after: v2Section.content,
        });
      }
    }

    return { added, removed, modified };
  }

  /**
   * 获取或创建研究上下文
   */
  async getOrCreateResearchContext(topic: string): Promise<ResearchContext> {
    // 查找现有上下文
    for (const [, ctx] of this.store.contexts) {
      if (ctx.topic === topic) {
        return ctx;
      }
    }

    // 创建新上下文
    const newContext: ResearchContext = {
      id: uuidv4(),
      topic,
      accumulatedKnowledge: {
        facts: [],
        sources: [],
        insights: [],
      },
      searchHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.store.contexts.set(newContext.id, newContext);
    return newContext;
  }

  /**
   * 更新研究上下文
   */
  async updateResearchContext(
    contextId: string,
    updates: Partial<ResearchContext>,
  ): Promise<ResearchContext> {
    const context = this.store.contexts.get(contextId);
    if (!context) {
      throw new NotFoundException(`Context not found: ${contextId}`);
    }

    const updated = {
      ...context,
      ...updates,
      updatedAt: new Date(),
    };

    this.store.contexts.set(contextId, updated);
    return updated;
  }

  // ==================== 迭代操作实现 ====================

  /**
   * 部分更新（选中的部分）
   */
  private async executePartialUpdate(
    request: IterationRequest,
    currentOutput: StructuredOutput,
    context: ResearchContext,
  ): Promise<IterationResult> {
    const sectionIds = request.sectionIds || [];
    if (sectionIds.length === 0) {
      return {
        success: false,
        output: currentOutput,
        changedSectionIds: [],
        changeSummary: "未选择要更新的部分",
        tokensUsed: 0,
        error: "No sections selected",
      };
    }

    let totalTokens = 0;
    const updatedSections = [...currentOutput.sections];
    const changedIds: string[] = [];

    for (const sectionId of sectionIds) {
      const sectionIndex = updatedSections.findIndex((s) => s.id === sectionId);
      if (sectionIndex === -1) continue;

      const section = updatedSections[sectionIndex];
      const result = await this.updateSingleSection(
        section,
        request.userInstruction,
        context,
      );

      if (result.success) {
        updatedSections[sectionIndex] = {
          ...section,
          content: result.content,
        };
        changedIds.push(sectionId);
        totalTokens += result.tokensUsed;
      }
    }

    const newOutput: StructuredOutput = {
      ...currentOutput,
      id: currentOutput.id,
      version: currentOutput.version + 1,
      sections: updatedSections,
      updatedAt: new Date(),
    };

    return {
      success: true,
      output: newOutput,
      changedSectionIds: changedIds,
      changeSummary: `更新了 ${changedIds.length} 个部分`,
      tokensUsed: totalTokens,
    };
  }

  /**
   * 扩展某个部分
   */
  private async executeSectionExpand(
    request: IterationRequest,
    currentOutput: StructuredOutput,
    context: ResearchContext,
  ): Promise<IterationResult> {
    const sectionId = request.sectionIds?.[0];
    if (!sectionId) {
      return {
        success: false,
        output: currentOutput,
        changedSectionIds: [],
        changeSummary: "未指定要扩展的部分",
        tokensUsed: 0,
        error: "No section specified",
      };
    }

    const sectionIndex = currentOutput.sections.findIndex(
      (s) => s.id === sectionId,
    );
    if (sectionIndex === -1) {
      return {
        success: false,
        output: currentOutput,
        changedSectionIds: [],
        changeSummary: "未找到指定的部分",
        tokensUsed: 0,
        error: "Section not found",
      };
    }

    const section = currentOutput.sections[sectionIndex];
    const result = await this.expandSection(
      section,
      request.userInstruction,
      context,
    );

    if (!result.success) {
      return {
        success: false,
        output: currentOutput,
        changedSectionIds: [],
        changeSummary: "扩展失败",
        tokensUsed: result.tokensUsed,
        error: result.error,
      };
    }

    const updatedSections = [...currentOutput.sections];
    updatedSections[sectionIndex] = {
      ...section,
      content: result.content,
    };

    const newOutput: StructuredOutput = {
      ...currentOutput,
      version: currentOutput.version + 1,
      sections: updatedSections,
      updatedAt: new Date(),
    };

    return {
      success: true,
      output: newOutput,
      changedSectionIds: [sectionId],
      changeSummary: `扩展了部分 "${section.title}"`,
      tokensUsed: result.tokensUsed,
    };
  }

  /**
   * 重写某个部分
   */
  private async executeSectionRewrite(
    request: IterationRequest,
    currentOutput: StructuredOutput,
    context: ResearchContext,
  ): Promise<IterationResult> {
    const sectionId = request.sectionIds?.[0];
    if (!sectionId) {
      return {
        success: false,
        output: currentOutput,
        changedSectionIds: [],
        changeSummary: "未指定要重写的部分",
        tokensUsed: 0,
        error: "No section specified",
      };
    }

    const sectionIndex = currentOutput.sections.findIndex(
      (s) => s.id === sectionId,
    );
    if (sectionIndex === -1) {
      return {
        success: false,
        output: currentOutput,
        changedSectionIds: [],
        changeSummary: "未找到指定的部分",
        tokensUsed: 0,
        error: "Section not found",
      };
    }

    const section = currentOutput.sections[sectionIndex];
    const result = await this.rewriteSection(
      section,
      request.userInstruction,
      context,
    );

    if (!result.success) {
      return {
        success: false,
        output: currentOutput,
        changedSectionIds: [],
        changeSummary: "重写失败",
        tokensUsed: result.tokensUsed,
        error: result.error,
      };
    }

    const updatedSections = [...currentOutput.sections];
    updatedSections[sectionIndex] = {
      ...section,
      content: result.content,
    };

    const newOutput: StructuredOutput = {
      ...currentOutput,
      version: currentOutput.version + 1,
      sections: updatedSections,
      updatedAt: new Date(),
    };

    return {
      success: true,
      output: newOutput,
      changedSectionIds: [sectionId],
      changeSummary: `重写了部分 "${section.title}"`,
      tokensUsed: result.tokensUsed,
    };
  }

  /**
   * 添加新部分
   */
  private async executeAddSection(
    request: IterationRequest,
    currentOutput: StructuredOutput,
    context: ResearchContext,
  ): Promise<IterationResult> {
    if (!request.newSection?.title) {
      return {
        success: false,
        output: currentOutput,
        changedSectionIds: [],
        changeSummary: "未提供新部分信息",
        tokensUsed: 0,
        error: "New section info not provided",
      };
    }

    const result = await this.generateNewSection(
      request.newSection.title,
      request.newSection.description,
      request.userInstruction,
      context,
    );

    if (!result.success) {
      return {
        success: false,
        output: currentOutput,
        changedSectionIds: [],
        changeSummary: "生成新部分失败",
        tokensUsed: result.tokensUsed,
        error: result.error,
      };
    }

    const newSection: OutputSection = {
      id: uuidv4(),
      title: request.newSection.title,
      content: result.content,
      level: 2,
    };

    // 确定插入位置
    let insertIndex = currentOutput.sections.length;
    if (request.newSection.afterSectionId) {
      const afterIndex = currentOutput.sections.findIndex(
        (s) => s.id === request.newSection!.afterSectionId,
      );
      if (afterIndex !== -1) {
        insertIndex = afterIndex + 1;
      }
    }

    const updatedSections = [...currentOutput.sections];
    updatedSections.splice(insertIndex, 0, newSection);

    const newOutput: StructuredOutput = {
      ...currentOutput,
      version: currentOutput.version + 1,
      sections: updatedSections,
      updatedAt: new Date(),
    };

    return {
      success: true,
      output: newOutput,
      changedSectionIds: [newSection.id],
      changeSummary: `添加了新部分 "${newSection.title}"`,
      tokensUsed: result.tokensUsed,
    };
  }

  /**
   * 刷新（重新搜索 + 更新）
   */
  private async executeRefresh(
    request: IterationRequest,
    currentOutput: StructuredOutput,
    context: ResearchContext,
  ): Promise<IterationResult> {
    let totalTokens = 0;

    // 执行新搜索
    const searchKeywords = request.searchKeywords || [context.topic];
    const newSources: ResearchContext["accumulatedKnowledge"]["sources"] = [];

    // ★ 通过 ToolRegistry 调用 web-search 工具
    const webSearchTool = this.toolRegistry.tryGet("web-search");
    for (const keyword of searchKeywords) {
      try {
        if (!webSearchTool) {
          this.logger.warn("[executeRefresh] web-search tool not available");
          continue;
        }
        const toolResult = await webSearchTool.execute(
          { query: keyword, numResults: 5 },
          this.createToolContext("web-search"),
        );
        if (toolResult.success && toolResult.data) {
          const searchData = toolResult.data as {
            results: Array<{ title: string; url: string; content: string }>;
            success: boolean;
          };
          if (searchData.success && searchData.results?.length > 0) {
            for (const r of searchData.results.slice(0, 3)) {
              newSources.push({
                url: r.url,
                title: r.title,
                summary: r.content || "",
              });
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          `[executeRefresh] Search failed for "${keyword}": ${(error as Error).message}`,
        );
      }
    }

    // 更新上下文
    await this.updateResearchContext(context.id, {
      accumulatedKnowledge: {
        ...context.accumulatedKnowledge,
        sources: [...context.accumulatedKnowledge.sources, ...newSources],
      },
      searchHistory: [
        ...context.searchHistory,
        ...searchKeywords.map((q) => ({
          query: q,
          timestamp: new Date(),
          resultCount: newSources.length,
        })),
      ],
    });

    // 更新需要刷新的部分
    const sectionIds =
      request.sectionIds || currentOutput.sections.map((s) => s.id);
    const updatedSections = [...currentOutput.sections];
    const changedIds: string[] = [];

    for (const sectionId of sectionIds.slice(0, 3)) {
      // 限制刷新部分数量
      const sectionIndex = updatedSections.findIndex((s) => s.id === sectionId);
      if (sectionIndex === -1) continue;

      const section = updatedSections[sectionIndex];
      const result = await this.refreshSection(section, newSources, context);

      if (result.success) {
        updatedSections[sectionIndex] = {
          ...section,
          content: result.content,
        };
        changedIds.push(sectionId);
        totalTokens += result.tokensUsed;
      }
    }

    const newOutput: StructuredOutput = {
      ...currentOutput,
      version: currentOutput.version + 1,
      sections: updatedSections,
      updatedAt: new Date(),
    };

    return {
      success: true,
      output: newOutput,
      changedSectionIds: changedIds,
      changeSummary: `刷新了 ${changedIds.length} 个部分，新增 ${newSources.length} 个来源`,
      tokensUsed: totalTokens,
    };
  }

  /**
   * 全量更新
   */
  private async executeFullUpdate(
    request: IterationRequest,
    context: ResearchContext,
  ): Promise<IterationResult> {
    // 全量更新逻辑 - 生成全新的结构化输出
    // 这里简化实现，实际应调用完整的研究流程
    const result = await this.generateFullOutput(
      context.topic,
      request.userInstruction,
      context,
    );

    if (!result.success) {
      return {
        success: false,
        output: this.createEmptyOutput(request.outputId),
        changedSectionIds: [],
        changeSummary: "全量更新失败",
        tokensUsed: result.tokensUsed,
        error: result.error,
      };
    }

    const newOutput: StructuredOutput = {
      id: request.outputId,
      version: 1,
      title: context.topic,
      sections: result.sections,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return {
      success: true,
      output: newOutput,
      changedSectionIds: newOutput.sections.map((s) => s.id),
      changeSummary: "完成全量更新",
      tokensUsed: result.tokensUsed,
    };
  }

  // ==================== 辅助方法 ====================

  /**
   * 更新单个部分
   */
  private async updateSingleSection(
    section: OutputSection,
    userInstruction?: string,
    context?: ResearchContext,
  ): Promise<{
    success: boolean;
    content: string;
    tokensUsed: number;
    error?: string;
  }> {
    try {
      const prompt = `请更新以下内容部分：

## 原标题
${section.title}

## 原内容
${section.content}

${userInstruction ? `## 用户要求\n${userInstruction}\n` : ""}
${context?.accumulatedKnowledge.facts.length ? `## 已知事实\n${context.accumulatedKnowledge.facts.slice(-5).join("\n")}\n` : ""}

请保持原有结构和风格，根据要求进行更新。`;

      const result = await this.callAI(prompt);
      return {
        success: true,
        content: result.content,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      return {
        success: false,
        content: section.content,
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 扩展部分
   */
  private async expandSection(
    section: OutputSection,
    userInstruction?: string,
    context?: ResearchContext,
  ): Promise<{
    success: boolean;
    content: string;
    tokensUsed: number;
    error?: string;
  }> {
    try {
      const prompt = `请扩展以下内容，增加更多细节和深度：

## 标题
${section.title}

## 原内容
${section.content}

${userInstruction ? `## 扩展方向\n${userInstruction}\n` : ""}
${context?.accumulatedKnowledge.facts.length ? `## 可参考的事实\n${context.accumulatedKnowledge.facts.slice(-5).join("\n")}\n` : ""}

请在保持原有内容的基础上，增加更多细节、例子或分析。`;

      const result = await this.callAI(prompt);
      return {
        success: true,
        content: result.content,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      return {
        success: false,
        content: section.content,
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 重写部分
   */
  private async rewriteSection(
    section: OutputSection,
    userInstruction?: string,
    context?: ResearchContext,
  ): Promise<{
    success: boolean;
    content: string;
    tokensUsed: number;
    error?: string;
  }> {
    try {
      const prompt = `请重写以下内容：

## 标题
${section.title}

## 原内容（仅供参考）
${section.content}

${userInstruction ? `## 重写要求\n${userInstruction}\n` : ""}
${context?.accumulatedKnowledge.facts.length ? `## 可参考的事实\n${context.accumulatedKnowledge.facts.slice(-5).join("\n")}\n` : ""}

请完全重写这部分内容，可以采用不同的角度和结构。`;

      const result = await this.callAI(prompt);
      return {
        success: true,
        content: result.content,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      return {
        success: false,
        content: section.content,
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 生成新部分
   */
  private async generateNewSection(
    title: string,
    description?: string,
    userInstruction?: string,
    context?: ResearchContext,
  ): Promise<{
    success: boolean;
    content: string;
    tokensUsed: number;
    error?: string;
  }> {
    try {
      const prompt = `请为以下主题生成内容：

## 标题
${title}

${description ? `## 描述\n${description}\n` : ""}
${userInstruction ? `## 要求\n${userInstruction}\n` : ""}
${context?.topic ? `## 所属主题\n${context.topic}\n` : ""}
${context?.accumulatedKnowledge.facts.length ? `## 可参考的事实\n${context.accumulatedKnowledge.facts.slice(-5).join("\n")}\n` : ""}

请生成结构清晰、内容充实的内容。`;

      const result = await this.callAI(prompt);
      return {
        success: true,
        content: result.content,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 刷新部分（基于新来源）
   */
  private async refreshSection(
    section: OutputSection,
    newSources: ResearchContext["accumulatedKnowledge"]["sources"],
    // context 预留用于后续增强
    _context: ResearchContext,
  ): Promise<{
    success: boolean;
    content: string;
    tokensUsed: number;
    error?: string;
  }> {
    try {
      const sourcesText = newSources
        .map((s) => `- ${s.title}: ${s.summary}`)
        .join("\n");

      const prompt = `请根据最新信息更新以下内容：

## 标题
${section.title}

## 原内容
${section.content}

## 最新来源
${sourcesText}

请整合新信息，更新内容，保持原有结构。`;

      const result = await this.callAI(prompt);
      return {
        success: true,
        content: result.content,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      return {
        success: false,
        content: section.content,
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 生成完整输出
   */
  private async generateFullOutput(
    topic: string,
    userInstruction?: string,
    context?: ResearchContext,
  ): Promise<{
    success: boolean;
    sections: OutputSection[];
    tokensUsed: number;
    error?: string;
  }> {
    try {
      const prompt = `请为以下主题生成结构化的研究报告：

## 主题
${topic}

${userInstruction ? `## 要求\n${userInstruction}\n` : ""}
${context?.accumulatedKnowledge.facts.length ? `## 已知事实\n${context.accumulatedKnowledge.facts.join("\n")}\n` : ""}

请输出 JSON 格式的结构化内容：
\`\`\`json
{
  "sections": [
    {
      "title": "部分标题",
      "content": "部分内容",
      "level": 2
    }
  ]
}
\`\`\``;

      const result = await this.callAI(prompt);

      // 解析 JSON
      const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        const sections: OutputSection[] = parsed.sections.map(
          (s: { title: string; content: string; level?: number }) => ({
            id: uuidv4(),
            title: s.title,
            content: s.content,
            level: s.level || 2,
          }),
        );
        return {
          success: true,
          sections,
          tokensUsed: result.tokensUsed,
        };
      }

      // 降级：创建单个部分
      return {
        success: true,
        sections: [
          {
            id: uuidv4(),
            title: topic,
            content: result.content,
            level: 1,
          },
        ],
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      return {
        success: false,
        sections: [],
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 调用 AI
   */
  private async callAI(
    prompt: string,
  ): Promise<{ content: string; tokensUsed: number }> {
    const result = await this.aiChatService.chat({
      modelType: AIModelType.CHAT,
      messages: [
        {
          role: "system",
          content: "你是一个专业的研究助手，擅长结构化写作和内容生成。",
        },
        { role: "user", content: prompt },
      ],
      taskProfile: {
        creativity: "medium",
        outputLength: "medium",
      },
    });

    return {
      content: result.content,
      tokensUsed: result.usage?.totalTokens || 0,
    };
  }

  /**
   * 创建空输出
   */
  private createEmptyOutput(outputId: string): StructuredOutput {
    return {
      id: outputId,
      version: 0,
      title: "",
      sections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * 保存版本
   */
  private saveVersion(output: StructuredOutput): void {
    const versions = this.store.outputs.get(output.id) || [];
    versions.push(output);
    this.store.outputs.set(output.id, versions);

    this.logger.log(
      `[saveVersion] Saved version ${output.version} for output ${output.id}`,
    );
  }
}
