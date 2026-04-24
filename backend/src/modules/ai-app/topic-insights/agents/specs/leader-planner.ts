/**
 * AG-01-LD · Leader spec
 *
 * 目标架构 v2（docs/design/topic-insights-harness-redesign/11-target-architecture.md）：
 * 本 spec 声明式替代 harness/agents/leader-planner.agent.ts（P3 一次性删除）。
 * L2 AgentFactory 读本 spec 产出 IAgent，注册到 L2 AgentRegistry。
 *
 * 输入 TInput = LeaderPlannerInput → 输出 TOutput = LeaderPlan
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { LeaderPlanSchema, type LeaderPlan } from "./schemas";
// ★ 直接复用 Apr 21 baseline 的 SOTA LEADER_PLAN_PROMPT
import { LEADER_PLAN_PROMPT } from "@/modules/ai-app/topic-insights/prompts/research-leader.prompt";
import { getLanguageInstruction } from "@/modules/ai-app/topic-insights/prompts";
import { RECOMMENDED_DEPTH_BY_TOPIC_TYPE } from "@/modules/ai-app/topic-insights/shared/config";

export interface LeaderPlannerInput {
  readonly missionId: string;
  readonly topicId: string;
  readonly topicName: string;
  readonly topicType: "MACRO" | "TECHNOLOGY" | "COMPANY" | "EVENT";
  /** 话题描述（baseline LEADER_PLAN_PROMPT `{description}` 占位符用） */
  readonly topicDescription?: string;
  readonly userPrompt?: string;
  readonly availableModels: ReadonlyArray<string>;
  readonly language: string;
  readonly researchDepth: "quick" | "standard" | "thorough" | "deep";
  readonly maxDimensions: number;
  readonly existingDimensions?: ReadonlyArray<{
    id: string;
    name: string;
    description?: string | null;
    status?: string;
    searchQueries?: ReadonlyArray<string>;
  }>;
  /**
   * EVENT 专属：话题锚文章格式化片段（baseline formatAnchorContentForPrompt 产物）。
   * 非 EVENT 或无 anchor 时为空字符串。
   */
  readonly anchorContent?: string;
  /** v2 目标架构：runWithHarness 注入的能力快照信息 */
  readonly availableAgentIds?: ReadonlyArray<string>;
  readonly availableToolIds?: ReadonlyArray<string>;
  readonly recommendedDepth?: "quick" | "standard" | "thorough" | "deep";
  /**
   * F6.2 · Framework-skill markdown blocks injected from
   * FrameworkSkillPolicyRepository.loadFrameworks(topicType, eventSubtype).
   * Each string is the full body of a `.skill.md` framework (MACRO / EVENT-CRISIS
   * / etc.) and gets appended to the system prompt in order. Optional: empty
   * list = no injection, keeps legacy prompt shape.
   */
  readonly frameworkPrompts?: ReadonlyArray<string>;
}

export const LEADER_PLANNER_SPEC: IAgentSpec<LeaderPlannerInput, LeaderPlan> = {
  identity: {
    role: {
      id: "AG-01-LD",
      name: "Research Leader",
      description:
        "对研究主题做全局规划：识别维度 / 分配 agent 与模型 / 制定执行策略。",
      workStyle: "structured",
    },
    persona: {
      tone: "formal",
      language: "zh-CN",
      style: "资深研究战略顾问",
    },
    goal: {
      summary: "为给定 topic 产出 3-8 维度 + agent 分配 + 执行策略",
      successCriteria: [
        "3-8 个 dimension",
        "每个 dimension 有 searchQueries ≥ 1 / dataSources ≥ 1",
        "agentAssignments 包含 dimension_researcher / quality_reviewer / report_writer",
        "modelId 必须在 availableModels 内",
      ],
    },
    constraints: {
      maxIterations: 4,
      maxTokens: 30_000,
      maxWallTimeMs: 60_000,
      safetyLevel: "standard",
    },
    tools: [
      "short-term-memory",
      "long-term-memory",
      "rag-search",
      "knowledge-graph",
      "TL-07-MODEL",
    ],
    forbiddenTools: ["TL-02-EVSAVE"],
  },

  /**
   * ★ baseline `leader-planning.service.ts:L315-L319` 对齐：
   *   creativity: medium（Leader 规划需要一定创造性决定维度与 agent 组合）
   *   outputLength: extended（16K tokens，支持复杂多维度 plan 全量输出）
   *   reasoningDepth: deep（启用 reasoning_effort=high，利好 o1/Grok reasoning 模型）
   */
  taskProfile: {
    creativity: "medium",
    outputLength: "extended",
    reasoningDepth: "deep",
  },

  outputSchema: LeaderPlanSchema,

  buildSystemPrompt: (ctx) => {
    const { input } = ctx;
    // ★ baseline planResearch L266-L298 占位符替换对齐。
    //   LEADER_PLAN_PROMPT 里带 {topic}/{topicType}/{description}/{userPrompt}/
    //   {availableModels}/{existingDimensions}/{currentDate}/{currentYear}/
    //   {recommendedDepth}/{anchorArticleContent}/{languageInstruction} 占位符；
    //   不替换等于 LLM 收到字面量 "{currentDate}" — 严重 bug。
    const now = new Date();
    const currentYear = now.getFullYear().toString();
    const currentDate = now.toISOString().split("T")[0];

    const recommendedDepth =
      input.recommendedDepth ||
      RECOMMENDED_DEPTH_BY_TOPIC_TYPE[input.topicType] ||
      "standard";

    const existingDimensionsText =
      input.existingDimensions && input.existingDimensions.length > 0
        ? input.existingDimensions
            .map(
              (d, i) =>
                `${i + 1}. **${d.name}**\n   - 描述：${d.description || "无"}\n   - 状态：${d.status || "PENDING"}\n   - 搜索词：${d.searchQueries?.join("、") || "待设定"}`,
            )
            .join("\n")
        : "无已有维度（首次研究）";

    const availableModelsText =
      input.availableModels.length > 0
        ? input.availableModels.map((m) => `- ${m}`).join("\n")
        : "- 使用默认模型";

    const anchorArticleContent = input.anchorContent ?? "";

    const filledPrompt = LEADER_PLAN_PROMPT.replace(
      /\{topic\}/g,
      input.topicName,
    )
      .replace(/\{topicType\}/g, input.topicType)
      .replace(/\{description\}/g, input.topicDescription || "无")
      .replace(/\{userPrompt\}/g, input.userPrompt || "请进行全面研究")
      .replace(/\{availableModels\}/g, availableModelsText)
      .replace(/\{existingDimensions\}/g, existingDimensionsText)
      .replace(/\{currentDate\}/g, currentDate)
      .replace(/\{currentYear\}/g, currentYear)
      .replace(/\{recommendedDepth\}/g, recommendedDepth)
      .replace(/\{anchorArticleContent\}/g, anchorArticleContent)
      .replace(
        /\{languageInstruction\}/g,
        getLanguageInstruction(input.language || "zh"),
      );

    const base = [
      filledPrompt,
      "",
      "## 【关键覆盖】输出格式说明（本次调用覆盖 baseline 默认输出）",
      "本次调用要求输出**纯 JSON 对象**，严格遵循以下 schema：",
      "```json",
      "{",
      '  "missionId": "复制 input.missionId 原值",',
      '  "taskUnderstanding": {',
      '    "topic": "对话题的一句话概括",',
      '    "scope": "本次研究的边界与范围",',
      '    "objectives": ["目标 1", "目标 2"],      // ≥1',
      '    "constraints": ["可选约束"]             // 可省',
      "  },",
      '  "dimensions": [                            // 数组长度 3-8',
      "    {",
      '      "id": "dim-1",                         // 短 id，后续 agentAssignments.assignedDimensions 按此引用',
      '      "name": "维度名 ≤30 字",',
      '      "description": "1-2 句描述",',
      '      "purpose": "为什么研究此维度",',
      '      "searchQueries": ["查询 1"],           // ≥1',
      '      "dataSources": ["web", "academic"],    // ≥1',
      '      "priority": 8                          // integer 1-10',
      "    }",
      "  ],",
      '  "agentAssignments": [                      // ≥3 条',
      "    {",
      '      "agentId": "researcher_1",             // 唯一 id；每 dim 一个研究员时要区分',
      '      "agentName": "领域专家-1",             // 展示名',
      '      "agentType": "dimension_researcher",   // enum: dimension_researcher | quality_reviewer | report_writer',
      '      "assignedDimensions": ["dim-1"],       // 研究员必填：该 agent 负责哪些 dim.id',
      '      "role": "domain_expert",               // 细粒度 role（如 domain_expert/trend_analyst/devil_advocate）',
      '      "modelId": "从 availableModels 选一个；允许空字符串",',
      '      "skills": ["可选 skill 数组，使用 kebab-case"],',
      '      "tools": ["web-search"],',
      '      "assignmentReason": { "agentReason": "选此 agent 的原因", "modelReason": "选此模型的原因" }',
      "    }",
      "  ],",
      '  "executionStrategy": {',
      '    "parallelism": 3,                        // 并行 agent 数，integer ≥1',
      '    "priorityOrder": ["dim-1", "dim-2"],     // dim.id 优先级，可空数组',
      '    "estimatedTime": "15-20 分钟"           // 可省',
      "  },",
      '  "complexityScore": 7.5,                   // number 0-10',
      '  "reasoning": "≥10 字的规划理由"',
      "}",
      "```",
      "",
      "## ★ Per-dimension 研究员分配（关键业务规则）",
      "- 必须为**每个** dimension 分配一个对应的 `dimension_researcher` agent（可以是不同 agentId/agentName/role，以实现多样化视角）；",
      "- 每个 researcher 的 `assignedDimensions` 必须且仅包含其负责的 dim.id；",
      "- 至少一个 `quality_reviewer` 和一个 `report_writer`（它们可以不填 assignedDimensions）。",
      "",
      "⚠️ 严格红线：number 是数字不是字符串；字段名严格；不输出 ```json fence 包裹整个 JSON。",
    ].join("\n");
    // F6.2 · When the caller supplies framework-skill bodies
    // (FrameworkSkillPolicyRepository.loadFrameworks), prepend them as domain
    // analysis framework context so the plan reflects topicType-specific method.
    const fw = ctx.input.frameworkPrompts ?? [];
    if (fw.length === 0) return base;
    return [
      base,
      "",
      "## 领域分析框架（请在规划维度时遵循以下方法论）",
      ...fw.map((body, i) => `### 框架 ${i + 1}\n${body}`),
    ].join("\n");
  },

  buildUserPrompt: (ctx) => {
    const { input } = ctx;
    const existing = input.existingDimensions?.length
      ? `\n已有维度（避免重复）：${input.existingDimensions.map((d) => d.name).join("、")}`
      : "";
    const agentsHint = input.availableAgentIds?.length
      ? `\n可用 agent 白名单: ${input.availableAgentIds.join(", ")}`
      : "";
    const toolsHint = input.availableToolIds?.length
      ? `\n可用 tool 白名单: ${input.availableToolIds.join(", ")}`
      : "";
    const depthNote =
      input.recommendedDepth && input.recommendedDepth !== input.researchDepth
        ? `\n⚠️ 环境能力对齐后建议 depth=${input.recommendedDepth}（用户请求 ${input.researchDepth}）。按 ${input.recommendedDepth} 规划。`
        : "";
    return [
      `missionId: ${input.missionId}`,
      `topicId: ${input.topicId}`,
      `topicName: ${input.topicName}`,
      `topicType: ${input.topicType}`,
      `language: ${input.language}`,
      `researchDepth: ${input.researchDepth}`,
      `maxDimensions: ${input.maxDimensions}`,
      `availableModels: ${input.availableModels.join(", ") || "（未提供）"}`,
      input.userPrompt ? `userPrompt: ${input.userPrompt}` : "",
      existing,
      agentsHint,
      toolsHint,
      depthNote,
      "",
      "请输出符合 LeaderPlan schema 的 JSON。modelId 必须来自 availableModels。",
    ]
      .filter(Boolean)
      .join("\n");
  },

  validateBusinessRules: (plan, ctx) => {
    const available = new Set(ctx.input.availableModels);
    if (available.size === 0) return;
    for (const a of plan.agentAssignments) {
      // modelId 允许空字符串作 fallback（后处理会轮询分配真实模型）
      if (a.modelId && a.modelId !== "" && !available.has(a.modelId)) {
        throw new Error(
          `[AG-01-LD] agentAssignment agentId=${a.agentId} uses model "${a.modelId}" not in availableModels`,
        );
      }
    }
  },

  stubFn: async (ctx) => {
    const { input } = ctx;
    const dimCount = Math.max(3, Math.min(input.maxDimensions, 6));
    const dimensions = Array.from({ length: dimCount }).map((_, idx) => ({
      id: `${input.missionId}-dim-${idx + 1}`,
      name: `stub 维度 ${idx + 1}`,
      description: `针对 ${input.topicName} 的 ${input.topicType} 类型，探索维度 ${idx + 1}`,
      purpose: `分析 ${input.topicName} 在维度 ${idx + 1} 的核心问题`,
      searchQueries: [`${input.topicName} 维度${idx + 1} 趋势`],
      dataSources: ["web-search", "rag-search"],
      priority: idx + 1,
    }));

    // ★ Per-dim researcher (对齐 baseline：每 dim 一个独立 researcher)
    const researcherAssignments = dimensions.map((d, idx) => ({
      agentId: `researcher_${idx + 1}`,
      agentName: `研究员-${idx + 1}`,
      agentType: "dimension_researcher" as const,
      assignedDimensions: [d.id],
      role: "domain_expert",
      modelId:
        input.availableModels[
          idx % Math.max(1, input.availableModels.length)
        ] ?? "",
      skills: ["deep-dive", "synthesis"],
      tools: ["web-search"],
    }));

    return {
      missionId: input.missionId,
      taskUnderstanding: {
        topic: input.topicName,
        scope: `对 ${input.topicName} 做 ${input.researchDepth} 深度的多维度研究`,
        objectives: [`覆盖 ${dimCount} 个关键维度`, "产出带引用的综合报告"],
      },
      dimensions,
      agentAssignments: [
        ...researcherAssignments,
        {
          agentId: "reviewer_1",
          agentName: "质量审核员",
          agentType: "quality_reviewer" as const,
          role: "quality_reviewer",
          modelId: input.availableModels[1] ?? input.availableModels[0] ?? "",
          skills: ["critical-thinking", "synthesis"],
        },
        {
          agentId: "writer_1",
          agentName: "报告撰写员",
          agentType: "report_writer" as const,
          role: "report_writer",
          modelId: input.availableModels[0] ?? "",
          skills: ["synthesis"],
        },
      ],
      executionStrategy: {
        parallelism: Math.min(dimCount, 3),
        priorityOrder: dimensions.map((d) => d.id),
      },
      complexityScore: 6,
      reasoning: `Stub plan for topic ${input.topicName} depth=${input.researchDepth}`,
    };
  },
};
