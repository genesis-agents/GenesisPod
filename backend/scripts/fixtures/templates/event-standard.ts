/**
 * EVENT / standard template — ~22 LLM calls / ~300K tokens
 */

import {
  iso,
  mkDbSnapshot,
  mkEvent,
  mkLlmCall,
  mkMetrics,
} from "../template-helpers";
import type { MissionFixture, TemplateInput } from "../types";

export function eventStandardTemplate(input: TemplateInput): MissionFixture {
  const { topicName, seed } = input;

  const dimensions = [
    { id: `d-${seed}-1`, name: "事件经过与事实核查" },
    { id: `d-${seed}-2`, name: "影响分析" },
    { id: `d-${seed}-3`, name: "各方反应" },
    { id: `d-${seed}-4`, name: "后续趋势" },
  ];

  const llmCalls = [
    mkLlmCall({
      input,
      offsetMs: 2_000,
      durationMs: 3_500,
      operationName: "leader.planning",
      systemPrompt: "Event research planning.",
      userMessage: `为事件《${topicName}》产出 3 个维度`,
      response: JSON.stringify({
        dimensions: dimensions.map((d) => ({ name: d.name })),
      }),
      inputTokens: 700,
      outputTokens: 300,
      responseFormat: "json",
      creativity: "low",
      outputLength: "medium",
    }),
    ...dimensions.map((d, idx) =>
      mkLlmCall({
        input,
        offsetMs: 7_000 + idx * 12_000,
        durationMs: 10_500,
        operationName: `dimension.research.${d.name}`,
        systemPrompt: `Analyst on ${d.name}.`,
        userMessage: `针对事件 ${topicName} 的 ${d.name}`,
        response: `${d.name}...(约 1000 字)`,
        inputTokens: 2600,
        outputTokens: 1400,
        creativity: "medium",
        outputLength: "long",
      }),
    ),
    ...Array.from({ length: 6 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 55_000 + idx * 7_000,
        durationMs: 5_800,
        operationName: `section.write.${idx + 1}`,
        systemPrompt: "Write event report section.",
        userMessage: `撰写章节 ${idx + 1}`,
        response: `### 章节 ${idx + 1}\n...(约 300 字)`,
        inputTokens: 1600,
        outputTokens: 900,
        creativity: "medium",
        outputLength: "medium",
      }),
    ),
    ...Array.from({ length: 3 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 100_000 + idx * 4_000,
        durationMs: 3_000,
        operationName: `section.review.${idx + 1}`,
        systemPrompt: "Review event section.",
        userMessage: `审阅章节 ${idx + 1}`,
        response: JSON.stringify({ score: 8, suggestions: ["核实时间线"] }),
        inputTokens: 1400,
        outputTokens: 350,
        responseFormat: "json",
        creativity: "low",
        outputLength: "short",
      }),
    ),
    ...Array.from({ length: 4 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 115_000 + idx * 5_000,
        durationMs: 6_800,
        operationName: `synthesis.${idx + 1}`,
        systemPrompt: "Synthesize event report.",
        userMessage: `整合第 ${idx + 1} 部分`,
        response: `事件综合整合 ${idx + 1}...(约 500 字)`,
        inputTokens: 2600,
        outputTokens: 1300,
        creativity: "medium",
        outputLength: "long",
      }),
    ),
    mkLlmCall({
      input,
      offsetMs: 145_000,
      durationMs: 4_000,
      operationName: "synthesis.exec-summary",
      systemPrompt: "Event executive summary.",
      userMessage: `${topicName} 摘要`,
      response: `${topicName} 事件执行摘要...`,
      inputTokens: 1900,
      outputTokens: 240,
      creativity: "low",
      outputLength: "short",
    }),
    mkLlmCall({
      input,
      offsetMs: 151_000,
      durationMs: 3_000,
      operationName: "quality.gate",
      systemPrompt: "Quality gate.",
      userMessage: `10 维评分`,
      response: JSON.stringify({
        contentCompleteness: 7,
        analysisDepth: 7,
        evidenceUse: 8,
        logicCoherence: 8,
        wordCount: 7,
        planAlignment: 8,
        writingQuality: 8,
        figuresUse: 5,
        sectionTransitions: 7,
        independentAnalysis: 7,
      }),
      inputTokens: 2100,
      outputTokens: 360,
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
      offsetMs: 5_000,
      eventType: "leader:plan_ready",
      data: { dimensionCount: 3 },
    }),
    ...dimensions.flatMap((d, idx) => [
      mkEvent({
        input,
        offsetMs: 7_000 + idx * 12_000,
        eventType: "dimension:research_started",
        data: { dimensionName: d.name },
      }),
      mkEvent({
        input,
        offsetMs: 17_000 + idx * 12_000,
        eventType: "dimension:research_completed",
        data: { dimensionName: d.name },
      }),
    ]),
    mkEvent({
      input,
      offsetMs: 115_000,
      eventType: "report:synthesis_started",
      data: {},
    }),
    mkEvent({
      input,
      offsetMs: 150_000,
      eventType: "report:synthesis_completed",
      data: { totalSections: 6 },
    }),
    mkEvent({
      input,
      offsetMs: 155_000,
      eventType: "mission:completed",
      data: { missionId: input.missionId, completedTasks: 8, totalTasks: 8 },
    }),
  ];

  const endedAtMs = 155_500;

  const fullReport =
    `# ${topicName} · 事件研究报告\n\n` +
    `> 版本 1 · ${iso(endedAtMs, input.baseTimestampMs)}\n\n` +
    `## 执行摘要\n\n${topicName} 事件从经过、影响、各方反应三个维度系统梳理...（约 200 字）\n\n` +
    dimensions
      .map(
        (d, idx) =>
          `## ${idx + 1}. ${d.name}\n\n` +
          `${topicName} 的 ${d.name} 分析：\n\n` +
          `- 核心要点 1...（约 150 字）\n` +
          `- 核心要点 2...（约 150 字）\n\n` +
          `### ${idx + 1}.1 详细分析\n\n（约 250 字，引用 [${idx * 2 + 1}][${idx * 2 + 2}]）\n`,
      )
      .join("\n") +
    `\n## 结论\n\n综合分析...（约 300 字）\n\n` +
    `## 参考文献\n\n` +
    Array.from({ length: 15 })
      .map(
        (_, i) =>
          `[${i + 1}] ${topicName} news ${i + 1} - https://event.example.com/${seed}-${i}`,
      )
      .join("\n");

  const evidence = Array.from({ length: 15 }).map((_, idx) => ({
    id: `ev-${seed}-${idx}`,
    url: `https://event.example.com/${seed}-${idx}`,
    sourceType: idx % 2 === 0 ? "news" : "official",
    credibility: 70 + ((seed + idx) % 25),
  }));

  const totalTokens = llmCalls.reduce(
    (sum, c) => sum + (c.usage?.totalTokens ?? 0),
    0,
  );

  const dbSnapshot = mkDbSnapshot({
    input,
    topicType: "EVENT",
    depth: "standard",
    dimensions: dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      summary: `${topicName} 的 ${d.name}：...（约 300 字）`,
    })),
    evidence,
    fullReport,
    executiveSummary: `${topicName} 事件研究摘要：事实核查、影响、反应三维度。`,
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
    topicType: "EVENT",
    depth: "standard",
    llmCalls,
    events,
    dbSnapshot,
    metrics,
    finalReportMd: fullReport,
  };
}
