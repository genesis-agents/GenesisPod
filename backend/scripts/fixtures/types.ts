/**
 * Mock fixture 生成器 · 共享类型
 *
 * 与 `backend/src/modules/ai-app/topic-insights/services/baseline/baseline-recorder.service.ts`
 * 实际写出的 fixture schema 保持一致。
 */

export interface LlmCallFixture {
  timestamp: string;
  missionId: string;
  baselineTag: string;
  durationMs: number;
  operationName?: string;
  model: string | null;
  modelType: string | null;
  systemPrompt: string | null;
  messages: Array<{ role: string; content: string }>;
  taskProfile: {
    creativity?: "deterministic" | "low" | "medium" | "high";
    outputLength?: "minimal" | "short" | "medium" | "long" | "extended";
  } | null;
  maxTokens: number | null;
  temperature: number | null;
  responseFormat: string | null;
  outputSchema: unknown | null;
  content: string;
  usage: {
    totalTokens: number;
    inputTokens?: number;
    outputTokens?: number;
  } | null;
  finishReason: string | null;
  isError: boolean;
  apiKeySource: null;
  error: null;
}

export interface ResearchEventFixture {
  timestamp: string;
  missionId: string;
  topicId: string;
  event: string;
  data: Record<string, unknown>;
}

export interface DbSnapshotFixture {
  capturedAt: string;
  missionId: string;
  topicId: string;
  status: "completed" | "failed";
  mission: Record<string, unknown>;
  report: Record<string, unknown>;
  dimensions: Array<Record<string, unknown>>;
  evidenceCount: number;
  evidenceSummary: Array<{
    id: string;
    sourceType: string | null;
    url: string;
    credibilityScore: number | null;
  }>;
}

export interface MetricsFixture {
  missionId: string;
  baselineTag: string;
  startedAt: string;
  endedAt: string;
  llmCallCount: number;
  llmErrorCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  totalChatLatencyMs: number;
  eventCount: number;
}

/** 生成器总出口：一次写出一个 mission 的五个文件 */
export interface MissionFixture {
  baselineTag: string;
  missionId: string;
  topicId: string;
  topicName: string;
  topicType: "MACRO" | "TECHNOLOGY" | "COMPANY" | "EVENT";
  depth: "standard" | "thorough";
  llmCalls: LlmCallFixture[];
  events: ResearchEventFixture[];
  dbSnapshot: DbSnapshotFixture;
  metrics: MetricsFixture;
  finalReportMd: string;
}

export interface TemplateInput {
  baselineTag: string;
  missionId: string;
  topicId: string;
  topicName: string;
  baseTimestampMs: number;
  /** 生成 deterministic ID 用 */
  seed: number;
}

export type TemplateFn = (input: TemplateInput) => MissionFixture;
