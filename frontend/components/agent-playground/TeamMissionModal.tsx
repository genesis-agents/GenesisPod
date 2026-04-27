'use client';

/**
 * TeamMissionModal —— "研究团队" Group 节点展开后的 micro-pipeline 视图
 *
 * 每个维度一个独立 column / row 显示：
 *   Researcher → Outline → ChapterWriter → ChapterReviewer → Integrator → Judge
 * 各 sub-agent 节点显示状态（idle/running/done/failed）+ 章节进度 + 5-axis 评分。
 */

import {
  X as XIcon,
  Search,
  Brain,
  PenLine,
  CheckCircle2,
  GitBranch,
  Trophy,
  Loader2,
  Circle,
  AlertCircle,
} from 'lucide-react';
import type {
  AgentLiveState,
  DimensionPipelineState,
} from '@/lib/agent-playground/derive';

interface Props {
  open: boolean;
  onClose: () => void;
  /** mission 维度（来自 leader 输出 / persisted） */
  dimensions: { id?: string; name: string; rationale?: string }[];
  /** 所有 agents（用来按 dimension 找 Researcher 实例） */
  agents: AgentLiveState[];
  /** 每维度的 micro-pipeline state（章节进度 / 5-axis grade） */
  pipelines: Map<string, DimensionPipelineState>;
  /** 点击某个维度的具体 sub-agent（如 Researcher / Judge）→ 详情抽屉 */
  onAgentClick?: (taskKey: string) => void;
}

type SubStage =
  | 'researcher'
  | 'outline'
  | 'chapter-write'
  | 'chapter-review'
  | 'integrator'
  | 'judge';

const SUB_STAGES: {
  key: SubStage;
  label: string;
  Icon: typeof Search;
  tone: string;
}[] = [
  { key: 'researcher', label: '采集', Icon: Search, tone: 'sky' },
  { key: 'outline', label: '大纲', Icon: Brain, tone: 'violet' },
  { key: 'chapter-write', label: '撰写', Icon: PenLine, tone: 'rose' },
  { key: 'chapter-review', label: '审核', Icon: CheckCircle2, tone: 'amber' },
  { key: 'integrator', label: '整合', Icon: GitBranch, tone: 'emerald' },
  { key: 'judge', label: '评分', Icon: Trophy, tone: 'purple' },
];

const TONE: Record<string, string> = {
  sky: 'bg-sky-100 text-sky-700 ring-sky-300',
  violet: 'bg-violet-100 text-violet-700 ring-violet-300',
  rose: 'bg-rose-100 text-rose-700 ring-rose-300',
  amber: 'bg-amber-100 text-amber-700 ring-amber-300',
  emerald: 'bg-emerald-100 text-emerald-700 ring-emerald-300',
  purple: 'bg-purple-100 text-purple-700 ring-purple-300',
};

function deriveSubStageStatus(
  stage: SubStage,
  agent: AgentLiveState | undefined,
  pipeline: DimensionPipelineState | undefined
): 'idle' | 'running' | 'done' | 'failed' {
  if (stage === 'researcher') {
    if (!agent) return 'idle';
    if (agent.phase === 'completed') return 'done';
    if (agent.phase === 'failed') return 'failed';
    if (agent.phase === 'running') return 'running';
    return 'idle';
  }
  if (!pipeline) return 'idle';
  if (stage === 'outline') {
    return pipeline.chapters.length > 0
      ? 'done'
      : agent?.phase === 'completed'
        ? 'failed'
        : 'idle';
  }
  if (stage === 'chapter-write') {
    if (pipeline.chapters.length === 0) return 'idle';
    const writingOrLater = pipeline.chapters.filter(
      (c) =>
        c.status === 'writing' ||
        c.status === 'reviewing' ||
        c.status === 'revising' ||
        c.status === 'passed' ||
        c.status === 'failed'
    );
    if (writingOrLater.length === 0) return 'idle';
    if (pipeline.chapters.every((c) => c.status === 'passed')) return 'done';
    if (pipeline.chapters.some((c) => c.status === 'failed')) return 'failed';
    return 'running';
  }
  if (stage === 'chapter-review') {
    if (pipeline.chapters.length === 0) return 'idle';
    const reviewedOrPassed = pipeline.chapters.filter(
      (c) =>
        c.status === 'passed' ||
        c.status === 'reviewing' ||
        c.status === 'revising'
    );
    if (reviewedOrPassed.length === 0) return 'idle';
    if (pipeline.chapters.every((c) => c.status === 'passed')) return 'done';
    return 'running';
  }
  if (stage === 'integrator') {
    return pipeline.totalWordCount != null
      ? 'done'
      : pipeline.chapters.every((c) => c.status === 'passed')
        ? 'running'
        : 'idle';
  }
  if (stage === 'judge') {
    return pipeline.grade
      ? 'done'
      : pipeline.totalWordCount != null
        ? 'running'
        : 'idle';
  }
  return 'idle';
}

function StatusDot({
  status,
}: {
  status: 'idle' | 'running' | 'done' | 'failed';
}) {
  if (status === 'running')
    return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
  if (status === 'done')
    return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  if (status === 'failed')
    return <AlertCircle className="h-3 w-3 text-red-500" />;
  return <Circle className="h-3 w-3 text-gray-300" />;
}

export function TeamMissionModal({
  open,
  onClose,
  dimensions,
  agents,
  pipelines,
  onAgentClick,
}: Props) {
  if (!open) return null;

  // 总体统计
  const totalDims = dimensions.length;
  const completedDims = dimensions.filter((d) => {
    const a = agents.find(
      (x) => x.role === 'researcher' && x.dimension === d.name
    );
    return a?.phase === 'completed';
  }).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-white">
          <div>
            <p className="text-sm font-semibold">研究团队 · Micro Pipeline</p>
            <p className="text-[11px] text-white/80">
              {totalDims} 个维度 · {completedDims} 已完成 · 每维度跑 6-stage
              微团队（采集 → 大纲 → 撰写 → 审核 → 整合 → 评分）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/20"
            title="关闭"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 每维度一行 */}
        <div className="flex-1 overflow-y-auto p-4">
          {dimensions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
              Leader 还没拆分维度，等待规划阶段完成…
            </div>
          ) : (
            <ul className="space-y-3">
              {dimensions.map((d, dIdx) => {
                const agent = agents.find(
                  (x) => x.role === 'researcher' && x.dimension === d.name
                );
                const pipeline = pipelines.get(d.name);
                const taskKey = `researcher-${d.id ?? d.name}`;
                return (
                  <li
                    key={d.id ?? d.name}
                    className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    {/* 维度标题 + 总评分 */}
                    <div className="mb-3 flex items-baseline justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onAgentClick?.(taskKey)}
                        className="flex items-baseline gap-2 text-left hover:text-sky-700"
                      >
                        <span className="font-mono text-[11px] text-gray-400">
                          维度 {dIdx + 1}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 group-hover:underline">
                          {d.name}
                        </span>
                      </button>
                      {pipeline?.grade && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            pipeline.grade.grade === 'excellent'
                              ? 'bg-emerald-50 text-emerald-700'
                              : pipeline.grade.grade === 'good'
                                ? 'bg-blue-50 text-blue-700'
                                : pipeline.grade.grade === 'fair'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {pipeline.grade.overall}/100 ·{' '}
                          {pipeline.grade.grade === 'excellent'
                            ? '优秀'
                            : pipeline.grade.grade === 'good'
                              ? '良好'
                              : pipeline.grade.grade === 'fair'
                                ? '一般'
                                : '不及格'}
                        </span>
                      )}
                    </div>

                    {/* Micro pipeline 6 个 stage */}
                    <div className="flex items-center gap-1 overflow-x-auto">
                      {SUB_STAGES.map((s, si) => {
                        const status = deriveSubStageStatus(
                          s.key,
                          agent,
                          pipeline
                        );
                        const Icon = s.Icon;
                        return (
                          <div
                            key={s.key}
                            className="flex shrink-0 items-center gap-1"
                          >
                            <button
                              type="button"
                              onClick={() => onAgentClick?.(taskKey)}
                              className={`flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 ring-1 transition-all ${
                                status === 'idle'
                                  ? 'bg-gray-50 text-gray-400 ring-gray-200'
                                  : TONE[s.tone]
                              }`}
                              title={`${s.label} · ${status === 'done' ? '已完成' : status === 'running' ? '进行中' : status === 'failed' ? '失败' : '待启动'}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span className="flex items-center gap-1 text-[10px] font-medium">
                                {s.label}
                                <StatusDot status={status} />
                              </span>
                            </button>
                            {si < SUB_STAGES.length - 1 && (
                              <span className="font-mono text-[10px] text-gray-300">
                                →
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* 章节进度条（如有） */}
                    {pipeline && pipeline.chapters.length > 0 && (
                      <div className="mt-2.5">
                        <div className="mb-0.5 flex items-baseline justify-between text-[10px]">
                          <span className="text-gray-500">章节进度</span>
                          <span className="font-mono text-gray-600">
                            {
                              pipeline.chapters.filter(
                                (c) => c.status === 'passed'
                              ).length
                            }{' '}
                            / {pipeline.chapters.length}
                            {pipeline.totalWordCount
                              ? ` · ${pipeline.totalWordCount} 字`
                              : ''}
                          </span>
                        </div>
                        <div className="flex gap-0.5">
                          {pipeline.chapters.map((c) => (
                            <div
                              key={c.index}
                              title={`第 ${c.index} 章 · ${c.heading}${c.score != null ? ` (${c.score}分)` : ''}`}
                              className={`h-1.5 flex-1 rounded ${
                                c.status === 'passed'
                                  ? 'bg-emerald-400'
                                  : c.status === 'writing'
                                    ? 'animate-pulse bg-blue-400'
                                    : c.status === 'reviewing'
                                      ? 'animate-pulse bg-amber-400'
                                      : c.status === 'revising'
                                        ? 'animate-pulse bg-orange-400'
                                        : c.status === 'failed'
                                          ? 'bg-red-400'
                                          : 'bg-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
