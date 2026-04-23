/**
 * COMPANY / standard template — ~25 LLM calls / ~350K tokens
 */

import {
  iso,
  mkDbSnapshot,
  mkEvent,
  mkLlmCall,
  mkMetrics,
} from "../template-helpers";
import type { MissionFixture, TemplateInput } from "../types";

export function companyStandardTemplate(input: TemplateInput): MissionFixture {
  const { topicName, seed } = input;

  const dimensions = [
    { id: `d-${seed}-1`, name: "业务结构与商业模式" },
    { id: `d-${seed}-2`, name: "财务与估值" },
    { id: `d-${seed}-3`, name: "竞争格局" },
    { id: `d-${seed}-4`, name: "战略与风险" },
  ];

  const llmCalls = [
    mkLlmCall({
      input,
      offsetMs: 2_000,
      durationMs: 4_000,
      operationName: "leader.planning",
      systemPrompt: "Produce a 4-dimension company analysis plan.",
      userMessage: `为《${topicName}》公司分析产出 4 个维度`,
      response: JSON.stringify({
        dimensions: dimensions.map((d) => ({ name: d.name })),
      }),
      inputTokens: 800,
      outputTokens: 400,
      responseFormat: "json",
      creativity: "low",
      outputLength: "medium",
    }),
    ...dimensions.map((d, idx) =>
      mkLlmCall({
        input,
        offsetMs: 8_000 + idx * 14_000,
        durationMs: 11_000,
        operationName: `dimension.research.${d.name}`,
        systemPrompt: `Analyst on ${d.name}.`,
        userMessage: `分析 ${topicName} 的 ${d.name}`,
        response: `${d.name} 分析...(约 1200 字)`,
        inputTokens: 2800,
        outputTokens: 1600,
        creativity: "medium",
        outputLength: "long",
      }),
    ),
    ...Array.from({ length: 8 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 70_000 + idx * 7_500,
        durationMs: 6_000,
        operationName: `section.write.${idx + 1}`,
        systemPrompt: "Write company report section.",
        userMessage: `撰写章节 ${idx + 1}`,
        response: `### ${topicName} - 章节 ${idx + 1}\n...(约 350 字)`,
        inputTokens: 1700,
        outputTokens: 950,
        creativity: "medium",
        outputLength: "medium",
      }),
    ),
    ...Array.from({ length: 4 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 135_000 + idx * 4_500,
        durationMs: 3_200,
        operationName: `section.review.${idx + 1}`,
        systemPrompt: "Review section quality.",
        userMessage: `审阅章节 ${idx + 1}`,
        response: JSON.stringify({ score: 8, suggestions: ["数据来源补充"] }),
        inputTokens: 1600,
        outputTokens: 400,
        responseFormat: "json",
        creativity: "low",
        outputLength: "short",
      }),
    ),
    ...Array.from({ length: 5 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 160_000 + idx * 5_000,
        durationMs: 7_000,
        operationName: `synthesis.${idx + 1}`,
        systemPrompt: "Integrate into report.",
        userMessage: `整合第 ${idx + 1} 部分`,
        response: `整合：${topicName} 综合分析...(约 500 字)`,
        inputTokens: 2800,
        outputTokens: 1300,
        creativity: "medium",
        outputLength: "long",
      }),
    ),
    mkLlmCall({
      input,
      offsetMs: 195_000,
      durationMs: 4_500,
      operationName: "synthesis.exec-summary",
      systemPrompt: "Executive summary.",
      userMessage: `${topicName} 公司分析摘要 200 字`,
      response: `${topicName} 公司分析执行摘要...`,
      inputTokens: 2000,
      outputTokens: 260,
      creativity: "low",
      outputLength: "short",
    }),
    mkLlmCall({
      input,
      offsetMs: 202_000,
      durationMs: 3_000,
      operationName: "quality.gate",
      systemPrompt: "Quality gate.",
      userMessage: `10 维评分`,
      response: JSON.stringify({
        contentCompleteness: 8,
        analysisDepth: 8,
        evidenceUse: 9,
        logicCoherence: 8,
        wordCount: 8,
        planAlignment: 9,
        writingQuality: 8,
        figuresUse: 6,
        sectionTransitions: 7,
        independentAnalysis: 8,
      }),
      inputTokens: 2200,
      outputTokens: 380,
      responseFormat: "json",
      creativity: "deterministic",
      outputLength: "short",
    }),
  ];

  const events = [
    mkEvent({
      input,
      offsetMs: 0,
      eventType: "mission:started",
      data: { missionId: input.missionId },
    }),
    mkEvent({
      input,
      offsetMs: 5_500,
      eventType: "leader:plan_ready",
      data: { dimensionCount: 4 },
    }),
    ...dimensions.flatMap((d, idx) => [
      mkEvent({
        input,
        offsetMs: 8_000 + idx * 14_000,
        eventType: "dimension:research_started",
        data: { dimensionName: d.name },
      }),
      mkEvent({
        input,
        offsetMs: 19_000 + idx * 14_000,
        eventType: "dimension:research_completed",
        data: { dimensionName: d.name },
      }),
    ]),
    mkEvent({
      input,
      offsetMs: 160_000,
      eventType: "report:synthesis_started",
      data: {},
    }),
    mkEvent({
      input,
      offsetMs: 200_000,
      eventType: "report:synthesis_completed",
      data: { totalSections: 8 },
    }),
    mkEvent({
      input,
      offsetMs: 206_000,
      eventType: "mission:completed",
      data: { missionId: input.missionId, completedTasks: 10, totalTasks: 10 },
    }),
  ];

  const endedAtMs = 206_500;

  const fullReport =
    `# ${topicName} · 公司研究报告\n\n` +
    `> 版本 1 · ${iso(endedAtMs, input.baseTimestampMs)}\n\n` +
    `## 执行摘要\n\n${topicName} 作为行业代表公司，本报告从业务、财务、竞争、战略 4 维度系统分析...（约 250 字）\n\n` +
    dimensions
      .map(
        (d, idx) =>
          `## ${idx + 1}. ${d.name}\n\n` +
          `${topicName} 的 ${d.name} 分析：\n\n` +
          `- 维度核心要素 1...（约 120 字）\n` +
          `- 维度核心要素 2...（约 120 字）\n` +
          `- 维度核心要素 3...（约 120 字）\n\n` +
          `### ${idx + 1}.1 详细分析\n\n（约 300 字，引用 [${idx * 3 + 1}][${idx * 3 + 2}]）\n`,
      )
      .join("\n") +
    `\n## 结论与投资建议\n\n综合分析显示...（约 400 字）\n\n` +
    `## 参考文献\n\n` +
    Array.from({ length: 18 })
      .map(
        (_, i) =>
          `[${i + 1}] ${topicName} source ${i + 1} - https://co.example.com/${seed}-${i}`,
      )
      .join("\n");

  const evidence = Array.from({ length: 18 }).map((_, idx) => ({
    id: `ev-${seed}-${idx}`,
    url: `https://co.example.com/${seed}-${idx}`,
    sourceType: idx % 3 === 0 ? "finance" : idx % 3 === 1 ? "news" : "industry",
    credibility: 75 + ((seed + idx) % 20),
  }));

  const totalTokens = llmCalls.reduce(
    (sum, c) => sum + (c.usage?.totalTokens ?? 0),
    0,
  );

  const dbSnapshot = mkDbSnapshot({
    input,
    topicType: "COMPANY",
    depth: "standard",
    dimensions: dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      summary: `${topicName} 的 ${d.name}：...（约 300 字）`,
    })),
    evidence,
    fullReport,
    executiveSummary: `${topicName} 公司研究执行摘要：业务结构、财务、竞争、战略四维分析。`,
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
    topicType: "COMPANY",
    depth: "standard",
    llmCalls,
    events,
    dbSnapshot,
    metrics,
    finalReportMd: fullReport,
  };
}
