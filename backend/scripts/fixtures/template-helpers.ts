/**
 * 模板共用辅助：生成 LLM call / event / db snapshot 的工厂，
 * 保证 fixture 结构一致且字段齐全。
 */

import type {
  DbSnapshotFixture,
  LlmCallFixture,
  MetricsFixture,
  ResearchEventFixture,
  TemplateInput,
} from "./types";

const BASE_MODEL = "claude-3.5-sonnet";
const BASE_MODEL_COST: Record<string, { input: number; output: number }> = {
  "claude-3.5-sonnet": { input: 0.003, output: 0.015 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
};

export function iso(offsetMs: number, base: number): string {
  return new Date(base + offsetMs).toISOString();
}

export function mkLlmCall(params: {
  input: TemplateInput;
  offsetMs: number;
  durationMs: number;
  operationName: string;
  systemPrompt: string;
  userMessage: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  creativity?: "deterministic" | "low" | "medium" | "high";
  outputLength?: "minimal" | "short" | "medium" | "long" | "extended";
  model?: string;
  responseFormat?: string;
}): LlmCallFixture {
  const model = params.model ?? BASE_MODEL;
  const totalTokens = params.inputTokens + params.outputTokens;
  return {
    timestamp: iso(params.offsetMs, params.input.baseTimestampMs),
    missionId: params.input.missionId,
    baselineTag: params.input.baselineTag,
    durationMs: params.durationMs,
    operationName: params.operationName,
    model,
    modelType: "CHAT",
    systemPrompt: params.systemPrompt,
    messages: [{ role: "user", content: params.userMessage }],
    taskProfile: {
      creativity: params.creativity ?? "medium",
      outputLength: params.outputLength ?? "medium",
    },
    maxTokens: null,
    temperature: null,
    responseFormat: params.responseFormat ?? null,
    outputSchema: null,
    content: params.response,
    usage: {
      totalTokens,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
    },
    finishReason: "stop",
    isError: false,
    apiKeySource: null,
    error: null,
  };
}

export function mkEvent(params: {
  input: TemplateInput;
  offsetMs: number;
  eventType: string;
  data: Record<string, unknown>;
}): ResearchEventFixture {
  return {
    timestamp: iso(params.offsetMs, params.input.baseTimestampMs),
    missionId: params.input.missionId,
    topicId: params.input.topicId,
    event: params.eventType,
    data: {
      timestamp: iso(params.offsetMs, params.input.baseTimestampMs),
      ...params.data,
    },
  };
}

export function mkDbSnapshot(params: {
  input: TemplateInput;
  topicType: string;
  depth: string;
  dimensions: Array<{ id: string; name: string; summary: string }>;
  evidence: Array<{
    id: string;
    url: string;
    sourceType: string;
    credibility: number;
  }>;
  fullReport: string;
  executiveSummary: string;
  totalTokens: number;
  endedAtMs: number;
}): DbSnapshotFixture {
  const { input } = params;
  const reportId = `mock-report-${input.seed}`;
  return {
    capturedAt: iso(params.endedAtMs + 100, input.baseTimestampMs),
    missionId: input.missionId,
    topicId: input.topicId,
    status: "completed",
    mission: {
      id: input.missionId,
      topicId: input.topicId,
      status: "COMPLETED",
      researchDepth: params.depth,
      startedAt: iso(0, input.baseTimestampMs),
      completedAt: iso(params.endedAtMs, input.baseTimestampMs),
    },
    report: {
      id: reportId,
      topicId: input.topicId,
      version: 1,
      versionLabel: "2026-04-22 mock",
      executiveSummary: params.executiveSummary,
      fullReport: params.fullReport,
      fullReportUri: null,
      fullReportSize: Buffer.byteLength(params.fullReport, "utf8"),
      highlights: [
        { type: "KEY_FINDING", text: "关键发现示例 1" },
        { type: "KEY_FINDING", text: "关键发现示例 2" },
        { type: "KEY_FINDING", text: "关键发现示例 3" },
      ],
      charts: [],
      totalDimensions: params.dimensions.length,
      totalSources: params.evidence.length,
      totalTokens: params.totalTokens,
      generatedAt: iso(params.endedAtMs, input.baseTimestampMs),
      generationTimeMs: params.endedAtMs,
      isIncremental: false,
      changesFromPrev: null,
      qualityTrace: null,
    },
    dimensions: params.dimensions.map((d, idx) => ({
      id: d.id,
      dimensionId: `dim-${input.seed}-${idx}`,
      reportId,
      summary: d.summary,
      summaryUri: null,
      summarySize: Buffer.byteLength(d.summary, "utf8"),
      keyFindings: [`${d.name} 发现 1`, `${d.name} 发现 2`, `${d.name} 发现 3`],
      dataPoints: null,
      dataPointsUri: null,
      dataPointsSize: null,
      sourcesUsed: 5,
      modelUsed: BASE_MODEL,
      tokensUsed: 2000,
      createdAt: iso(params.endedAtMs - 10000, input.baseTimestampMs),
    })),
    evidenceCount: params.evidence.length,
    evidenceSummary: params.evidence.map((e) => ({
      id: e.id,
      sourceType: e.sourceType,
      url: e.url,
      credibilityScore: e.credibility,
    })),
  };
}

export function mkMetrics(params: {
  input: TemplateInput;
  llmCalls: LlmCallFixture[];
  eventCount: number;
  endedAtMs: number;
}): MetricsFixture {
  let totalInput = 0;
  let totalOutput = 0;
  let totalDuration = 0;
  let cost = 0;
  for (const c of params.llmCalls) {
    const inp = c.usage?.inputTokens ?? 0;
    const out = c.usage?.outputTokens ?? 0;
    totalInput += inp;
    totalOutput += out;
    totalDuration += c.durationMs;
    const rate =
      (c.model && BASE_MODEL_COST[c.model]) ?? BASE_MODEL_COST[BASE_MODEL];
    cost += (inp / 1000) * rate.input + (out / 1000) * rate.output;
  }
  return {
    missionId: params.input.missionId,
    baselineTag: params.input.baselineTag,
    startedAt: iso(0, params.input.baseTimestampMs),
    endedAt: iso(params.endedAtMs, params.input.baseTimestampMs),
    llmCallCount: params.llmCalls.length,
    llmErrorCount: 0,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    estimatedCostUsd: Math.round(cost * 10000) / 10000,
    totalChatLatencyMs: totalDuration,
    eventCount: params.eventCount,
  };
}
