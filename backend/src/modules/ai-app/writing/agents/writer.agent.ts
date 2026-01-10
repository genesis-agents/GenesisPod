/**
 * Writer Agent - 写作 Agent (Enhanced with Quality System)
 *
 * 核心写作角色，负责：
 * - 基于大纲和 Story Bible 设定完成章节创作
 * - 保持与项目整体风格一致
 * - 严格遵循 Story Bible 中的设定
 * - 【新增】遵循表达冷却约束，避免重复表达
 * - 【新增】遵循角色人格约束，保持角色一致性
 * - 【新增】遵循历史知识约束，避免历史错误
 *
 * 支持多实例并行，每个实例负责一个章节的写作。
 */

import { Injectable } from "@nestjs/common";
import { BaseAgent } from "../../../ai-engine/agents/base/base-agent";
import {
  AgentContext,
  AgentCapability,
} from "../../../ai-engine/agents/abstractions/agent.interface";
import { ExecutionMode, BUILTIN_TOOLS } from "../../../ai-engine/core";
import {
  WritingContextPackage,
  ChapterWritingContext,
} from "../interfaces/writing-context.interface";
import { ExpressionMemoryService } from "../services/quality/expression-memory.service";
import { CharacterPersonalityService } from "../services/quality/character-personality.service";
import { HistoricalKnowledgeService } from "../services/quality/historical-knowledge.service";
import { AiChatService } from "../../../ai-engine/llm/services/ai-chat.service";
import { TaskProfile } from "../../../ai-engine/llm/types";

// ==================== 输入输出类型 ====================

export interface WriterInput {
  /** 章节ID */
  chapterId: string;
  /** 写作上下文包 */
  contextPackage: WritingContextPackage;
  /** 章节写作上下文 */
  chapterContext: ChapterWritingContext;
  /** 写作实例ID（用于并行写作追踪） */
  writerInstanceId?: number;
}

export interface WriterOutput {
  /** 章节ID */
  chapterId: string;
  /** 生成的内容 */
  content: string;
  /** 字数 */
  wordCount: number;
  /** 写作元数据 */
  metadata: {
    /** 涉及的角色 */
    involvedCharacters: string[];
    /** 涉及的地点 */
    locations: string[];
    /** 故事内时间 */
    storyTime?: string;
    /** 需要更新的设定 */
    settingUpdates?: Array<{
      type: "character_state" | "new_term" | "timeline_event";
      data: Record<string, unknown>;
    }>;
  };
  /** 需要一致性检查的点 */
  checkpoints: Array<{
    type: string;
    description: string;
    location: string;
  }>;
}

// ==================== Agent 实现 ====================

@Injectable()
export class WriterAgent extends BaseAgent<WriterInput, WriterOutput> {
  readonly id = "writer-agent";
  readonly name = "Writer Agent";
  readonly description =
    "专业写作 Agent - 基于大纲和 Story Bible 完成章节创作（含质量控制）";

  readonly supportedModes: ExecutionMode[] = ["reactive", "hybrid"];

  readonly capabilities: AgentCapability[] = [
    {
      id: "chapter-writing",
      name: "Chapter Writing",
      description: "基于大纲和 Story Bible 设定完成章节创作",
      category: "generation",
    },
    {
      id: "style-consistency",
      name: "Style Consistency",
      description: "保持与项目整体风格一致的写作",
      category: "generation",
    },
    {
      id: "setting-adherence",
      name: "Setting Adherence",
      description: "严格遵循 Story Bible 中的设定进行创作",
      category: "validation",
    },
    {
      id: "quality-control",
      name: "Quality Control",
      description: "遵循表达冷却、人格约束和历史知识约束",
      category: "validation",
    },
  ];

  readonly requiredTools = [
    BUILTIN_TOOLS.TEXT_GENERATION,
    BUILTIN_TOOLS.RAG_SEARCH,
    BUILTIN_TOOLS.SHORT_TERM_MEMORY,
  ];

  constructor(
    private readonly expressionMemory: ExpressionMemoryService,
    private readonly characterPersonality: CharacterPersonalityService,
    private readonly historicalKnowledge: HistoricalKnowledgeService,
    private readonly aiChatService: AiChatService,
  ) {
    super();
  }

  /**
   * 验证质量服务是否正确注入
   */
  private async validateQualityServices(): Promise<void> {
    const services = [
      { name: "expressionMemory", service: this.expressionMemory },
      { name: "characterPersonality", service: this.characterPersonality },
      { name: "historicalKnowledge", service: this.historicalKnowledge },
    ];

    for (const { name, service } of services) {
      if (!service) {
        throw new Error(`质量服务 ${name} 未正确注入，写作任务无法执行`);
      }
    }

    this.logger.log("[Writer] Quality services validated successfully");
  }

  /**
   * 核心执行逻辑
   */
  protected async doExecute(
    input: WriterInput,
    _context: AgentContext,
  ): Promise<WriterOutput> {
    const { chapterId, contextPackage, chapterContext } = input;

    // 0. 验证质量服务
    await this.validateQualityServices();

    this.logger.log(
      `[Writer] Starting chapter ${chapterContext.chapter.chapterNumber}: ${chapterContext.chapter.title}`,
    );

    // 1. 获取质量约束（表达冷却、人格约束、历史知识）
    const qualityConstraints = await this.buildQualityConstraints(
      contextPackage,
      chapterContext,
    );

    // 2. 构建系统提示词（含质量约束）
    const systemPrompt = this.buildWriterSystemPrompt(
      contextPackage,
      qualityConstraints,
    );

    // 3. 构建用户提示词（包含章节上下文）
    const userPrompt = this.buildChapterPrompt(chapterContext, contextPackage);

    // 4. 调用 LLM 生成内容
    // 使用 TaskProfile 语义化描述任务需求
    const taskProfile: TaskProfile = {
      creativity: "high", // 创作需要更高的创造性 (原 temperature: 0.8)
      outputLength: "long", // 章节内容需要更多 tokens (原 maxTokens: 8192)
    };

    const response = await this.aiChatService.chat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      taskProfile,
      // 保持向后兼容：如果 TaskProfile 映射失败，使用原始参数
      temperature: 0.8,
      maxTokens: 8192,
    });

    const content = response.content || "";

    // 5. 解析生成的内容
    const wordCount = this.countWords(content);

    // 6. 提取元数据
    const metadata = this.extractMetadata(content, chapterContext);

    // 7. 识别需要检查的点
    const checkpoints = this.identifyCheckpoints(content, contextPackage);

    this.logger.log(
      `[Writer] Completed chapter ${chapterContext.chapter.chapterNumber}, ${wordCount} words`,
    );

    return {
      chapterId,
      content,
      wordCount,
      metadata,
      checkpoints,
    };
  }

  /**
   * 构建质量约束提示词
   */
  private async buildQualityConstraints(
    contextPackage: WritingContextPackage,
    chapterContext: ChapterWritingContext,
  ): Promise<string> {
    const parts: string[] = [];
    const projectId = contextPackage.extensions.storyBible.bibleId;
    const chapterNumber = chapterContext.chapter.chapterNumber;

    // 1. 表达冷却约束
    try {
      const avoidancePrompt =
        await this.expressionMemory.generateAvoidancePrompt(
          projectId,
          chapterNumber,
        );
      if (avoidancePrompt) {
        parts.push(avoidancePrompt);
      }
    } catch (error) {
      this.logger.error(
        `[Writer] Failed to get expression constraints: ${error}`,
      );
      throw error;
    }

    // 2. 角色人格约束
    try {
      const characterNames = chapterContext.involvedCharacters.map(
        (c) => c.name,
      );
      if (characterNames.length > 0) {
        const constraints =
          await this.characterPersonality.getPersonalityConstraints(
            projectId,
            characterNames,
          );

        if (constraints.length > 0) {
          const constraintPrompt =
            this.characterPersonality.generateConstraintPrompt(constraints);
          if (constraintPrompt) {
            parts.push(constraintPrompt);
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `[Writer] Failed to get personality constraints: ${error}`,
      );
      throw error;
    }

    // 3. 历史知识约束
    try {
      // 从项目设置中获取朝代（假设存储在 worldType 中）
      const dynasty = contextPackage.extensions.storyBible.worldType;
      if (dynasty && (dynasty.includes("明") || dynasty.includes("清"))) {
        const historicalPrompt =
          await this.historicalKnowledge.generateHistoricalConstraintPrompt(
            dynasty.includes("明") ? "明朝" : "清朝",
          );
        if (historicalPrompt) {
          parts.push(historicalPrompt);
        }
      }
    } catch (error) {
      this.logger.error(
        `[Writer] Failed to get historical constraints: ${error}`,
      );
      throw error;
    }

    return parts.join("\n\n");
  }

  /**
   * 构建写作系统提示词
   */
  private buildWriterSystemPrompt(
    contextPackage: WritingContextPackage,
    qualityConstraints: string = "",
  ): string {
    const storyBible = contextPackage.extensions.storyBible;
    const writingStyle = storyBible.writingStyle;

    let prompt = `你是一位专业的创意写作 Agent，负责执行具体的章节写作任务。

## 核心职责
1. 章节写作：基于大纲和设定完成章节创作
2. 风格一致：保持与项目整体风格一致
3. 设定遵循：严格遵循 Story Bible 中的设定
4. 多样性：避免重复使用相同的表达和情节模式

## 写作风格
- 视角：${writingStyle?.pov || "第三人称限定"}
- 时态：${writingStyle?.tense || "过去时"}
- 词汇水平：${writingStyle?.vocabulary || "intermediate"}
- 对话风格：${writingStyle?.dialogueStyle || "自然流畅"}
- 描写风格：${writingStyle?.descriptionStyle || "细腻生动"}

## 硬性约束（必须遵守）
${contextPackage.hardConstraints.map((c) => `- [${c.severity}] ${c.rule}`).join("\n")}

## 术语表（确保一致性）
${Object.entries(contextPackage.glossary || {})
  .slice(0, 30)
  .map(([term, def]) => `- ${term}: ${def}`)
  .join("\n")}

## 已确立事实（必须保持一致）
${(contextPackage.establishedFacts || [])
  .filter((f) => f.importance === "high")
  .slice(-20)
  .map((f) => `- ${f.statement}`)
  .join("\n")}

## 输出要求
- 直接输出章节正文，无需额外标记
- 保持叙事流畅，情节连贯
- 对话要符合角色性格
- 描写要符合世界观设定
- 避免使用禁用表达列表中的词汇

## 章节结尾禁忌（严格禁止）
- 禁止在章节结尾使用总结性旁白，如"她知道，未来的斗争才刚刚开始"
- 禁止使用预告式结尾，如"而这一切，只是开始"、"风暴即将来临"
- 禁止使用抒情点题，如"命运的齿轮开始转动"、"历史的洪流..."
- 禁止使用人生感悟式结尾，如"她明白了..."、"此刻她终于懂得..."
- 章节应在具体的动作、对话或场景描写中自然结束，而非抽象的议论或预言
- 好的结尾示例：对话戛然而止、门被关上、脚步声远去、烛火熄灭`;

    // 添加质量约束
    if (qualityConstraints) {
      prompt += `\n\n${qualityConstraints}`;
    }

    return prompt;
  }

  /**
   * 构建章节写作提示词
   */
  private buildChapterPrompt(
    chapterContext: ChapterWritingContext,
    _contextPackage: WritingContextPackage,
  ): string {
    const {
      chapter,
      previousContext,
      involvedCharacters,
      writingInstructions,
    } = chapterContext;

    let prompt = `## 章节任务

### 第${chapter.chapterNumber}章：${chapter.title}

### 章节大纲
${chapter.outline || "无具体大纲，请根据上下文自由发挥"}

`;

    // 添加前情提要
    if (previousContext.length > 0) {
      prompt += `### 前情提要
${previousContext.map((p) => `**第${p.chapterNumber}章 ${p.title}**\n${p.summary}`).join("\n\n")}

`;
    }

    // 添加涉及角色
    if (involvedCharacters.length > 0) {
      prompt += `### 本章涉及角色
${involvedCharacters.map((c) => this.formatCharacterForPrompt(c)).join("\n\n")}

`;
    }

    // 添加场景设定
    if (chapterContext.relevantWorldSettings.length > 0) {
      prompt += `### 场景设定
${chapterContext.relevantWorldSettings.map((s) => `**${s.name}** (${s.category})\n${s.description}`).join("\n\n")}

`;
    }

    // 添加写作指令
    if (writingInstructions) {
      prompt += `### 写作要求
- 目标字数：${writingInstructions.targetWordCount || 3000}字
${writingInstructions.focusPoints ? `- 重点描写：${writingInstructions.focusPoints.join("、")}` : ""}
${writingInstructions.avoidPoints ? `- 避免出现：${writingInstructions.avoidPoints.join("、")}` : ""}
${writingInstructions.additionalInstructions || ""}

`;
    }

    prompt += `请开始写作第${chapter.chapterNumber}章的内容。`;

    return prompt;
  }

  /**
   * 格式化角色信息
   */
  private formatCharacterForPrompt(
    character: ChapterWritingContext["involvedCharacters"][0],
  ): string {
    const parts = [`**${character.name}** (${character.role})`];

    if (character.appearance) {
      const app = character.appearance;
      const appParts = [];
      if (app.gender) appParts.push(app.gender);
      if (app.age) appParts.push(app.age);
      if (app.hair) appParts.push(`${app.hair}发`);
      if (app.eyes) appParts.push(`${app.eyes}眼`);
      if (app.distinguishingFeatures?.length) {
        appParts.push(app.distinguishingFeatures.join("、"));
      }
      if (appParts.length > 0) {
        parts.push(`外貌：${appParts.join("，")}`);
      }
    }

    if (character.personality?.traits?.length) {
      parts.push(`性格：${character.personality.traits.join("、")}`);
    }

    if (character.personality?.speechPattern) {
      parts.push(`说话方式：${character.personality.speechPattern}`);
    }

    if (character.currentState?.state) {
      const state = character.currentState.state;
      const stateParts = [];
      if (state.location) stateParts.push(`位于${state.location}`);
      if (state.condition) stateParts.push(state.condition);
      if (state.mood) stateParts.push(state.mood);
      if (stateParts.length > 0) {
        parts.push(`当前状态：${stateParts.join("，")}`);
      }
    }

    return parts.join("\n");
  }

  /**
   * 提取元数据
   */
  private extractMetadata(
    content: string,
    chapterContext: ChapterWritingContext,
  ): WriterOutput["metadata"] {
    // 涉及的角色（从上下文中获取，因为 LLM 生成的内容中应该包含这些角色）
    const involvedCharacters = chapterContext.involvedCharacters.map(
      (c) => c.name,
    );

    // 提取地点（简单的模式匹配，可以用 NLP 增强）
    const locationPatterns =
      /(?:在|到|去|于|来到|走进|进入)([^\s，。,\.]{2,10})/g;
    const locations: string[] = [];
    let match;
    while ((match = locationPatterns.exec(content)) !== null) {
      if (!locations.includes(match[1])) {
        locations.push(match[1]);
      }
    }

    return {
      involvedCharacters,
      locations: locations.slice(0, 10),
      storyTime: chapterContext.timelineContext[0]?.storyTime,
    };
  }

  /**
   * 识别需要检查的点
   */
  private identifyCheckpoints(
    content: string,
    contextPackage: WritingContextPackage,
  ): WriterOutput["checkpoints"] {
    const checkpoints: WriterOutput["checkpoints"] = [];
    const storyBible = contextPackage.extensions.storyBible;

    // 检查角色名是否出现在内容中
    storyBible.characters.forEach((char) => {
      if (content.includes(char.name)) {
        checkpoints.push({
          type: "character_mention",
          description: `角色 ${char.name} 在本章出现`,
          location: `包含 "${char.name}" 的段落`,
        });

        // 检查别名
        char.aliases?.forEach((alias) => {
          if (content.includes(alias)) {
            checkpoints.push({
              type: "alias_usage",
              description: `使用了 ${char.name} 的别名 ${alias}`,
              location: `包含 "${alias}" 的段落`,
            });
          }
        });
      }
    });

    // 检查术语使用
    storyBible.terminologies.forEach((term) => {
      if (content.includes(term.term)) {
        checkpoints.push({
          type: "terminology_usage",
          description: `使用了术语 ${term.term}`,
          location: `包含 "${term.term}" 的段落`,
        });
      }
    });

    return checkpoints.slice(0, 20); // 限制数量
  }

  /**
   * 计算字数（中英文混合）
   */
  private countWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = text
      .replace(/[\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return chineseChars + englishWords;
  }
}
