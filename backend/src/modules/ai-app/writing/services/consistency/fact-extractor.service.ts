/**
 * FactExtractorService - 自动事实提取服务
 *
 * 核心职责：
 * - 从章节内容中提取关键事实
 * - 保存到数据库以供后续章节参考
 * - 支持事实查询和冲突检测
 * - 构建事实上下文供写作使用
 *
 * 架构说明：
 * - 使用 LLM 进行智能事实提取
 * - 事实存储在章节的 metadata JSON 字段中
 * - 支持语义冲突检测
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { AIModelType } from "@prisma/client";
import { ChapterWritingContext } from "../../interfaces/writing-context.interface";
import { TaskProfile } from "../../../../ai-engine/llm/types";

// ==================== 事实类型定义 ====================

/**
 * 事实类型
 */
export type FactType =
  | "CHARACTER_STATE" // 角色状态：位置、情绪、健康状况
  | "PLOT_EVENT" // 情节事件：发生了什么
  | "WORLD_FACT" // 世界事实：世界观规则、设定
  | "TIMELINE" // 时间线：何时发生
  | "OBJECT" // 物品：重要道具、物品
  | "RELATIONSHIP"; // 关系：角色之间的关系变化

/**
 * 冲突类型
 */
export type ConflictType =
  | "CONTRADICTION" // 直接矛盾
  | "INCONSISTENCY" // 不一致
  | "TIMELINE_ERROR"; // 时间线错误

/**
 * 提取的事实
 */
export interface ExtractedFact {
  /** 事实类型 */
  type: FactType;
  /** 主体（谁/什么） */
  subject: string;
  /** 谓语（做了什么/是什么） */
  predicate: string;
  /** 宾语（对谁/对什么） - 可选 */
  object?: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 原文引用 */
  evidence: string;
  /** 章节编号 */
  chapterNumber: number;
  /** 故事内时间 - 可选 */
  storyTime?: string;
  /** 提取时间 */
  extractedAt: string;
}

/**
 * 事实冲突
 */
export interface FactConflict {
  /** 已存在的事实 */
  existingFact: ExtractedFact;
  /** 新事实 */
  newFact: ExtractedFact;
  /** 冲突类型 */
  conflictType: ConflictType;
  /** 冲突描述 */
  description: string;
  /** 严重程度 */
  severity: "CRITICAL" | "WARNING" | "INFO";
}

/**
 * 章节元数据中的事实存储
 */
interface ChapterFactMetadata {
  /** 事实列表 */
  facts?: ExtractedFact[];
  /** 最后更新时间 */
  factsUpdatedAt?: string;
}

// ==================== 提示词模板 ====================

/**
 * 事实提取提示词
 */
const FACT_EXTRACTION_PROMPT = `你是一个专业的小说事实提取助手。请从给定的章节内容中提取关键事实。

## 事实类型

1. **CHARACTER_STATE**：角色状态
   - 位置：角色在哪里
   - 情绪：角色的情绪状态
   - 健康：角色的健康状况、受伤等
   - 能力：角色获得或失去的能力

2. **PLOT_EVENT**：情节事件
   - 发生的重要事件
   - 决策和选择
   - 冲突和转折

3. **WORLD_FACT**：世界事实
   - 世界观规则的确立
   - 场景描述
   - 设定的揭示

4. **TIMELINE**：时间线
   - 明确的时间点
   - 时间流逝

5. **OBJECT**：物品
   - 重要道具出现
   - 物品状态变化
   - 物品转移

6. **RELATIONSHIP**：关系
   - 角色关系变化
   - 联盟/敌对关系确立

## 提取要求

- 只提取**确定发生**的事实，不要提取推测、假设、对话中的虚构内容
- 每个事实必须有**明确的文本证据**
- 事实描述要**具体、准确**
- 置信度评估：非常确定=0.9-1.0，比较确定=0.7-0.9，一般=0.5-0.7
- 提取 10-20 个最重要的事实即可

## 输出格式

请以 JSON 数组格式输出，每个事实包含：

\`\`\`json
[
  {
    "type": "CHARACTER_STATE",
    "subject": "主角",
    "predicate": "受重伤",
    "object": "",
    "confidence": 0.95,
    "evidence": "原文引用片段（20-50字）",
    "storyTime": "第三天黄昏"
  }
]
\`\`\`

---

## 章节信息

- 章节编号：{{chapterNumber}}
- 章节标题：{{chapterTitle}}

## 章节内容

{{content}}

---

请提取事实：`;

/**
 * 冲突检测提示词
 */
const CONFLICT_DETECTION_PROMPT = `你是一个专业的小说一致性检查助手。请检测新事实与已有事实之间是否存在冲突。

## 冲突类型

1. **CONTRADICTION**：直接矛盾
   - 事实 A 说角色在北京，事实 B 说同一时间角色在上海

2. **INCONSISTENCY**：不一致
   - 事实 A 说角色受重伤，事实 B 说角色行动自如（没有明确的恢复过程）

3. **TIMELINE_ERROR**：时间线错误
   - 事件发生顺序不合理
   - 时间倒流

## 检测要求

- 只标记**明确的冲突**，不要过度敏感
- 考虑**故事时间流逝**，允许合理的状态变化
- 如果有合理解释，不算冲突

## 输出格式

如果有冲突，输出 JSON 数组：

\`\`\`json
[
  {
    "conflictType": "CONTRADICTION",
    "description": "角色位置矛盾：第3章在北京，第5章同一天在上海",
    "severity": "CRITICAL"
  }
]
\`\`\`

如果没有冲突，输出：

\`\`\`json
[]
\`\`\`

---

## 已有事实

{{existingFacts}}

---

## 新事实

{{newFacts}}

---

请检测冲突：`;

// ==================== Service 实现 ====================

@Injectable()
export class FactExtractorService {
  private readonly logger = new Logger(FactExtractorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFacade: AIEngineFacade,
  ) {}

  /**
   * 从章节内容中提取事实
   */
  async extractFacts(
    chapterContent: string,
    context: ChapterWritingContext,
  ): Promise<ExtractedFact[]> {
    this.logger.log(
      `Extracting facts from chapter ${context.chapter.chapterNumber}: ${context.chapter.title}`,
    );

    if (!chapterContent || chapterContent.trim().length < 100) {
      this.logger.warn("Chapter content too short, skipping fact extraction");
      return [];
    }

    try {
      // 构建提示词
      const prompt = FACT_EXTRACTION_PROMPT.replace(
        "{{chapterNumber}}",
        context.chapter.chapterNumber.toString(),
      )
        .replace("{{chapterTitle}}", context.chapter.title)
        .replace("{{content}}", chapterContent);

      // 调用 LLM 提取事实
      // 使用 TaskProfile 语义化描述任务特征
      const taskProfile: TaskProfile = {
        creativity: "low", // 事实提取需要准确性而非创造性 (原 temperature: 0.3)
        outputLength: "short", // 事实提取输出较短 (原 maxTokens: 2000)
      };

      const response = await this.aiFacade.chat({
        modelType: AIModelType.CHAT, // 需要高能力模型进行准确提取
        messages: [{ role: "user", content: prompt }],
        taskProfile,
      });

      // 解析 JSON 响应
      const factsData = this.parseJsonResponse(response.content);

      if (!Array.isArray(factsData)) {
        this.logger.warn("Invalid facts data format, expected array");
        return [];
      }

      // 转换为 ExtractedFact 类型并添加章节编号
      const facts: ExtractedFact[] = factsData.map((fact: any) => ({
        type: fact.type as FactType,
        subject: fact.subject || "",
        predicate: fact.predicate || "",
        object: fact.object || undefined,
        confidence: fact.confidence || 0.5,
        evidence: fact.evidence || "",
        chapterNumber: context.chapter.chapterNumber,
        storyTime: fact.storyTime || undefined,
        extractedAt: new Date().toISOString(),
      }));

      this.logger.log(`Extracted ${facts.length} facts from chapter`);

      return facts;
    } catch (error) {
      this.logger.error(
        `Failed to extract facts: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 保存事实到数据库
   */
  async saveFacts(
    projectId: string,
    chapterId: string,
    facts: ExtractedFact[],
  ): Promise<void> {
    this.logger.log(
      `Saving ${facts.length} facts for chapter ${chapterId} in project ${projectId}`,
    );

    try {
      // 获取当前章节
      const chapter = await this.prisma.writingChapter.findUnique({
        where: { id: chapterId },
        include: {
          volume: {
            select: { projectId: true },
          },
        },
      });

      if (!chapter) {
        throw new Error(`Chapter ${chapterId} not found`);
      }

      if (chapter.volume.projectId !== projectId) {
        throw new Error("Project ID mismatch");
      }

      // 更新章节 metadata
      const currentMetadata = (chapter.metadata as ChapterFactMetadata) || {};
      const updatedMetadata: ChapterFactMetadata = {
        ...currentMetadata,
        facts,
        factsUpdatedAt: new Date().toISOString(),
      };

      await this.prisma.writingChapter.update({
        where: { id: chapterId },
        data: {
          metadata: updatedMetadata as any,
        },
      });

      this.logger.log(`Facts saved successfully for chapter ${chapterId}`);
    } catch (error) {
      this.logger.error(
        `Failed to save facts: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 获取项目的所有事实
   */
  async getFacts(
    projectId: string,
    options?: {
      /** 按事实类型筛选 */
      type?: FactType;
      /** 按章节编号筛选 */
      chapterNumber?: number;
      /** 按角色筛选 */
      character?: string;
      /** 最多返回多少个事实 */
      limit?: number;
    },
  ): Promise<ExtractedFact[]> {
    this.logger.log(`Getting facts for project ${projectId}`);

    try {
      // 查询项目的所有章节
      const chapters = await this.prisma.writingChapter.findMany({
        where: {
          volume: {
            projectId,
          },
          ...(options?.chapterNumber
            ? { chapterNumber: options.chapterNumber }
            : {}),
        },
        select: {
          id: true,
          chapterNumber: true,
          metadata: true,
        },
        orderBy: {
          chapterNumber: "asc",
        },
      });

      // 从章节 metadata 中提取所有事实
      let allFacts: ExtractedFact[] = [];

      for (const chapter of chapters) {
        const metadata = chapter.metadata as ChapterFactMetadata;
        if (metadata?.facts && Array.isArray(metadata.facts)) {
          allFacts.push(...metadata.facts);
        }
      }

      // 应用筛选条件
      if (options?.type) {
        allFacts = allFacts.filter((fact) => fact.type === options.type);
      }

      if (options?.character) {
        allFacts = allFacts.filter(
          (fact) =>
            fact.subject.includes(options.character!) ||
            fact.object?.includes(options.character!) ||
            false,
        );
      }

      // 应用限制
      if (options?.limit && options.limit > 0) {
        allFacts = allFacts.slice(0, options.limit);
      }

      this.logger.log(`Retrieved ${allFacts.length} facts for project`);

      return allFacts;
    } catch (error) {
      this.logger.error(
        `Failed to get facts: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 检测新事实与已有事实的冲突
   */
  async detectConflicts(
    projectId: string,
    newFacts: ExtractedFact[],
  ): Promise<FactConflict[]> {
    this.logger.log(
      `Detecting conflicts for ${newFacts.length} new facts in project ${projectId}`,
    );

    if (newFacts.length === 0) {
      return [];
    }

    try {
      // 获取项目的所有已有事实（排除当前章节）
      const currentChapterNumber = newFacts[0]?.chapterNumber;
      const existingFacts = await this.getFacts(projectId);

      // 过滤出当前章节之前的事实
      const previousFacts = existingFacts.filter(
        (fact) => fact.chapterNumber < currentChapterNumber,
      );

      if (previousFacts.length === 0) {
        this.logger.log("No previous facts to check against");
        return [];
      }

      // 构建提示词
      const prompt = CONFLICT_DETECTION_PROMPT.replace(
        "{{existingFacts}}",
        JSON.stringify(previousFacts, null, 2),
      ).replace("{{newFacts}}", JSON.stringify(newFacts, null, 2));

      // 调用 LLM 检测冲突
      // 使用 TaskProfile 语义化描述任务特征
      const taskProfile: TaskProfile = {
        creativity: "deterministic", // 冲突检测需要严格判断 (原 temperature: 0.2)
        outputLength: "short", // 冲突检测输出较短 (原 maxTokens: 1500)
      };

      const response = await this.aiFacade.chat({
        modelType: AIModelType.CHAT, // 需要高能力模型进行准确判断
        messages: [{ role: "user", content: prompt }],
        taskProfile,
      });

      // 解析 JSON 响应
      const conflictsData = this.parseJsonResponse(response.content);

      if (!Array.isArray(conflictsData)) {
        this.logger.warn("Invalid conflicts data format, expected array");
        return [];
      }

      // 构建 FactConflict 对象
      const conflicts: FactConflict[] = conflictsData
        .map((conflictData: any) => {
          // 尝试从描述中找到相关的事实
          const existingFact = previousFacts[0]; // 简化处理
          const newFact = newFacts[0]; // 简化处理

          return {
            existingFact,
            newFact,
            conflictType: conflictData.conflictType as ConflictType,
            description: conflictData.description || "Unknown conflict",
            severity: conflictData.severity as "CRITICAL" | "WARNING" | "INFO",
          };
        })
        .filter((c) => c !== null) as FactConflict[];

      this.logger.log(`Detected ${conflicts.length} conflicts`);

      return conflicts;
    } catch (error) {
      this.logger.error(
        `Failed to detect conflicts: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 构建事实上下文（用于注入到写作提示词）
   */
  async buildFactContext(
    projectId: string,
    chapterNumber: number,
  ): Promise<string> {
    this.logger.log(
      `Building fact context for chapter ${chapterNumber} in project ${projectId}`,
    );

    try {
      // 获取当前章节之前的所有事实
      const facts = await this.getFacts(projectId);
      const previousFacts = facts.filter(
        (fact) => fact.chapterNumber < chapterNumber,
      );

      if (previousFacts.length === 0) {
        return "（暂无已确立的事实）";
      }

      // 按类型分组
      const factsByType = new Map<FactType, ExtractedFact[]>();
      for (const fact of previousFacts) {
        if (!factsByType.has(fact.type)) {
          factsByType.set(fact.type, []);
        }
        factsByType.get(fact.type)!.push(fact);
      }

      // 构建上下文文本
      const sections: string[] = [];

      // 角色状态
      if (factsByType.has("CHARACTER_STATE")) {
        const characterFacts = factsByType.get("CHARACTER_STATE")!;
        sections.push("### 角色状态");
        for (const fact of characterFacts.slice(-10)) {
          // 只取最近10个
          sections.push(
            `- ${fact.subject}：${fact.predicate}${fact.object ? " " + fact.object : ""} (第${fact.chapterNumber}章)`,
          );
        }
      }

      // 情节事件
      if (factsByType.has("PLOT_EVENT")) {
        const plotFacts = factsByType.get("PLOT_EVENT")!;
        sections.push("\n### 情节事件");
        for (const fact of plotFacts.slice(-10)) {
          sections.push(
            `- ${fact.subject}${fact.predicate}${fact.object ? " " + fact.object : ""} (第${fact.chapterNumber}章)`,
          );
        }
      }

      // 时间线
      if (factsByType.has("TIMELINE")) {
        const timelineFacts = factsByType.get("TIMELINE")!;
        sections.push("\n### 时间线");
        for (const fact of timelineFacts.slice(-10)) {
          sections.push(
            `- ${fact.storyTime || "未知时间"}：${fact.subject}${fact.predicate} (第${fact.chapterNumber}章)`,
          );
        }
      }

      // 关系变化
      if (factsByType.has("RELATIONSHIP")) {
        const relationshipFacts = factsByType.get("RELATIONSHIP")!;
        sections.push("\n### 角色关系");
        for (const fact of relationshipFacts.slice(-10)) {
          sections.push(
            `- ${fact.subject}与${fact.object || ""}：${fact.predicate} (第${fact.chapterNumber}章)`,
          );
        }
      }

      return sections.join("\n");
    } catch (error) {
      this.logger.error(
        `Failed to build fact context: ${error instanceof Error ? error.message : String(error)}`,
      );
      return "（无法加载事实上下文）";
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 解析 JSON 响应（处理 Markdown 代码块）
   */
  private parseJsonResponse(content: string): any {
    try {
      // 尝试直接解析
      return JSON.parse(content);
    } catch {
      // 尝试提取 Markdown 代码块中的 JSON
      const match = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch {
          this.logger.warn("Failed to parse JSON from code block");
        }
      }

      // 尝试查找 JSON 数组或对象
      const jsonMatch = content.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          this.logger.warn("Failed to parse extracted JSON");
        }
      }

      this.logger.warn("Could not extract valid JSON from response");
      return [];
    }
  }
}
