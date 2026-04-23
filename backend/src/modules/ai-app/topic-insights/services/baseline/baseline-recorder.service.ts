/**
 * BaselineRecorderService
 *
 * Topic Insights Harness 重新设计 · Phase 0 · PR-0.1
 *
 * 职责：当环境变量 `TOPIC_INSIGHTS_RECORD_BASELINE=1` 时，
 * 完整录制 baseline commit 下每个 mission 的行为到磁盘 fixture，
 * 用于后续 harness 迁移后的 golden sample 对比。
 *
 * 录制内容（每个 mission 一个目录）：
 * - `llm-calls.ndjson`   所有 AiChatService.chat 调用 input/output pair
 * - `events.ndjson`       所有 ResearchEventEmitterService.emitToTopic payload
 * - `db-snapshot.json`    Mission 结束时的 DB 快照（TopicReport + DimensionAnalysis + TopicEvidence）
 * - `metrics.json`        LLM 总 tokens / cost / 总耗时 / event count
 * - `final-report.md`     TopicReport.content（如有）
 *
 * 过滤机制：通过 KernelContext.missionId 判断当前 chat 调用是否属于 topic-insights mission；
 * 其他模块的 LLM 调用直接 skip。
 *
 * 关闭 flag 时本 Service 完全旁路：不注册 observer、不开文件句柄、开销为零。
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  AiChatService,
  type ChatObserver,
  KernelContext,
} from "@/modules/ai-engine/facade";
import {
  ResearchEventEmitterService,
  ResearchEventType,
  type ResearchEmitObserver,
} from "../core/research/research-event-emitter.service";

interface MissionMetrics {
  missionId: string;
  baselineTag: string;
  startedAt: string;
  endedAt?: string;
  llmCallCount: number;
  llmErrorCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  totalChatLatencyMs: number;
  eventCount: number;
}

@Injectable()
export class BaselineRecorderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaselineRecorderService.name);

  private enabled = false;
  private fixturesDir = "";

  private disposeChatObserver?: () => void;
  private disposeEmitObserver?: () => void;

  /** 每个 mission 的内存聚合 metrics，mission 结束时 flush */
  private readonly metricsByMission = new Map<string, MissionMetrics>();

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly researchEventEmitter: ResearchEventEmitterService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.enabled = process.env.TOPIC_INSIGHTS_RECORD_BASELINE === "1";
    if (!this.enabled) {
      this.logger.debug(
        "TOPIC_INSIGHTS_RECORD_BASELINE disabled — recorder bypassed",
      );
      return;
    }

    this.fixturesDir = path.resolve(process.cwd(), "backend/fixtures/golden");
    try {
      fs.mkdirSync(this.fixturesDir, { recursive: true });
    } catch (err) {
      this.logger.error(
        `Failed to create fixtures dir ${this.fixturesDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.enabled = false;
      return;
    }

    this.disposeChatObserver = this.aiChatService.addChatObserver(
      this.onChatCall,
    );
    this.disposeEmitObserver = this.researchEventEmitter.addEmitObserver(
      this.onResearchEvent,
    );

    this.logger.log(
      `BaselineRecorder ENABLED — fixturesDir=${this.fixturesDir}`,
    );
  }

  onModuleDestroy(): void {
    this.disposeChatObserver?.();
    this.disposeEmitObserver?.();
    this.disposeChatObserver = undefined;
    this.disposeEmitObserver = undefined;
  }

  // ==================== Observer: LLM chat ====================

  private readonly onChatCall: ChatObserver = (event) => {
    const ctx = event.kernelContext;
    const missionId = ctx?.missionId;
    if (!missionId) return; // 非 mission 上下文 skip

    const baselineTag = ctx.baselineTag ?? missionId;
    const metrics = this.getOrInitMetrics(missionId, baselineTag);

    const usage = event.result?.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;
    const resolvedModel = event.result?.model ?? event.options.model;

    metrics.llmCallCount += 1;
    metrics.totalInputTokens += inputTokens;
    metrics.totalOutputTokens += outputTokens;
    metrics.totalTokens += totalTokens;
    metrics.totalChatLatencyMs += event.durationMs;
    metrics.estimatedCostUsd += this.estimateCost(
      resolvedModel,
      inputTokens,
      outputTokens,
    );
    const failed = event.error !== undefined || event.result?.isError === true;
    if (failed) {
      metrics.llmErrorCount += 1;
    }

    const record = {
      timestamp: new Date().toISOString(),
      missionId,
      baselineTag,
      durationMs: event.durationMs,
      // input
      operationName: event.options.operationName,
      model: event.result?.model ?? event.options.model ?? null,
      modelType: event.options.modelType ?? null,
      systemPrompt: event.options.systemPrompt ?? null,
      messages: event.options.messages,
      taskProfile: event.options.taskProfile ?? null,
      maxTokens: event.options.maxTokens ?? null,
      temperature: event.options.temperature ?? null,
      responseFormat: event.options.responseFormat ?? null,
      outputSchema: event.options.outputSchema ?? null,
      // output
      content: event.result?.content ?? null,
      usage: usage ?? null,
      finishReason: event.result?.finishReason ?? null,
      isError: event.result?.isError ?? false,
      apiKeySource: event.result?.apiKeySource ?? null,
      error: event.error ? event.error.message : null,
    };

    this.appendNdjson(this.pathFor(baselineTag, "llm-calls.ndjson"), record);
  };

  // ==================== Observer: research events ====================

  private readonly onResearchEvent: ResearchEmitObserver = (emitEvt) => {
    const ctx = KernelContext.get();
    const missionId = ctx?.missionId;
    if (!missionId) return;

    const baselineTag = ctx.baselineTag ?? missionId;
    const metrics = this.getOrInitMetrics(missionId, baselineTag);
    metrics.eventCount += 1;

    this.appendNdjson(this.pathFor(baselineTag, "events.ndjson"), {
      timestamp: emitEvt.timestamp,
      missionId,
      topicId: emitEvt.topicId,
      event: emitEvt.event,
      data: emitEvt.data,
    });

    // Mission 终态：触发 DB snapshot + metrics flush
    const completedEvt = ResearchEventType.MISSION_COMPLETED as string;
    const failedEvt = ResearchEventType.MISSION_FAILED as string;
    if (emitEvt.event === completedEvt || emitEvt.event === failedEvt) {
      void this.onMissionTerminal({
        missionId,
        topicId: emitEvt.topicId,
        baselineTag,
        status: emitEvt.event === completedEvt ? "completed" : "failed",
      });
    }
  };

  // ==================== Mission 终态处理 ====================

  private async onMissionTerminal(params: {
    missionId: string;
    topicId: string;
    baselineTag: string;
    status: "completed" | "failed";
  }): Promise<void> {
    const { missionId, topicId, baselineTag, status } = params;
    const metrics = this.metricsByMission.get(missionId);

    try {
      // DB snapshot
      const mission = await this.prisma.researchMission
        .findUnique({ where: { id: missionId } })
        .catch(() => null);
      const report = await this.prisma.topicReport
        .findFirst({
          where: { topicId },
          orderBy: { generatedAt: "desc" },
        })
        .catch(() => null);

      const [dimensions, evidences] = report
        ? await Promise.all([
            this.prisma.dimensionAnalysis
              .findMany({ where: { reportId: report.id } })
              .catch(() => []),
            this.prisma.topicEvidence
              .findMany({ where: { reportId: report.id } })
              .catch(() => []),
          ])
        : [[], []];

      const snapshot = {
        capturedAt: new Date().toISOString(),
        missionId,
        topicId,
        status,
        mission,
        report,
        dimensions,
        evidenceCount: evidences.length,
        // 证据量可能很大；仅保留 id/source/url 摘要
        evidenceSummary: evidences.map((e) => ({
          id: e.id,
          sourceType: e.sourceType,
          url: e.url,
          credibilityScore: e.credibilityScore,
        })),
      };

      this.writeJson(this.pathFor(baselineTag, "db-snapshot.json"), snapshot);

      if (report?.fullReport) {
        this.writeText(
          this.pathFor(baselineTag, "final-report.md"),
          report.fullReport,
        );
      }

      if (metrics) {
        metrics.endedAt = new Date().toISOString();
        this.writeJson(this.pathFor(baselineTag, "metrics.json"), metrics);
        this.metricsByMission.delete(missionId);
      }

      this.logger.log(
        `Baseline fixture written: ${baselineTag} status=${status}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to finalize baseline fixture for ${missionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ==================== Helpers ====================

  private getOrInitMetrics(
    missionId: string,
    baselineTag: string,
  ): MissionMetrics {
    let m = this.metricsByMission.get(missionId);
    if (!m) {
      m = {
        missionId,
        baselineTag,
        startedAt: new Date().toISOString(),
        llmCallCount: 0,
        llmErrorCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        totalChatLatencyMs: 0,
        eventCount: 0,
      };
      this.metricsByMission.set(missionId, m);
    }
    return m;
  }

  private pathFor(baselineTag: string, file: string): string {
    const safe = baselineTag.replace(/[^\w.-]/g, "_");
    const dir = path.join(this.fixturesDir, safe);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, file);
  }

  private appendNdjson(file: string, record: unknown): void {
    try {
      fs.appendFileSync(file, JSON.stringify(record) + "\n", "utf-8");
    } catch (err) {
      this.logger.warn(
        `appendNdjson failed for ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private writeJson(file: string, data: unknown): void {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      this.logger.warn(
        `writeJson failed for ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private writeText(file: string, content: string): void {
    try {
      fs.writeFileSync(file, content, "utf-8");
    } catch (err) {
      this.logger.warn(
        `writeText failed for ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 简单成本估算（与 AiObservabilityService.estimateCost 同口径，避免跨模块依赖）
   */
  private estimateCost(
    model: string | undefined,
    inputTokens: number,
    outputTokens: number,
  ): number {
    const pricing: Record<string, { input: number; output: number }> = {
      "gpt-4o": { input: 0.0025, output: 0.01 },
      "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
      "claude-3.5-sonnet": { input: 0.003, output: 0.015 },
      "claude-3-haiku": { input: 0.00025, output: 0.00125 },
      "grok-2": { input: 0.002, output: 0.01 },
      "grok-beta": { input: 0.005, output: 0.015 },
    };
    const p = model ? pricing[model] : undefined;
    const rate = p ?? { input: 0.001, output: 0.002 };
    return (
      (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output
    );
  }
}
