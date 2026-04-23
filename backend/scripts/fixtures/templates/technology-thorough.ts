/**
 * TECHNOLOGY / thorough template
 *
 * thorough 模式：更多维度（6）+ 更多 review 轮次 + 更长报告
 * ~80 LLM calls / ~1M tokens / ~3500 字
 */

import {
  iso,
  mkDbSnapshot,
  mkEvent,
  mkLlmCall,
  mkMetrics,
} from "../template-helpers";
import type { MissionFixture, TemplateInput } from "../types";

export function technologyThoroughTemplate(
  input: TemplateInput,
): MissionFixture {
  const { topicName, seed } = input;

  const dimensions = [
    { id: `d-${seed}-1`, name: "技术原理" },
    { id: `d-${seed}-2`, name: "产业生态" },
    { id: `d-${seed}-3`, name: "主要玩家" },
    { id: `d-${seed}-4`, name: "应用场景" },
    { id: `d-${seed}-5`, name: "技术路线对比" },
    { id: `d-${seed}-6`, name: "未来趋势" },
  ];

  const llmCalls = [
    mkLlmCall({
      input,
      offsetMs: 2_000,
      durationMs: 6_000,
      operationName: "leader.planning.thorough",
      systemPrompt: "Produce a 6-dimension thorough research plan.",
      userMessage: `为《${topicName}》产出 6 个研究维度 + 每个维度 3-5 个子问题。`,
      response: JSON.stringify({
        dimensions: dimensions.map((d) => ({
          name: d.name,
          subQuestions: [
            `${d.name}子问题 1`,
            `${d.name}子问题 2`,
            `${d.name}子问题 3`,
          ],
        })),
      }),
      inputTokens: 1200,
      outputTokens: 900,
      responseFormat: "json",
      creativity: "low",
      outputLength: "long",
    }),
    // 文献基线
    mkLlmCall({
      input,
      offsetMs: 10_000,
      durationMs: 8_500,
      operationName: "literature.baseline",
      systemPrompt: "Search academic literature for baseline knowledge.",
      userMessage: `识别 ${topicName} 的关键文献和里程碑技术节点`,
      response: `文献综述：${topicName} 领域关键文献包括...（约 1500 字）`,
      inputTokens: 3500,
      outputTokens: 2000,
      creativity: "low",
      outputLength: "long",
    }),
    // 维度研究 × 6（每维度 2 次调用：研究 + 证据评估）
    ...dimensions.flatMap((d, idx) => [
      mkLlmCall({
        input,
        offsetMs: 25_000 + idx * 25_000,
        durationMs: 18_000,
        operationName: `dimension.research.${d.name}`,
        systemPrompt: `You are an expert on ${d.name}.`,
        userMessage: `针对 ${topicName} 的 ${d.name}，基于文献和最新数据展开深度分析`,
        response: `## ${d.name} 深度分析\n\n... (约 2000 字)`,
        inputTokens: 4200,
        outputTokens: 2400,
        creativity: "medium",
        outputLength: "long",
      }),
      mkLlmCall({
        input,
        offsetMs: 40_000 + idx * 25_000,
        durationMs: 5_500,
        operationName: `evidence.assess.${d.name}`,
        systemPrompt: "Assess source credibility.",
        userMessage: `评估以下来源的可信度`,
        response: JSON.stringify({ credibility: 78, reasoning: "..." }),
        inputTokens: 1800,
        outputTokens: 400,
        responseFormat: "json",
        creativity: "deterministic",
        outputLength: "short",
      }),
    ]),
    // Section 写作 × 18（每 dim × 3 sections）
    ...Array.from({ length: 18 }).map((_, idx) => {
      const dim = dimensions[idx % 6];
      return mkLlmCall({
        input,
        offsetMs: 180_000 + idx * 6_000,
        durationMs: 7_500,
        operationName: `section.write.${idx + 1}`,
        systemPrompt: "Write a detailed report section.",
        userMessage: `撰写 ${dim.name} - 子章节 ${Math.floor(idx / 6) + 1}`,
        response: `### ${dim.name} - 子章节 ${Math.floor(idx / 6) + 1}\n\n... (约 400 字)`,
        inputTokens: 2200,
        outputTokens: 1200,
        creativity: "medium",
        outputLength: "medium",
      });
    }),
    // Section 自评 × 18
    ...Array.from({ length: 18 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 300_000 + idx * 2_500,
        durationMs: 3_200,
        operationName: `section.selfeval.${idx + 1}`,
        systemPrompt: "Self-evaluate the section.",
        userMessage: `对章节 ${idx + 1} 打分并指出改进点`,
        response: JSON.stringify({
          score: 7 + (idx % 3),
          needsRevise: idx % 4 === 0,
        }),
        inputTokens: 1500,
        outputTokens: 200,
        responseFormat: "json",
        creativity: "deterministic",
        outputLength: "minimal",
      }),
    ),
    // Section 修订 × 12（thorough 多轮）
    ...Array.from({ length: 12 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 360_000 + idx * 4_000,
        durationMs: 5_500,
        operationName: `section.revise.${idx + 1}`,
        systemPrompt: "Revise based on review feedback.",
        userMessage: `修订章节 ${idx + 1}`,
        response: `### 章节 ${idx + 1}（修订版）... (约 420 字)`,
        inputTokens: 2500,
        outputTokens: 1300,
        creativity: "medium",
        outputLength: "medium",
      }),
    ),
    // Critique refine × 4
    ...Array.from({ length: 4 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 420_000 + idx * 8_000,
        durationMs: 9_000,
        operationName: `critique.refine.${idx + 1}`,
        systemPrompt: "Critically refine the report.",
        userMessage: `从批判视角改进报告第 ${idx + 1} 部分`,
        response: `改进后内容... (约 600 字)`,
        inputTokens: 3000,
        outputTokens: 1500,
        creativity: "high",
        outputLength: "long",
      }),
    ),
    // Final synthesis × 5
    ...Array.from({ length: 5 }).map((_, idx) =>
      mkLlmCall({
        input,
        offsetMs: 460_000 + idx * 7_000,
        durationMs: 8_200,
        operationName: `synthesis.final.${idx + 1}`,
        systemPrompt: "Final integration.",
        userMessage: `最终整合第 ${idx + 1} 部分`,
        response: `最终报告 ${idx + 1} 部分整合内容... (约 700 字)`,
        inputTokens: 4000,
        outputTokens: 1800,
        creativity: "medium",
        outputLength: "long",
      }),
    ),
    // Quality gate
    mkLlmCall({
      input,
      offsetMs: 500_000,
      durationMs: 4_500,
      operationName: "quality.gate.final",
      systemPrompt: "Final quality gate.",
      userMessage: `给出 10 维评分`,
      response: JSON.stringify({
        contentCompleteness: 9,
        analysisDepth: 9,
        evidenceUse: 8,
        logicCoherence: 9,
        wordCount: 10,
        planAlignment: 9,
        writingQuality: 8,
        figuresUse: 7,
        sectionTransitions: 9,
        independentAnalysis: 9,
      }),
      inputTokens: 2500,
      outputTokens: 400,
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
      data: { missionId: input.missionId, mode: "thorough" },
    }),
    mkEvent({
      input,
      offsetMs: 8_500,
      eventType: "leader:plan_ready",
      data: { dimensionCount: 6 },
    }),
    mkEvent({
      input,
      offsetMs: 20_000,
      eventType: "literature:baseline_ready",
      data: { docsFound: 35 },
    }),
    ...dimensions.flatMap((d, idx) => [
      mkEvent({
        input,
        offsetMs: 25_000 + idx * 25_000,
        eventType: "dimension:research_started",
        data: { dimensionName: d.name },
      }),
      mkEvent({
        input,
        offsetMs: 45_000 + idx * 25_000,
        eventType: "dimension:research_completed",
        data: { dimensionName: d.name },
      }),
    ]),
    mkEvent({
      input,
      offsetMs: 180_000,
      eventType: "report:synthesis_started",
      data: { mode: "thorough" },
    }),
    mkEvent({
      input,
      offsetMs: 495_000,
      eventType: "report:synthesis_completed",
      data: { totalSections: 18, totalWords: 3500 },
    }),
    mkEvent({
      input,
      offsetMs: 505_000,
      eventType: "mission:completed",
      data: { missionId: input.missionId, completedTasks: 28, totalTasks: 28 },
    }),
  ];

  const endedAtMs = 505_500;

  const fullReport =
    `# ${topicName} · 深度技术研究报告（thorough）\n\n` +
    `> 版本 1 · ${iso(endedAtMs, input.baseTimestampMs)} · 6 维度 × 3 子章节\n\n` +
    `## 执行摘要\n\n${topicName} 作为技术赛道的热点，本报告通过 6 个维度、18 个子章节的系统分析...（约 400 字）\n\n` +
    dimensions
      .map(
        (d, dIdx) =>
          `## ${dIdx + 1}. ${d.name}\n\n` +
          Array.from({ length: 3 })
            .map(
              (_, sIdx) =>
                `### ${dIdx + 1}.${sIdx + 1} ${d.name} · 子章节 ${sIdx + 1}\n\n` +
                `本章节就 ${topicName} 的 ${d.name} 展开子章节 ${sIdx + 1} 的分析...（约 500 字，引用 [${dIdx * 3 + sIdx + 1}][${dIdx * 3 + sIdx + 2}]）\n\n`,
            )
            .join(""),
      )
      .join("") +
    `\n## 结论与未来展望\n\n综合 6 维度深度分析，${topicName} 的演进呈现以下特征...（约 600 字）\n\n` +
    `## 参考文献\n\n` +
    Array.from({ length: 40 })
      .map(
        (_, i) =>
          `[${i + 1}] Tech source ${i + 1} - https://tech.example.com/ref/${seed}-${i}`,
      )
      .join("\n");

  const evidence = Array.from({ length: 40 }).map((_, idx) => ({
    id: `ev-${seed}-${idx}`,
    url: `https://tech.example.com/ref/${seed}-${idx}`,
    sourceType:
      idx % 4 === 0
        ? "academic"
        : idx % 4 === 1
          ? "industry"
          : idx % 4 === 2
            ? "github"
            : "news",
    credibility: 72 + ((seed + idx) % 25),
  }));

  const totalTokens = llmCalls.reduce(
    (sum, c) => sum + (c.usage?.totalTokens ?? 0),
    0,
  );

  const dbSnapshot = mkDbSnapshot({
    input,
    topicType: "TECHNOLOGY",
    depth: "thorough",
    dimensions: dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      summary: `${topicName} 的 ${d.name} 深度摘要...（约 400 字）`,
    })),
    evidence,
    fullReport,
    executiveSummary: `${topicName} thorough 研究执行摘要：6 维度 × 3 子章节系统分析技术路线与产业趋势。`,
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
    topicType: "TECHNOLOGY",
    depth: "thorough",
    llmCalls,
    events,
    dbSnapshot,
    metrics,
    finalReportMd: fullReport,
  };
}
