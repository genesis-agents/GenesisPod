/**
 * Structure validator
 *
 * 比较 baseline 与 candidate 的结构，产出一组 StructureDiff。
 * 策略：
 * - severity = 'fail' 表示硬性违约，判 FAIL
 * - severity = 'warn' 表示差异在容忍区间内
 * - severity = 'ok' 表示完全一致（只在信息性输出用）
 *
 * 允许容忍的维度：token / call count / cost 允许 ±30% 浮动
 * （harness 优化带来的差异不算 FAIL；但必须出现在报告里供人工确认）
 */

import type { BaselineFixture, CandidateFixture, StructureDiff } from "./types";

const TOLERANCE_PERCENT = 0.3;

function withinTolerance(
  baseline: number,
  candidate: number,
  tolerance = TOLERANCE_PERCENT,
): boolean {
  if (baseline === 0) return candidate === 0;
  return Math.abs(candidate - baseline) / baseline <= tolerance;
}

export function compareStructure(
  baseline: BaselineFixture,
  candidate: CandidateFixture,
): StructureDiff[] {
  const diffs: StructureDiff[] = [];

  // -------- Mission 终态 --------
  if (candidate.dbSnapshot.status !== "completed") {
    diffs.push({
      severity: "fail",
      field: "dbSnapshot.status",
      baseline: baseline.dbSnapshot.status,
      candidate: candidate.dbSnapshot.status,
      message: "Candidate mission did not reach COMPLETED status",
    });
  }

  // -------- Events 序列必有 START + END --------
  const candidateEvents = candidate.events.map((e) => e.event as string);
  if (!candidateEvents.includes("mission:started")) {
    diffs.push({
      severity: "fail",
      field: "events",
      baseline: "mission:started present",
      candidate: "missing",
      message: "Candidate events missing mission:started",
    });
  }
  if (
    !candidateEvents.includes("mission:completed") &&
    !candidateEvents.includes("mission:failed")
  ) {
    diffs.push({
      severity: "fail",
      field: "events",
      baseline: "mission:completed/failed present",
      candidate: "missing",
      message: "Candidate events missing mission terminal event",
    });
  }

  // -------- 报告产物存在 --------
  if (!candidate.dbSnapshot.report) {
    diffs.push({
      severity: "fail",
      field: "dbSnapshot.report",
      baseline: "present",
      candidate: "null",
      message: "Candidate has no TopicReport",
    });
  }

  // -------- 报告字数（±30% 允许） --------
  const baseLen = baseline.finalReportMd.length;
  const candLen = candidate.finalReportMd.length;
  if (!withinTolerance(baseLen, candLen)) {
    diffs.push({
      severity: "fail",
      field: "finalReportMd.length",
      baseline: baseLen,
      candidate: candLen,
      message: `Report length diverged beyond ${TOLERANCE_PERCENT * 100}%`,
    });
  } else if (Math.abs(candLen - baseLen) / baseLen > 0.1) {
    diffs.push({
      severity: "warn",
      field: "finalReportMd.length",
      baseline: baseLen,
      candidate: candLen,
      message: "Report length diverged >10% (within tolerance)",
    });
  }

  // -------- dimensions 数量 --------
  if (
    candidate.dbSnapshot.dimensions.length !==
    baseline.dbSnapshot.dimensions.length
  ) {
    diffs.push({
      severity: "fail",
      field: "dbSnapshot.dimensions.length",
      baseline: baseline.dbSnapshot.dimensions.length,
      candidate: candidate.dbSnapshot.dimensions.length,
      message: "Dimension count differs",
    });
  }

  // -------- evidence 数量（±30%） --------
  if (
    !withinTolerance(
      baseline.dbSnapshot.evidenceCount,
      candidate.dbSnapshot.evidenceCount,
    )
  ) {
    diffs.push({
      severity: "fail",
      field: "dbSnapshot.evidenceCount",
      baseline: baseline.dbSnapshot.evidenceCount,
      candidate: candidate.dbSnapshot.evidenceCount,
      message: `Evidence count diverged beyond ${TOLERANCE_PERCENT * 100}%`,
    });
  }

  // -------- metrics：tokens / cost / latency 容忍区间 --------
  if (
    !withinTolerance(
      baseline.metrics.totalTokens,
      candidate.metrics.totalTokens,
    )
  ) {
    diffs.push({
      severity: "warn",
      field: "metrics.totalTokens",
      baseline: baseline.metrics.totalTokens,
      candidate: candidate.metrics.totalTokens,
      message: `Token count diverged beyond ${TOLERANCE_PERCENT * 100}% (warn only)`,
    });
  }
  if (
    !withinTolerance(
      baseline.metrics.estimatedCostUsd,
      candidate.metrics.estimatedCostUsd,
    )
  ) {
    diffs.push({
      severity: "warn",
      field: "metrics.estimatedCostUsd",
      baseline: baseline.metrics.estimatedCostUsd,
      candidate: candidate.metrics.estimatedCostUsd,
      message: "Cost diverged beyond tolerance (warn only)",
    });
  }
  if (
    !withinTolerance(
      baseline.metrics.totalChatLatencyMs,
      candidate.metrics.totalChatLatencyMs,
    )
  ) {
    diffs.push({
      severity: "warn",
      field: "metrics.totalChatLatencyMs",
      baseline: baseline.metrics.totalChatLatencyMs,
      candidate: candidate.metrics.totalChatLatencyMs,
      message: "Latency diverged beyond tolerance (warn only)",
    });
  }

  // -------- llm call count（±50%，更宽容；harness 会合并/拆分） --------
  if (
    !withinTolerance(
      baseline.metrics.llmCallCount,
      candidate.metrics.llmCallCount,
      0.5,
    )
  ) {
    diffs.push({
      severity: "warn",
      field: "metrics.llmCallCount",
      baseline: baseline.metrics.llmCallCount,
      candidate: candidate.metrics.llmCallCount,
      message: "LLM call count diverged beyond 50% (warn only)",
    });
  }

  return diffs;
}

export function isPass(diffs: StructureDiff[]): boolean {
  return diffs.every((d) => d.severity !== "fail");
}
