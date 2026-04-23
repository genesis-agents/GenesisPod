/**
 * MACRO / standard template — 3 个 variants
 *
 * 30 LLM calls / ~400K tokens / 1500 字报告
 */

import {
  iso,
  mkDbSnapshot,
  mkEvent,
  mkLlmCall,
  mkMetrics,
} from "../template-helpers";
import type { MissionFixture, TemplateInput } from "../types";

export function macroStandardTemplate(input: TemplateInput): MissionFixture {
  const { topicName, seed } = input;

  const dimensions = [
    { id: `d-${seed}-1`, name: "宏观政策环境" },
    { id: `d-${seed}-2`, name: "产业链动态" },
    { id: `d-${seed}-3`, name: "国际对标" },
    { id: `d-${seed}-4`, name: "风险与展望" },
  ];

  // === LLM calls（模拟典型 research 流程）===
  const llmCalls = [
    // 1. Leader planning
    mkLlmCall({
      input,
      offsetMs: 2000,
      durationMs: 4500,
      operationName: "leader.planning",
      systemPrompt:
        "You are a research leader. Produce a 4-dimension research plan.",
      userMessage: `请为专题《${topicName}》产出 4 个研究维度，并说明每个维度的核心问题。`,
      response: JSON.stringify({
        dimensions: dimensions.map((d) => ({
          name: d.name,
          purpose: `分析 ${topicName} 的 ${d.name}`,
        })),
      }),
      inputTokens: 850,
      outputTokens: 420,
      responseFormat: "json",
      creativity: "low",
      outputLength: "medium",
    }),
    // 2-5. Dimension research × 4
    ...dimensions.map((d, idx) =>
      mkLlmCall({
        input,
        offsetMs: 10_000 + idx * 15_000,
        durationMs: 12_000,
        operationName: `dimension.research.${d.name}`,
        systemPrompt: `You are an expert researcher on ${d.name}.`,
        userMessage: `针对专题《${topicName}》，从"${d.name}"维度展开研究，要求引用至少 5 个来源。`,
        response:
          `## ${d.name} 分析\n\n${topicName} 在本维度的核心特征：...（分析正文约 1200 字）\n\n` +
          `关键发现：\n1. ...\n2. ...\n3. ...`,
        inputTokens: 2800,
        outputTokens: 1600,
        creativity: "medium",
        outputLength: "long",
      }),
    ),
    // 6-13. Section writing × 8
    ...Array.from({ length: 8 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 80_000 + idx * 8_000,
        durationMs: 6_500,
        operationName: `section.write.${idx + 1}`,
        systemPrompt: "You are a report section writer.",
        userMessage: `基于维度分析，撰写章节 ${idx + 1}（${dimensions[idx % 4].name} - 子主题 ${idx % 2 === 0 ? "A" : "B"}）`,
        response: `### 章节 ${idx + 1} 正文\n\n这是章节 ${idx + 1} 的正文...（约 300 字）`,
        inputTokens: 1600,
        outputTokens: 900,
        creativity: "medium",
        outputLength: "medium",
      }),
    ),
    // 14-17. Section review × 4
    ...Array.from({ length: 4 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 150_000 + idx * 5_000,
        durationMs: 3_500,
        operationName: `section.review.${idx + 1}`,
        systemPrompt: "You are a critical reviewer.",
        userMessage: `审阅以下章节，指出不足并给出修订建议:\n[章节正文]`,
        response: JSON.stringify({
          score: 8,
          suggestions: ["补充引用", "数据口径统一"],
        }),
        inputTokens: 1800,
        outputTokens: 420,
        responseFormat: "json",
        creativity: "low",
        outputLength: "short",
      }),
    ),
    // 18-23. Section revision × 6
    ...Array.from({ length: 6 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 180_000 + idx * 4_000,
        durationMs: 5_200,
        operationName: `section.revise.${idx + 1}`,
        systemPrompt: "You are revising a research section based on review.",
        userMessage: `根据审阅意见修订章节 ${idx + 1}`,
        response: `### 章节 ${idx + 1}（修订版）\n\n修订后的正文...（约 320 字）`,
        inputTokens: 2000,
        outputTokens: 1000,
        creativity: "medium",
        outputLength: "medium",
      }),
    ),
    // 24-28. Synthesis 报告合成 × 5
    ...Array.from({ length: 5 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 220_000 + idx * 6_000,
        durationMs: 7_800,
        operationName: `synthesis.${idx + 1}`,
        systemPrompt: "You are integrating section content into final report.",
        userMessage: `整合所有章节生成最终报告的第 ${idx + 1} 部分`,
        response: `整合内容：${topicName} 的综合分析...（约 500 字）`,
        inputTokens: 3200,
        outputTokens: 1400,
        creativity: "medium",
        outputLength: "long",
      }),
    ),
    // 29. Executive summary
    mkLlmCall({
      input,
      offsetMs: 260_000,
      durationMs: 4_800,
      operationName: "synthesis.executive-summary",
      systemPrompt: "Generate an executive summary.",
      userMessage: `为《${topicName}》生成 200 字执行摘要`,
      response: `${topicName} 执行摘要：本报告从 4 个维度系统分析...`,
      inputTokens: 2400,
      outputTokens: 260,
      creativity: "low",
      outputLength: "short",
    }),
    // 30. Final quality gate
    mkLlmCall({
      input,
      offsetMs: 268_000,
      durationMs: 3_200,
      operationName: "quality.gate",
      systemPrompt: "You are a quality gate judge.",
      userMessage: `评估报告质量，给出 10 维评分`,
      response: JSON.stringify({
        contentCompleteness: 8,
        analysisDepth: 7,
        evidenceUse: 9,
        logicCoherence: 8,
        wordCount: 9,
        planAlignment: 8,
        writingQuality: 7,
        figuresUse: 6,
        sectionTransitions: 8,
        independentAnalysis: 7,
      }),
      inputTokens: 2200,
      outputTokens: 380,
      responseFormat: "json",
      creativity: "deterministic",
      outputLength: "short",
    }),
  ];

  // === Research events ===
  const events = [
    mkEvent({
      input,
      offsetMs: 0,
      eventType: "mission:started",
      data: { missionId: input.missionId, message: "任务启动" },
    }),
    mkEvent({
      input,
      offsetMs: 500,
      eventType: "leader:planning",
      data: { message: "Leader 正在规划" },
    }),
    mkEvent({
      input,
      offsetMs: 6500,
      eventType: "leader:plan_ready",
      data: { dimensionCount: 4 },
    }),
    ...dimensions.flatMap((d, idx) => [
      mkEvent({
        input,
        offsetMs: 10_000 + idx * 15_000,
        eventType: "dimension:research_started",
        data: { dimensionName: d.name },
      }),
      mkEvent({
        input,
        offsetMs: 22_000 + idx * 15_000,
        eventType: "dimension:research_completed",
        data: { dimensionName: d.name },
      }),
    ]),
    mkEvent({
      input,
      offsetMs: 220_000,
      eventType: "report:synthesis_started",
      data: { message: "开始合成报告" },
    }),
    mkEvent({
      input,
      offsetMs: 265_000,
      eventType: "report:synthesis_completed",
      data: { totalSections: 8 },
    }),
    mkEvent({
      input,
      offsetMs: 272_000,
      eventType: "mission:completed",
      data: { missionId: input.missionId, completedTasks: 12, totalTasks: 12 },
    }),
  ];

  const endedAtMs = 272_500;

  const fullReport =
    `# ${topicName} · 研究报告\n\n` +
    `> 版本 1 · 生成于 ${iso(endedAtMs, input.baseTimestampMs)}\n\n` +
    `## 执行摘要\n\n${topicName} 作为当前备受关注的宏观议题，本报告从 4 个维度系统分析了其发展现状、` +
    `驱动因素、挑战与展望。研究发现表明，该议题呈现出结构性机会与阶段性风险并存的特征...\n\n` +
    dimensions
      .map(
        (d, idx) =>
          `## ${idx + 1}. ${d.name}\n\n针对 ${topicName} 的 ${d.name}，研究发现：\n\n` +
          `- 核心特征 1：...（约 80 字详细分析）\n` +
          `- 核心特征 2：...（约 80 字详细分析）\n` +
          `- 核心特征 3：...（约 80 字详细分析）\n\n` +
          `### ${idx + 1}.1 深度观察\n\n本维度的深度观察包括...（约 200 字）\n\n` +
          `### ${idx + 1}.2 数据支撑\n\n相关数据显示...（约 150 字，引用 [1][2][3]）\n`,
      )
      .join("\n") +
    `\n## 结论与展望\n\n综合以上 4 个维度分析，${topicName} 的未来演进呈现三大趋势...（约 300 字）\n\n` +
    `## 参考文献\n\n` +
    Array.from({ length: 20 })
      .map(
        (_, i) =>
          `[${i + 1}] 示例来源 ${i + 1} - https://example.com/ref/${seed}-${i}`,
      )
      .join("\n");

  const evidence = Array.from({ length: 20 }).map((_, idx) => ({
    id: `ev-${seed}-${idx}`,
    url: `https://example.com/ref/${seed}-${idx}`,
    sourceType: idx % 3 === 0 ? "academic" : idx % 3 === 1 ? "news" : "gov",
    credibility: 70 + ((seed + idx) % 25),
  }));

  const totalTokens = llmCalls.reduce(
    (sum, c) => sum + (c.usage?.totalTokens ?? 0),
    0,
  );

  const dbSnapshot = mkDbSnapshot({
    input,
    topicType: "MACRO",
    depth: "standard",
    dimensions: dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      summary: `关于 ${topicName} 的 ${d.name}，研究显示...（约 300 字摘要）`,
    })),
    evidence,
    fullReport,
    executiveSummary: `${topicName} 执行摘要：从 4 个维度系统分析，结构性机会与阶段性风险并存。`,
    totalTokens,
    endedAtMs,
  });

  const metrics = mkMetrics({
    input,
    llmCalls,
    eventCount: events.length,
    endedAtMs,
  });

  return {
    baselineTag: input.baselineTag,
    missionId: input.missionId,
    topicId: input.topicId,
    topicName,
    topicType: "MACRO",
    depth: "standard",
    llmCalls,
    events,
    dbSnapshot,
    metrics,
    finalReportMd: fullReport,
  };
}
