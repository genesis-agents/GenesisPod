/**
 * Slides Engine v3.0 - Narrative Planner Skill
 *
 * 叙事规划技能 (Layer 2)：基于意图分析生成完整的叙事结构
 * 使用 Architect 角色 (CHAT + QUALITY_FIRST)
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  MultiModelService,
  RoleCallInput,
} from "../orchestrator/multi-model.service";
import {
  NarrativePlan,
  NarrativePattern,
  Storyline,
  EmotionalNode,
  DensityLevel,
  IntentAnalysis,
  TaskDecomposition,
} from "../checkpoint/checkpoint.types";

/**
 * 叙事规划输入
 */
export interface NarrativePlannerInput {
  /** 意图分析结果 */
  intentAnalysis: IntentAnalysis;
  /** 任务分解结果 */
  taskDecomposition: TaskDecomposition;
  /** 源文本 */
  sourceText: string;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 叙事规划系统提示词
 */
const NARRATIVE_PLANNING_SYSTEM_PROMPT = `你是一位专业的演示文稿叙事设计师，负责设计演示的故事结构和情感曲线。

## 你的任务

基于意图分析和任务分解结果，设计完整的叙事规划：

1. **故事情节结构** (storyline)：
   - hook: 开场钩子（1-2页）- 抓住注意力的元素
   - context: 背景铺垫（1-3页）- 设置场景和问题背景
   - tension: 问题/挑战（2-4页）- 制造紧张感，展示痛点
   - resolution: 解决方案（3-6页）- 核心内容，解决方案
   - proof: 证据/数据（2-4页）- 支撑论点的证据
   - callToAction: 行动号召（1-2页）- 促进行动的结尾

2. **叙事模式** (narrativePattern)：
   - problem-solution: 问题 -> 方案 -> 证据 -> 行动（最常用）
   - journey: 过去 -> 现在 -> 未来（适合发展类主题）
   - pyramid: 结论 -> 支撑1/2/3 -> 总结（适合汇报）
   - comparison: A vs B -> 分析 -> 建议（适合对比类）
   - teaching: 概念 -> 原理 -> 示例 -> 练习（适合培训）

3. **信息密度节奏** (rhythmPattern)：
   - 设计每页的信息密度：high（数据密集）/ medium（平衡）/ low（过渡/强调）
   - 避免连续超过2页的高密度内容
   - 在高密度内容后安排低密度休息页

4. **情感曲线** (emotionalArc)：
   - curiosity: 好奇心（开头，引发兴趣）
   - concern: 担忧（问题阶段）
   - hope: 希望（解决方案阶段）
   - confidence: 信心（证据阶段）
   - urgency: 紧迫感（行动号召）

## 输出格式

\`\`\`json
{
  "narrativePattern": "problem-solution",
  "storyline": {
    "hook": ["引人入胜的开场内容"],
    "context": ["背景信息"],
    "tension": ["问题和挑战"],
    "resolution": ["解决方案"],
    "proof": ["证据和数据"],
    "callToAction": ["行动号召"]
  },
  "rhythmPattern": ["low", "medium", "high", "medium", "low"],
  "emotionalArc": [
    {"page": 1, "emotion": "curiosity"},
    {"page": 5, "emotion": "concern"},
    {"page": 10, "emotion": "hope"},
    {"page": 15, "emotion": "confidence"},
    {"page": 18, "emotion": "urgency"}
  ],
  "climaxPage": 12,
  "pageAllocation": [
    {"section": "开场", "pageRange": [1, 2], "purpose": "抓住注意力"},
    {"section": "背景", "pageRange": [3, 5], "purpose": "设置场景"}
  ]
}
\`\`\``;

@Injectable()
export class NarrativePlannerSkill {
  private readonly logger = new Logger(NarrativePlannerSkill.name);

  constructor(private readonly multiModel: MultiModelService) {}

  /**
   * 执行叙事规划
   */
  async execute(input: NarrativePlannerInput): Promise<NarrativePlan> {
    this.logger.log(
      `[execute] Starting narrative planning for ${input.taskDecomposition.totalPages} pages`,
    );

    const userMessage = this.buildUserMessage(input);

    const roleCall: RoleCallInput = {
      role: "architect",
      messages: [
        { role: "system", content: NARRATIVE_PLANNING_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 4096,
      temperature: 0.3,
      metadata: {
        sessionId: input.sessionId,
        phase: "narrative_planning",
      },
    };

    const result = await this.multiModel.callByRole(roleCall);

    if (!result.success || !result.content) {
      this.logger.error("[execute] AI call failed:", result.error);
      return this.createFallbackPlan(input);
    }

    const plan = this.parseResponse(result.content, input);

    this.logger.log(
      `[execute] Narrative planning complete: pattern=${plan.narrativePattern}, climax=${plan.climaxPage}`,
    );

    return plan;
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(input: NarrativePlannerInput): string {
    const { intentAnalysis, taskDecomposition, sourceText } = input;

    return `## 意图分析结果

- 演示目的: ${intentAnalysis.purpose}
- 目标受众: ${intentAnalysis.audience.type} (${intentAnalysis.audience.expertise})
- 演示语调: ${intentAnalysis.tone}
- 核心信息: ${intentAnalysis.keyMessage}
- 预期成果: ${intentAnalysis.expectedOutcome}

## 任务分解结果

- 总页数: ${taskDecomposition.totalPages}
- 章节数: ${taskDecomposition.chapters.length}
- 章节结构:
${taskDecomposition.chapters.map((ch) => `  - ${ch.title} (第${ch.pageRange[0]}-${ch.pageRange[1]}页)`).join("\n")}

## 源文本摘要

${sourceText.substring(0, 2000)}${sourceText.length > 2000 ? "\n\n[...内容已截断...]" : ""}

## 请求

请设计完整的叙事规划，输出 JSON 格式结果。`;
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(
    content: string,
    input: NarrativePlannerInput,
  ): NarrativePlan {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr);
      return this.validateAndNormalize(parsed, input);
    } catch (error) {
      this.logger.error("[parseResponse] JSON parse error:", error);
      return this.createFallbackPlan(input);
    }
  }

  /**
   * 验证并规范化解析结果
   */
  private validateAndNormalize(
    parsed: Record<string, unknown>,
    input: NarrativePlannerInput,
  ): NarrativePlan {
    const totalPages = input.taskDecomposition.totalPages;

    // 验证叙事模式
    const validPatterns: NarrativePattern[] = [
      "problem-solution",
      "journey",
      "pyramid",
      "comparison",
      "teaching",
    ];
    const narrativePattern: NarrativePattern = validPatterns.includes(
      parsed.narrativePattern as NarrativePattern,
    )
      ? (parsed.narrativePattern as NarrativePattern)
      : "problem-solution";

    // 解析故事情节
    const storylineRaw = parsed.storyline as
      | Record<string, unknown>
      | undefined;
    const storyline: Storyline = {
      hook: Array.isArray(storylineRaw?.hook)
        ? storylineRaw.hook.map(String)
        : ["引人入胜的开场"],
      context: Array.isArray(storylineRaw?.context)
        ? storylineRaw.context.map(String)
        : ["背景介绍"],
      tension: Array.isArray(storylineRaw?.tension)
        ? storylineRaw.tension.map(String)
        : ["问题和挑战"],
      resolution: Array.isArray(storylineRaw?.resolution)
        ? storylineRaw.resolution.map(String)
        : ["解决方案"],
      proof: Array.isArray(storylineRaw?.proof)
        ? storylineRaw.proof.map(String)
        : ["证据和数据"],
      callToAction: Array.isArray(storylineRaw?.callToAction)
        ? storylineRaw.callToAction.map(String)
        : ["行动号召"],
    };

    // 解析节奏模式
    let rhythmPattern: DensityLevel[] = [];
    if (Array.isArray(parsed.rhythmPattern)) {
      rhythmPattern = parsed.rhythmPattern.map((r) => {
        const level = String(r).toLowerCase();
        if (level === "high" || level === "medium" || level === "low") {
          return level;
        }
        return "medium";
      });
    }
    // 确保长度匹配
    while (rhythmPattern.length < totalPages) {
      rhythmPattern.push("medium");
    }
    rhythmPattern = rhythmPattern.slice(0, totalPages);

    // 解析情感曲线
    let emotionalArc: EmotionalNode[] = [];
    if (Array.isArray(parsed.emotionalArc)) {
      emotionalArc = parsed.emotionalArc
        .map((node: Record<string, unknown>) => ({
          page: typeof node.page === "number" ? node.page : 1,
          emotion: this.validateEmotion(node.emotion),
        }))
        .filter((node: EmotionalNode) => node.page <= totalPages);
    }
    if (emotionalArc.length === 0) {
      emotionalArc = this.generateDefaultEmotionalArc(totalPages);
    }

    // 解析页面分配
    let pageAllocation: NarrativePlan["pageAllocation"] = [];
    if (Array.isArray(parsed.pageAllocation)) {
      pageAllocation = parsed.pageAllocation.map(
        (item: Record<string, unknown>) => ({
          section: String(item.section || "未命名章节"),
          pageRange: Array.isArray(item.pageRange)
            ? ([item.pageRange[0], item.pageRange[1]] as [number, number])
            : ([1, 1] as [number, number]),
          purpose: String(item.purpose || ""),
        }),
      );
    }
    if (pageAllocation.length === 0) {
      pageAllocation = this.generateDefaultPageAllocation(
        input.taskDecomposition,
      );
    }

    return {
      storyline,
      rhythmPattern,
      emotionalArc,
      narrativePattern,
      climaxPage:
        typeof parsed.climaxPage === "number"
          ? parsed.climaxPage
          : Math.floor(totalPages * 0.7),
      pageAllocation,
    };
  }

  /**
   * 验证情感类型
   */
  private validateEmotion(emotion: unknown): EmotionalNode["emotion"] {
    const validEmotions: EmotionalNode["emotion"][] = [
      "curiosity",
      "concern",
      "hope",
      "confidence",
      "urgency",
    ];
    const emotionStr = String(emotion).toLowerCase();
    return validEmotions.includes(emotionStr as EmotionalNode["emotion"])
      ? (emotionStr as EmotionalNode["emotion"])
      : "curiosity";
  }

  /**
   * 生成默认情感曲线
   */
  private generateDefaultEmotionalArc(totalPages: number): EmotionalNode[] {
    const arc: EmotionalNode[] = [];
    arc.push({ page: 1, emotion: "curiosity" });
    arc.push({ page: Math.floor(totalPages * 0.2), emotion: "concern" });
    arc.push({ page: Math.floor(totalPages * 0.5), emotion: "hope" });
    arc.push({ page: Math.floor(totalPages * 0.75), emotion: "confidence" });
    arc.push({ page: totalPages, emotion: "urgency" });
    return arc;
  }

  /**
   * 生成默认页面分配
   */
  private generateDefaultPageAllocation(
    taskDecomposition: TaskDecomposition,
  ): NarrativePlan["pageAllocation"] {
    return taskDecomposition.chapters.map((ch) => ({
      section: ch.title,
      pageRange: ch.pageRange,
      purpose: ch.keyPoints[0] || "核心内容",
    }));
  }

  /**
   * 创建降级规划
   */
  private createFallbackPlan(input: NarrativePlannerInput): NarrativePlan {
    const totalPages = input.taskDecomposition.totalPages;

    return {
      storyline: {
        hook: ["引人入胜的开场"],
        context: ["背景介绍"],
        tension: ["问题和挑战"],
        resolution: ["解决方案"],
        proof: ["证据和数据"],
        callToAction: ["行动号召"],
      },
      rhythmPattern: Array(totalPages).fill("medium"),
      emotionalArc: this.generateDefaultEmotionalArc(totalPages),
      narrativePattern: "problem-solution",
      climaxPage: Math.floor(totalPages * 0.7),
      pageAllocation: this.generateDefaultPageAllocation(
        input.taskDecomposition,
      ),
    };
  }
}
