/**
 * Section Writer Service
 *
 * Agent 服务：负责撰写单个章节内容
 * 每次调用只生成 300-800 字，确保不超 token 限制
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { AIModelType } from "@prisma/client";
import type { SectionPlan } from "./research-leader.service";
import {
  SECTION_WRITING_SYSTEM_PROMPT,
  SECTION_WRITING_USER_PROMPT_TEMPLATE,
  SECTION_REVISION_USER_PROMPT_TEMPLATE,
  formatEvidenceForPrompt,
  renderPromptTemplate,
} from "../prompts/dimension-research.prompt";
import type { EvidenceData } from "../types/research.types";

/**
 * 章节写作结果
 */
export interface SectionWriteResult {
  sectionId: string;
  title: string;
  content: string;
  wordCount: number;
  referencesUsed: string[];
}

/**
 * 章节写作输入
 */
export interface SectionWriteInput {
  section: SectionPlan;
  evidenceData: EvidenceData[];
  previousSections?: Array<{ title: string; content: string }>;
  /** ★ 指定使用的模型ID（用于实现 Agent 多元化） */
  modelId?: string;
}

/**
 * 章节修订输入
 */
export interface SectionRevisionInput {
  section: SectionPlan;
  originalContent: string;
  reviewFeedback: string;
  revisionInstructions: string;
  evidenceData: EvidenceData[];
  /** ★ 指定使用的模型ID（用于实现 Agent 多元化） */
  modelId?: string;
}

@Injectable()
export class SectionWriterService {
  private readonly logger = new Logger(SectionWriterService.name);

  constructor(private readonly aiFacade: AIEngineFacade) {}

  /**
   * 撰写单个章节
   *
   * @param input 章节写作输入
   * @returns 章节写作结果
   */
  async writeSection(input: SectionWriteInput): Promise<SectionWriteResult> {
    const { section, evidenceData, previousSections, modelId } = input;

    this.logger.log(
      `[writeSection] Writing section: ${section.title} (${section.targetWords} words)${modelId ? `, model: ${modelId}` : ""}`,
    );

    // 格式化证据列表
    const evidenceFormatted = formatEvidenceForPrompt(evidenceData);

    // 格式化要点列表
    const keyPointsFormatted = section.keyPoints
      .map((p, i) => `${i + 1}. ${p}`)
      .join("\n");

    // 格式化前置章节
    let previousContent = "无";
    if (previousSections && previousSections.length > 0) {
      // 只提供最近的 1-2 个章节摘要，避免上下文过长
      const recentSections = previousSections.slice(-2);
      previousContent = recentSections
        .map((s) => `### ${s.title}\n${s.content.substring(0, 500)}...`)
        .join("\n\n");
    }

    // 格式化 Agent 配置指导
    const agentGuidance = this.formatAgentGuidance(section);

    // 准备提示词变量
    const promptVariables = {
      sectionTitle: section.title,
      sectionDescription: section.description,
      targetWords: String(section.targetWords),
      minReferences: String(section.evidenceRequirements.minReferences),
      keyPoints: keyPointsFormatted,
      evidenceList: evidenceFormatted,
      previousContent,
      agentGuidance,
    };

    // 渲染用户提示词
    const userPrompt = renderPromptTemplate(
      SECTION_WRITING_USER_PROMPT_TEMPLATE,
      promptVariables,
    );

    // 调用 AI 写作
    // ★ 支持指定模型实现 Agent 多元化
    const startTime = Date.now();
    const response = await this.aiFacade.chat({
      messages: [
        { role: "system", content: SECTION_WRITING_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      modelType: AIModelType.CHAT,
      model: modelId, // ★ 使用指定模型（如果提供）
      taskProfile: {
        creativity: "medium",
        outputLength: "long", // 支持 800-1500 字的章节
      },
    });
    const latencyMs = Date.now() - startTime;

    // 提取内容（移除可能的 markdown 代码块包装）
    const content = this.extractContent(response.content);

    // 统计字数和引用
    const wordCount = content.length;
    const referencesUsed = this.extractReferences(content);

    this.logger.log(
      `[writeSection] Completed ${section.title}: ${wordCount} chars, ${referencesUsed.length} refs, ${latencyMs}ms`,
    );

    return {
      sectionId: section.id,
      title: section.title,
      content,
      wordCount,
      referencesUsed,
    };
  }

  /**
   * 修订章节
   *
   * @param input 修订输入
   * @returns 修订后的章节
   */
  async reviseSection(
    input: SectionRevisionInput,
  ): Promise<SectionWriteResult> {
    const {
      section,
      originalContent,
      reviewFeedback,
      revisionInstructions,
      evidenceData,
      modelId,
    } = input;

    this.logger.log(
      `[reviseSection] Revising section: ${section.title}${modelId ? `, model: ${modelId}` : ""}`,
    );

    // 格式化证据列表
    const evidenceFormatted = formatEvidenceForPrompt(evidenceData);

    // 准备提示词变量
    const promptVariables = {
      sectionTitle: section.title,
      targetWords: String(section.targetWords),
      minReferences: String(section.evidenceRequirements.minReferences),
      originalContent,
      reviewFeedback,
      revisionInstructions: revisionInstructions || "请根据反馈改进内容",
      evidenceList: evidenceFormatted,
    };

    // 渲染用户提示词
    const userPrompt = renderPromptTemplate(
      SECTION_REVISION_USER_PROMPT_TEMPLATE,
      promptVariables,
    );

    // 调用 AI 修订
    // ★ 支持指定模型实现 Agent 多元化
    const startTime = Date.now();
    const response = await this.aiFacade.chat({
      messages: [
        { role: "system", content: SECTION_WRITING_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      modelType: AIModelType.CHAT,
      model: modelId, // ★ 使用指定模型（如果提供）
      taskProfile: {
        creativity: "low", // 修订时降低创造性，保持一致性
        outputLength: "long", // 支持 800-1500 字的章节
      },
    });
    const latencyMs = Date.now() - startTime;

    // 提取内容
    const content = this.extractContent(response.content);

    // 统计字数和引用
    const wordCount = content.length;
    const referencesUsed = this.extractReferences(content);

    this.logger.log(
      `[reviseSection] Revised ${section.title}: ${wordCount} chars, ${referencesUsed.length} refs, ${latencyMs}ms`,
    );

    return {
      sectionId: section.id,
      title: section.title,
      content,
      wordCount,
      referencesUsed,
    };
  }

  /**
   * 批量并行写作多个章节
   *
   * @param inputs 多个章节写作输入
   * @returns 所有章节的写作结果
   */
  async writeSectionsParallel(
    inputs: SectionWriteInput[],
  ): Promise<SectionWriteResult[]> {
    this.logger.log(
      `[writeSectionsParallel] Writing ${inputs.length} sections in parallel`,
    );

    const results = await Promise.all(
      inputs.map((input) => this.writeSection(input)),
    );

    return results;
  }

  /**
   * 提取内容（移除可能的 markdown 代码块包装）
   */
  private extractContent(response: string): string {
    // 移除 markdown 代码块包装
    let content = response.trim();

    // 移除 ```markdown 包装
    if (content.startsWith("```markdown")) {
      content = content.replace(/^```markdown\s*/, "").replace(/\s*```$/, "");
    }
    // 移除 ``` 包装
    else if (content.startsWith("```")) {
      content = content.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    return content.trim();
  }

  /**
   * 提取内容中的证据引用
   * ★ 更新为匹配数字格式 [1], [2], [3]
   */
  private extractReferences(content: string): string[] {
    const matches = content.match(/\[\d+\]/g) || [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  }

  /**
   * 格式化 Agent 配置为指导文本
   * 将 Leader 的 agentConfig 转换为 Agent 可理解的指导
   */
  private formatAgentGuidance(section: SectionPlan): string {
    const config = section.agentConfig;
    if (!config) {
      return "无特殊指导";
    }

    const parts: string[] = [];

    // 分析技能指导
    if (config.skills && config.skills.length > 0) {
      const skillDescriptions: Record<string, string> = {
        trend_analysis: "趋势分析 - 识别发展趋势、变化方向、未来走向",
        swot_analysis: "SWOT分析 - 分析优势、劣势、机会、威胁",
        competitive_analysis: "竞争分析 - 分析竞争格局、主要玩家、策略对比",
        deep_dive: "深度调研 - 深入挖掘细节、探究根因、全面分析",
        data_interpretation: "数据解读 - 解读数字、统计数据、量化指标",
        synthesis: "综合归纳 - 整合多源信息、提炼核心观点",
        critical_thinking: "批判思维 - 质疑验证、多角度分析、辨别真伪",
        future_projection: "未来预测 - 基于现状预测发展、推演可能场景",
        cause_effect: "因果分析 - 分析原因和结果、追溯根源",
        comparison: "对比分析 - 比较不同方案、事物、路径",
      };

      const skillGuide = config.skills
        .map((s) => `- ${skillDescriptions[s] || s}`)
        .join("\n");
      parts.push(`**分析方法**:\n${skillGuide}`);
    }

    // 分析指导
    if (config.analysisGuidance) {
      parts.push(`**Leader 指导**: ${config.analysisGuidance}`);
    }

    // 输出风格
    if (config.outputStyle) {
      const styleDescriptions: Record<string, string> = {
        analytical: "逻辑严谨、数据支撑、论证充分",
        narrative: "故事性强、易于理解、引人入胜",
        concise: "精炼要点、去除冗余、直击核心",
        detailed: "面面俱到、深入展开、不遗漏细节",
      };
      parts.push(
        `**输出风格**: ${styleDescriptions[config.outputStyle] || config.outputStyle}`,
      );
    }

    // 数据源偏好
    if (config.preferredDataSources && config.preferredDataSources.length > 0) {
      parts.push(`**优先数据源**: ${config.preferredDataSources.join("、")}`);
    }

    return parts.length > 0 ? parts.join("\n\n") : "无特殊指导";
  }
}
