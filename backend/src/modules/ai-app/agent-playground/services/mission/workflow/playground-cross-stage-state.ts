/**
 * PlaygroundCrossStageState —— Stage 1 / S1-2 (2026-05-09,closes T3)
 *
 * Typed wrapper around Z5 `CrossStageState`(`@/modules/ai-harness/facade`),
 * 替代 SessionEntry 内的 14 个 ad-hoc cache fields(`lastPlan` /
 * `lastResearcherResults` / ... / `s4PatchFailures` / `inheritedResearchResults` /
 * `inheritedChapters`)。
 *
 * **设计目标**(idempotent refactor,外部行为完全保留):
 *   - getter/setter 语法与原 field 一致(`entry.crossState.lastPlan = X` 替代
 *     `entry.lastPlan = X`),hook closures 内的 mechanical sed 替换即可
 *   - 内部 sync in-memory Map(从 Z5 CrossStageState 继承),0 引入 async I/O
 *   - **Z5 CrossStageState 是底座**,playground 在其之上暴露 typed 字段视图
 *   - **不直接** 持久化(Stage 2 follow-up 加 IMissionStore.saveCrossStageState
 *     同步,实现 crashed-mission resume — 不在本 commit 范围)
 *
 * 详见:
 *   - docs/architecture/ai-app/agent-playground/agent-team-boundary-audit-2026-05-08.md
 *     §7 S1-2 + §2.5 T3
 *   - docs/architecture/ai-harness/facade/sediment-topology.md §5 T3
 */

import { CrossStageState } from "@/modules/ai-harness/facade";
import type { MissionContext } from "./mission-context";

type LastPlan = MissionContext["plan"];
type LastResearcherResults = MissionContext["researcherResults"];
type LastReconciliationReport = MissionContext["reconciliationReport"];
type LastAnalystOutput = MissionContext["analystOutput"];
type LastOutlinePlan = MissionContext["outlinePlan"];
type LastReport = MissionContext["report"];
type LastReportArtifact = MissionContext["reportArtifact"];
type LastReviewScore = MissionContext["reviewScore"];
type LastVerifierVerdicts = unknown[];
type LastLeaderForeword = MissionContext["leaderForeword"];
type LastLeaderSignOff = MissionContext["leaderSignOff"];
type S4PatchFailures = MissionContext["s4PatchFailures"];

interface InheritedResearchResult {
  dimension: string;
  findings: { claim: string; evidence: string; source: string }[];
  summary: string;
}
interface InheritedChapter {
  dimension: string;
  chapterIndex: number;
  heading: string;
  thesis?: string;
  content: string;
  score?: number;
  attempts: number;
  wordCount?: number;
}

export class PlaygroundCrossStageState {
  private readonly inner: CrossStageState;

  constructor(initial?: CrossStageState) {
    this.inner = initial ?? new CrossStageState();
  }

  // ── stage 中间产物缓存(11 类) ────────────────────────────────────────────

  get lastPlan(): LastPlan | undefined {
    return this.inner.get<LastPlan>("lastPlan");
  }
  set lastPlan(value: LastPlan | undefined) {
    this.inner.set("lastPlan", value);
  }

  get lastResearcherResults(): LastResearcherResults | undefined {
    return this.inner.get<LastResearcherResults>("lastResearcherResults");
  }
  set lastResearcherResults(value: LastResearcherResults | undefined) {
    this.inner.set("lastResearcherResults", value);
  }

  get lastReconciliationReport(): LastReconciliationReport | undefined {
    return this.inner.get<LastReconciliationReport>("lastReconciliationReport");
  }
  set lastReconciliationReport(value: LastReconciliationReport | undefined) {
    this.inner.set("lastReconciliationReport", value);
  }

  get lastAnalystOutput(): LastAnalystOutput | undefined {
    return this.inner.get<LastAnalystOutput>("lastAnalystOutput");
  }
  set lastAnalystOutput(value: LastAnalystOutput | undefined) {
    this.inner.set("lastAnalystOutput", value);
  }

  get lastOutlinePlan(): LastOutlinePlan | undefined {
    return this.inner.get<LastOutlinePlan>("lastOutlinePlan");
  }
  set lastOutlinePlan(value: LastOutlinePlan | undefined) {
    this.inner.set("lastOutlinePlan", value);
  }

  get lastReport(): LastReport | undefined {
    return this.inner.get<LastReport>("lastReport");
  }
  set lastReport(value: LastReport | undefined) {
    this.inner.set("lastReport", value);
  }

  get lastReportArtifact(): LastReportArtifact | undefined {
    return this.inner.get<LastReportArtifact>("lastReportArtifact");
  }
  set lastReportArtifact(value: LastReportArtifact | undefined) {
    this.inner.set("lastReportArtifact", value);
  }

  get lastReviewScore(): LastReviewScore | undefined {
    return this.inner.get<LastReviewScore>("lastReviewScore");
  }
  set lastReviewScore(value: LastReviewScore | undefined) {
    this.inner.set("lastReviewScore", value);
  }

  get lastVerifierVerdicts(): LastVerifierVerdicts | undefined {
    return this.inner.get<LastVerifierVerdicts>("lastVerifierVerdicts");
  }
  set lastVerifierVerdicts(value: LastVerifierVerdicts | undefined) {
    this.inner.set("lastVerifierVerdicts", value);
  }

  get lastLeaderForeword(): LastLeaderForeword | undefined {
    return this.inner.get<LastLeaderForeword>("lastLeaderForeword");
  }
  set lastLeaderForeword(value: LastLeaderForeword | undefined) {
    this.inner.set("lastLeaderForeword", value);
  }

  get lastLeaderSignOff(): LastLeaderSignOff | undefined {
    return this.inner.get<LastLeaderSignOff>("lastLeaderSignOff");
  }
  set lastLeaderSignOff(value: LastLeaderSignOff | undefined) {
    this.inner.set("lastLeaderSignOff", value);
  }

  // ── 跨 stage 共享状态 ────────────────────────────────────────────────────

  get s4PatchFailures(): S4PatchFailures | undefined {
    return this.inner.get<S4PatchFailures>("s4PatchFailures");
  }
  set s4PatchFailures(value: S4PatchFailures | undefined) {
    this.inner.set("s4PatchFailures", value);
  }

  // ── #37 S3 迭代级 checkpoint(2026-05-23) ──────────────────────────────
  // dim → ResearcherDimResult；resume 时用来跳过已完成维度。
  get s3PartialResults(): Record<string, unknown> | undefined {
    return this.inner.get<Record<string, unknown>>("s3PartialResults");
  }
  set s3PartialResults(value: Record<string, unknown> | undefined) {
    this.inner.set("s3PartialResults", value);
  }

  // ── trajectory rerun cache(P0-D 完整版,2026-05-06) ────────────────────

  get inheritedResearchResults(): InheritedResearchResult[] | undefined {
    return this.inner.get<InheritedResearchResult[]>(
      "inheritedResearchResults",
    );
  }
  set inheritedResearchResults(value: InheritedResearchResult[] | undefined) {
    this.inner.set("inheritedResearchResults", value);
  }

  get inheritedChapters(): InheritedChapter[] | undefined {
    return this.inner.get<InheritedChapter[]>("inheritedChapters");
  }
  set inheritedChapters(value: InheritedChapter[] | undefined) {
    this.inner.set("inheritedChapters", value);
  }

  // ── 序列化(Stage 2 follow-up:接 IMissionStore.saveCrossStageState) ────

  toJSON(): Record<string, unknown> {
    return this.inner.toJSON();
  }

  static fromJSON(data: Record<string, unknown>): PlaygroundCrossStageState {
    return new PlaygroundCrossStageState(CrossStageState.fromJSON(data));
  }
}
