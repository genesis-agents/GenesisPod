'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, FileText, ListChecks, Layers } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { createMarkdownComponents } from '@/lib/markdown/createMarkdownComponents';

/**
 * 深度研究 mission 的纯展示 UI（独立一套，参考 playground 但不绑其数据）。
 * 输入是 company mission 完成后写入的 result 形状；纯渲染、无副作用。
 */

export interface MissionReportResult {
  summary?: string;
  review?: { score?: number; verdict?: string; notes?: string[] } | null;
  dimensions?: string[];
  themeSummary?: string;
}

/** 深度研究流水线固定 6 阶段（展示用 rail）。 */
const DEEPDIVE_STAGES = [
  { label: '规划', desc: '拆解研究维度' },
  { label: '研究', desc: '并发搜证' },
  { label: '对账', desc: '跨维事实核对' },
  { label: '综合', desc: '提炼洞察' },
  { label: '写作', desc: '结构化成稿' },
  { label: '评审', desc: '质量评分' },
] as const;

type Verdict = 'approve' | 'revise' | 'reject' | string;

function verdictTheme(verdict: Verdict | undefined): {
  ring: string;
  text: string;
  label: string;
} {
  switch (verdict) {
    case 'approve':
      return {
        ring: 'border-emerald-500',
        text: 'text-emerald-600',
        label: '通过',
      };
    case 'reject':
      return { ring: 'border-rose-500', text: 'text-rose-600', label: '驳回' };
    default:
      return {
        ring: 'border-amber-500',
        text: 'text-amber-600',
        label: '待修订',
      };
  }
}

function ScoreRing({
  score,
  verdict,
}: {
  score: number;
  verdict: Verdict | undefined;
}) {
  const theme = verdictTheme(verdict);
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 bg-white',
          theme.ring
        )}
      >
        <span className={cn('text-2xl font-bold leading-none', theme.text)}>
          {score}
        </span>
        <span className="mt-0.5 text-[10px] text-gray-400">/ 100</span>
      </div>
      <span className={cn('mt-1.5 text-xs font-medium', theme.text)}>
        {theme.label}
      </span>
    </div>
  );
}

/** 阶段流水线 rail —— mission 完成态全绿。 */
function PipelineRail() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-3">
      {DEEPDIVE_STAGES.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-gray-200">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-3.5 w-3.5" />
            </div>
            <div className="leading-tight">
              <div className="text-xs font-semibold text-gray-800">
                {s.label}
              </div>
              <div className="text-xs text-gray-400">{s.desc}</div>
            </div>
          </div>
          {i < DEEPDIVE_STAGES.length - 1 && (
            <span className="text-gray-300">→</span>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionHeader({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
      {icon}
      {children}
    </div>
  );
}

export function MissionReportView({
  title,
  createdAt,
  result,
}: {
  title: string;
  createdAt?: number;
  result?: MissionReportResult;
}) {
  const mdComponents = useMemo(() => createMarkdownComponents((t) => t), []);
  const review = result?.review ?? null;
  const dimensions = result?.dimensions ?? [];
  const summary = result?.summary ?? '';

  return (
    <div className="space-y-5">
      {/* 头部：标题 + 评审分 */}
      <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {result?.themeSummary || '深度研究报告'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {dimensions.length} 个研究维度
            </span>
            {createdAt ? (
              <span>· 完成于 {new Date(createdAt).toLocaleString()}</span>
            ) : null}
          </div>
        </div>
        {typeof review?.score === 'number' && (
          <ScoreRing score={review.score} verdict={review.verdict} />
        )}
      </div>

      {/* 流水线 rail */}
      <PipelineRail />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* 报告正文 */}
        <div className="lg:col-span-2">
          <SectionHeader icon={<FileText className="h-4 w-4 text-primary" />}>
            研究报告
          </SectionHeader>
          {summary.trim() ? (
            <div className="max-h-[58vh] overflow-auto rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-800">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={mdComponents}
              >
                {summary}
              </ReactMarkdown>
            </div>
          ) : (
            <EmptyState
              type="default"
              size="sm"
              title="无报告正文"
              description="该任务未生成可展示的报告内容"
            />
          )}
        </div>

        {/* 侧栏：维度 + 评审意见 */}
        <div className="space-y-4">
          <div>
            <SectionHeader
              icon={<Layers className="h-4 w-4 text-violet-500" />}
            >
              研究维度
            </SectionHeader>
            {dimensions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {dimensions.map((d) => (
                  <span
                    key={d}
                    className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
                  >
                    {d}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">—</p>
            )}
          </div>

          <div>
            <SectionHeader
              icon={<ListChecks className="h-4 w-4 text-amber-500" />}
            >
              评审意见
            </SectionHeader>
            {review?.notes && review.notes.length > 0 ? (
              <ul className="space-y-1.5 rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-xs text-gray-600">
                {review.notes.map((n, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-0.5 text-amber-400">•</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">暂无评审意见</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MissionReportView;
