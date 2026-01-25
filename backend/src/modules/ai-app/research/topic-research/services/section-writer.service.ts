/**
 * Section Writer Service
 *
 * Agent 服务：负责撰写单个章节内容
 * 每次调用只生成 300-800 字，确保不超 token 限制
 *
 * ★ 增强：内容质量检查和自动重试
 * - 检查 API 错误状态，自动抛出异常触发重试
 * - 检查内容长度，极短内容视为失败
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { SkillLoaderService } from "@/modules/ai-engine/skills/loader/skill-loader.service";
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
 * 内容质量检查阈值
 */
const MIN_CONTENT_LENGTH = 200; // 最小内容长度（字符）
const MIN_CONTENT_LENGTH_RATIO = 0.1; // 最小内容长度比例（相对于目标字数）

/**
 * 时间上下文配置
 * 用于向 LLM 传递当前时间和时效性要求
 */
export interface TemporalContext {
  /** 当前日期字符串，如 "2025年1月19日" */
  currentDate: string;
  /** 时效性要求描述 */
  freshnessRequirement: string;
}

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
  /** ★ 时间上下文（当前日期和时效性要求） */
  temporalContext?: TemporalContext;
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

  constructor(
    private readonly aiFacade: AIEngineFacade,
    private readonly skillLoader: SkillLoaderService,
  ) {}

  /**
   * 撰写单个章节
   *
   * @param input 章节写作输入
   * @returns 章节写作结果
   */
  async writeSection(input: SectionWriteInput): Promise<SectionWriteResult> {
    const {
      section,
      evidenceData,
      previousSections,
      modelId,
      temporalContext,
    } = input;

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

    // 准备提示词变量（包含时间上下文）
    const promptVariables = {
      sectionTitle: section.title,
      sectionDescription: section.description,
      targetWords: String(section.targetWords),
      minReferences: String(section.evidenceRequirements.minReferences),
      keyPoints: keyPointsFormatted,
      evidenceList: evidenceFormatted,
      previousContent,
      agentGuidance,
      // ★ 时间上下文
      currentDate: temporalContext?.currentDate || this.getCurrentDate(),
      freshnessRequirement:
        temporalContext?.freshnessRequirement ||
        "不限制时间范围，但建议优先使用最近的数据",
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

    // ★ 检查 API 错误状态
    if (response.isError) {
      this.logger.error(
        `[writeSection] API error for ${section.title}: ${response.content.slice(0, 100)}`,
      );
      throw new Error(
        `API error while writing section "${section.title}": ${response.content}`,
      );
    }

    // 提取内容（移除可能的 markdown 代码块包装）
    const content = this.extractContent(response.content);

    // ★ 检查内容质量（长度检查）
    const minLength = Math.max(
      MIN_CONTENT_LENGTH,
      section.targetWords * MIN_CONTENT_LENGTH_RATIO,
    );
    if (content.length < minLength) {
      this.logger.error(
        `[writeSection] Content too short for ${section.title}: ${content.length} chars < ${minLength} min`,
      );
      throw new Error(
        `Content too short for section "${section.title}": got ${content.length} chars, expected at least ${minLength}`,
      );
    }

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

    // ★ 检查 API 错误状态
    if (response.isError) {
      this.logger.error(
        `[reviseSection] API error for ${section.title}: ${response.content.slice(0, 100)}`,
      );
      throw new Error(
        `API error while revising section "${section.title}": ${response.content}`,
      );
    }

    // 提取内容
    const content = this.extractContent(response.content);

    // ★ 检查内容质量（长度检查）
    const minLength = Math.max(
      MIN_CONTENT_LENGTH,
      section.targetWords * MIN_CONTENT_LENGTH_RATIO,
    );
    if (content.length < minLength) {
      this.logger.error(
        `[reviseSection] Content too short for ${section.title}: ${content.length} chars < ${minLength} min`,
      );
      throw new Error(
        `Revised content too short for section "${section.title}": got ${content.length} chars, expected at least ${minLength}`,
      );
    }

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
   * ★ 增强：支持单个章节失败时的容错和自动重试
   * - 使用 Promise.allSettled 避免单个失败影响整体
   * - 对失败的章节自动使用备用模型重试
   * - 保持结果顺序与输入顺序一致
   *
   * @param inputs 多个章节写作输入
   * @returns 所有章节的写作结果（顺序与输入一致）
   */
  async writeSectionsParallel(
    inputs: SectionWriteInput[],
  ): Promise<SectionWriteResult[]> {
    this.logger.log(
      `[writeSectionsParallel] Writing ${inputs.length} sections in parallel`,
    );

    // 初始化结果数组，保持与输入相同的长度和顺序
    const results: (SectionWriteResult | null)[] = new Array(
      inputs.length,
    ).fill(null);
    const failedIndices: {
      index: number;
      input: SectionWriteInput;
      error: string;
    }[] = [];

    // 第一轮：并行执行所有章节
    const firstRoundResults = await Promise.allSettled(
      inputs.map((input) => this.writeSection(input)),
    );

    // 收集成功和失败的结果，保持索引位置
    for (let i = 0; i < firstRoundResults.length; i++) {
      const result = firstRoundResults[i];
      if (result.status === "fulfilled") {
        results[i] = result.value;
      } else {
        failedIndices.push({
          index: i,
          input: inputs[i],
          error: result.reason?.message || String(result.reason),
        });
        this.logger.warn(
          `[writeSectionsParallel] Section "${inputs[i].section.title}" failed: ${result.reason?.message}`,
        );
      }
    }

    // 如果有失败的章节，尝试用备用模型重试
    if (failedIndices.length > 0) {
      // 获取备用模型（使用 AI Engine 的智能选择，一次性获取）
      const fallbackModel = await this.aiFacade.selectModel({
        modelType: "CHAT" as any,
      });

      if (fallbackModel) {
        // 过滤掉原模型就是 fallbackModel 的情况，避免无意义重试
        const retryableItems = failedIndices.filter(
          ({ input }) => input.modelId !== fallbackModel.id,
        );
        const skipItems = failedIndices.filter(
          ({ input }) => input.modelId === fallbackModel.id,
        );

        // 记录跳过的项
        for (const { index, input, error } of skipItems) {
          this.logger.warn(
            `[writeSectionsParallel] Skipping retry for "${input.section.title}" - fallback model same as original`,
          );
          results[index] = this.createFailedResult(input, error);
        }

        if (retryableItems.length > 0) {
          this.logger.log(
            `[writeSectionsParallel] Retrying ${retryableItems.length} failed sections with ${fallbackModel.id}`,
          );

          const retryResults = await Promise.allSettled(
            retryableItems.map(({ input }) =>
              this.writeSection({
                ...input,
                modelId: fallbackModel.id,
              }),
            ),
          );

          // 处理重试结果，放回正确的索引位置
          for (let i = 0; i < retryResults.length; i++) {
            const result = retryResults[i];
            const { index, input, error: originalError } = retryableItems[i];

            if (result.status === "fulfilled") {
              this.logger.log(
                `[writeSectionsParallel] Section "${input.section.title}" succeeded on retry with ${fallbackModel.id}`,
              );
              results[index] = result.value;
            } else {
              this.logger.error(
                `[writeSectionsParallel] Section "${input.section.title}" failed even after retry: ${result.reason?.message}`,
              );
              results[index] = this.createFailedResult(input, originalError);
            }
          }
        }
      } else {
        // 没有可用的备用模型，记录所有失败
        this.logger.error(
          `[writeSectionsParallel] No fallback model available, ${failedIndices.length} sections failed`,
        );
        for (const { index, input, error } of failedIndices) {
          results[index] = this.createFailedResult(input, error);
        }
      }
    }

    // 确保所有位置都有结果（防御性编程）
    const finalResults = results.map(
      (r, i) => r ?? this.createFailedResult(inputs[i], "Unknown error"),
    );

    const successCount = finalResults.filter((r) => r.wordCount > 0).length;
    this.logger.log(
      `[writeSectionsParallel] Completed: ${successCount}/${inputs.length} sections successful`,
    );

    return finalResults;
  }

  /**
   * 创建失败结果占位对象
   */
  private createFailedResult(
    input: SectionWriteInput,
    error: string,
  ): SectionWriteResult {
    return {
      sectionId: input.section.id,
      title: input.section.title,
      content: `[内容生成失败] 原因: ${error}`,
      wordCount: 0,
      referencesUsed: [],
    };
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
   * ★ 增强：真正加载 skill.md 文件内容
   */
  private formatAgentGuidance(section: SectionPlan): string {
    const config = section.agentConfig;
    if (!config) {
      return "无特殊指导";
    }

    const parts: string[] = [];

    // ★ 真正加载分析技能（从 skill.md 文件）
    if (config.skills && config.skills.length > 0) {
      const loadedSkillContents: string[] = [];
      const fallbackDescriptions: string[] = [];

      // 技能 ID 到文件 ID 的映射（下划线转换为连字符）
      const skillIdMapping: Record<string, string> = {
        trend_analysis: "trend-analysis",
        swot_analysis: "swot-analysis",
        competitive_analysis: "competitive-analysis",
        deep_dive: "deep-dive",
        data_interpretation: "data-interpretation",
        synthesis: "synthesis",
        critical_thinking: "critical-thinking",
        future_projection: "future-projection",
        cause_effect: "cause-effect",
        comparison: "comparison",
      };

      // 备用描述（当技能文件不存在时使用）
      const fallbackSkillDescriptions: Record<string, string> = {
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

      for (const skillId of config.skills) {
        const fileId = skillIdMapping[skillId] || skillId.replace(/_/g, "-");
        // 同步获取技能（skillLoader 已在启动时预加载所有技能）
        const skill = this.skillLoader
          .getAllLoadedSkills()
          .find((s) => s.metadata.id === fileId);

        if (skill) {
          // ★ 使用技能文件的完整内容
          loadedSkillContents.push(
            `### ${skill.metadata.name}\n\n${skill.content}`,
          );
          this.logger.debug(
            `[formatAgentGuidance] Loaded skill: ${fileId} (${skill.content.length} chars)`,
          );
        } else {
          // 技能文件不存在，使用备用描述
          fallbackDescriptions.push(
            `- ${fallbackSkillDescriptions[skillId] || skillId}`,
          );
          this.logger.debug(
            `[formatAgentGuidance] Skill not found, using fallback: ${skillId}`,
          );
        }
      }

      // 组合已加载的技能内容
      if (loadedSkillContents.length > 0) {
        parts.push(
          `## 分析技能指导\n\n${loadedSkillContents.join("\n\n---\n\n")}`,
        );
      }

      // 添加备用描述（如果有未找到的技能）
      if (fallbackDescriptions.length > 0) {
        parts.push(`**其他分析方法**:\n${fallbackDescriptions.join("\n")}`);
      }
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

  /**
   * 获取当前日期字符串
   */
  private getCurrentDate(): string {
    const now = new Date();
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  }
}
