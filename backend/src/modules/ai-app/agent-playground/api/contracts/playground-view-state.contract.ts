// @blueprint:domain
/**
 * PlaygroundDomainView — playground 业务专属的 view state 扩展
 *
 * 2026-05-26 ADR 009 §3 / PR-D-0 落地 (本文件是 PR-D-1 前置):
 *   framework 端口 MissionViewState<TDomain> (ai-harness/teams/business-team/abstractions/)
 *   的 TDomain 在 playground 实例化为本文件定义的 PlaygroundDomainView shape.
 *
 *   PR-D-1 实现的 playground-view-state.service.ts 输出
 *   MissionViewState<PlaygroundDomainView>, 前端订阅后渲染.
 *
 * 字段来源 (与前端 frontend/lib/features/agent-playground/derive.ts 对齐):
 *   DerivedView.mission 内的 playground 特有字段 → PlaygroundDomainView.mission
 *   DerivedView.verdicts                → PlaygroundDomainView.verdicts
 *   DerivedView.memory                  → PlaygroundDomainView.memory
 *   DerivedView.reports                 → PlaygroundDomainView.reports
 *   DerivedView.finalReport             → PlaygroundDomainView.finalReport
 *   DerivedView.dimensionPipelines      → PlaygroundDomainView.dimensionPipelines (Map → Record)
 *
 * 兼容性 (ADR 009 §0):
 *   PR-D-1 后端 derive 输出本 shape 后, 必须与前端 derive 输出 deep-equal:
 *   `expect(backendDerive(events)).toEqual(frontendDerive(events))` (fixture-based)
 *   Map → Record 是唯一形态调整 (Map 不能 JSON serialize), 字段值零变.
 *
 * 状态: V0 (PR-D-1 实现后视实测需要迭代到 V1)
 */

import type { MissionViewState } from "@/modules/ai-harness/facade";

/** playground 特有的 mission 顶层字段 (前端 DerivedView.mission 的非通用部分). */
export interface PlaygroundMissionDomainInfo {
  /** 用户提交的 research topic. */
  readonly topic?: string;
  /** 报告深度档位 (light/standard/deep/scholarly). */
  readonly depth?: string;
  /** 输出语言. */
  readonly language?: string;
  /** Leader 综合后的主题摘要. */
  readonly themeSummary?: string;
  /** Leader 拆分的 dimension 列表 (核心 playground 业务概念). */
  readonly dimensions?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly rationale: string;
  }>;
  /** Mission 终态的综合评分. */
  readonly finalScore?: number;
  /** 用户预算 (credit). */
  readonly maxCredits?: number;
  /** 用户上限 (墙时, 毫秒). */
  readonly wallTimeMs?: number;
}

/** Verifier 给出的评分判断 (playground 多 judge 共识业务). */
export interface VerifierVerdictView {
  readonly verifierId: string;
  readonly score: number;
  readonly critique?: string;
  readonly criteria?: Readonly<Record<string, number>>;
  readonly modelId?: string;
  readonly attempt?: number;
}

/** Memory index 状态 (playground 用 RAG 做章节材料检索). */
export interface MemoryIndexStateView {
  readonly chunks: number;
  readonly namespace?: string;
  readonly tags?: ReadonlyArray<string>;
}

/** Report draft 内容 (playground 报告生成产物). */
export interface ReportDraftView {
  readonly attempt: number;
  readonly report: {
    readonly title?: string;
    readonly summary?: string;
    readonly sections?: ReadonlyArray<{
      readonly heading: string;
      readonly body: string;
      readonly sources?: ReadonlyArray<string>;
    }>;
    readonly conclusion?: string;
    readonly citations?: ReadonlyArray<string>;
  };
}

/** Chapter 写作状态 (per-dimension 流水线产物). */
export interface ChapterStateView {
  readonly index: number;
  readonly heading: string;
  readonly thesis?: string;
  readonly status:
    | "pending"
    | "writing"
    | "reviewing"
    | "revising"
    | "passed"
    | "done"
    | "failed-finalized"
    | "failed";
  readonly attempts: number;
  readonly wordCount?: number;
  readonly score?: number;
  readonly critique?: string;
}

/** Per-dimension 子流水线状态 (playground 核心业务: 多 dimension 并行写报告). */
export interface DimensionPipelineStateView {
  readonly dimension: string;
  readonly chapters: ReadonlyArray<ChapterStateView>;
  readonly totalWordCount?: number;
  readonly integrationDegraded?: boolean;
  readonly grade?: {
    readonly overall: number;
    readonly grade: string;
    readonly axes: Readonly<
      Record<string, { score: number; comment: string }>
    >;
    readonly summary: string;
    readonly failed?: boolean;
    readonly skipped?: boolean;
    readonly phase?: string;
  };
}

/**
 * PlaygroundDomainView — TDomain in MissionViewState<TDomain>.
 *
 * 前端 frontend/lib/features/agent-playground/derive.ts DerivedView 的
 * playground 专属字段全部归到这里. PR-D-1 后端 derive 输出此 shape.
 *
 * Map 形态字段 (现前端用 Map<string, T>) 改为 Record<string, T>: 后端 emit JSON
 * 不支持 Map 序列化. 前端拿到 Record 后渲染等价 (Object.entries / Object.values).
 */
export interface PlaygroundDomainView {
  /** playground 特有的 mission 顶层字段. */
  readonly mission: PlaygroundMissionDomainInfo;
  /** Verifier 评分列表. */
  readonly verdicts: ReadonlyArray<VerifierVerdictView>;
  /** Memory index 状态 (可能为 null). */
  readonly memory: MemoryIndexStateView | null;
  /** Report 草稿历史. */
  readonly reports: ReadonlyArray<ReportDraftView>;
  /** 最终报告 (mission completed 后从最后 attempt 取). */
  readonly finalReport: ReportDraftView["report"] | null;
  /**
   * Per-dimension pipeline 状态.
   * 前端 derive 用 Map<string, DimensionPipelineState>; 后端 emit 用 Record (JSON-safe).
   * 前端消费时 Object.entries() 等价遍历.
   */
  readonly dimensionPipelines: Readonly<
    Record<string, DimensionPipelineStateView>
  >;
}

/** Playground 顶层 view state 类型别名 (主消费方用). */
export type PlaygroundMissionViewState = MissionViewState<PlaygroundDomainView>;
