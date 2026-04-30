'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  Info,
  List,
  RefreshCw,
  Sparkles,
  X as XIcon,
} from 'lucide-react';
import type { ReportArtifact } from '@/lib/agent-playground/report-artifact.types';
import type { DimensionPipelineState } from '@/lib/agent-playground/derive';
import { ContinuousReader } from './ContinuousReader';
import { ChapterReader } from './ChapterReader';
import { QuickReader } from './QuickReader';
import { QualityBadge } from './QualityBadge';
import { FactTablePanel } from './FactTablePanel';
import { ReconciliationPanel } from './ReconciliationPanel';
import { ToolRecallTrace } from './ToolRecallTrace';
import { ReportHeroStrip } from './ReportHeroStrip';

type ViewMode = 'continuous' | 'chapter' | 'quick';

interface Props {
  artifact: ReportArtifact;
  defaultView?: ViewMode;
  missionId?: string;
  reconciliationReport?: {
    factTable?: unknown[];
    conflicts?: {
      factIds: string[];
      resolutionType: 'kept-both' | 'preferred-one' | 'flagged-unresolved';
      rationale: string;
    }[];
    overlaps?: {
      dimensionPair?: [string, string];
      similarityScore?: number;
      overlappingClaim?: string;
      resolutionAction?: string;
    }[];
    gaps?: {
      dimensionId?: string;
      expectedAspects?: string[];
      severity?: 'critical' | 'minor';
    }[];
    reconciliationReport?: string;
    figureCandidates?: unknown[];
    deduplicationStats?: {
      duplicatesRemoved?: number;
      termVariantsUnified?: number;
      dataInconsistenciesFlagged?: number;
    };
    termGlossary?: { canonical: string; variants: string[] }[];
  };
  toolRecallEntries?: {
    agentId: string;
    role: string;
    recalledIds: readonly string[];
    categories: readonly string[];
    source: string;
    preferIds?: readonly string[];
  }[];
  /**
   * ★ 2026-04-30: 实时章节修订状态
   * 从 view.dimensionPipelines 传进来，让 chapter 视图能看到哪些章节正在
   * writing / reviewing / revising，避免章节卡永远显示"已完成"。
   */
  dimensionPipelines?: Map<string, DimensionPipelineState>;
}

/**
 * 三视图统一入口（mission-pipeline-baseline.md §8）
 *
 * - 默认连续视图（continuous）
 * - 切换 chapter / quick 不改 URL，只改本地 state（保留位置感知留待后续迭代）
 */
export function ArtifactReader({
  artifact,
  defaultView = 'continuous',
  missionId,
  reconciliationReport,
  toolRecallEntries,
  dimensionPipelines,
}: Props) {
  // ★ 2026-04-30: 收集所有正在修订/写作/评审的章节，给 ChapterReader 渲染状态徽标，
  //   并在工具栏下方加"修订中"banner。chapter:writing:started / chapter:revision /
  //   chapter:rewritten 事件触发 derive.ts 更新 dimensionPipelines.chapters[].status，
  //   这里反查得到 live status，避免章节卡永远停在"已完成"假象。
  const liveActivity = useMemo(() => {
    if (!dimensionPipelines || dimensionPipelines.size === 0) {
      return {
        revising: [] as {
          dim: string;
          idx: number;
          heading: string;
          status: string;
        }[],
      };
    }
    const revising: {
      dim: string;
      idx: number;
      heading: string;
      status: string;
    }[] = [];
    for (const [dim, p] of dimensionPipelines.entries()) {
      for (const ch of p.chapters) {
        if (
          ch.status === 'writing' ||
          ch.status === 'reviewing' ||
          ch.status === 'revising'
        ) {
          revising.push({
            dim,
            idx: ch.index,
            heading: ch.heading,
            status: ch.status,
          });
        }
      }
    }
    return { revising };
  }, [dimensionPipelines]);
  // ★ 2026-04-30 (#51 报告极简化): 元信息抽屉
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insightsTab, setInsightsTab] = useState<
    'quality' | 'meta' | 'fact' | 'recon' | 'tool'
  >('quality');

  // Phase P16-7: 视图切换持久到 URL hash
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.match(
        /^#view=(continuous|chapter|quick)/
      );
      if (hash?.[1]) return hash[1] as ViewMode;
    }
    return defaultView;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const newHash = `#view=${view}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  }, [view]);
  return (
    <div className="space-y-4">
      {/* Sticky 单条工具栏：视图切换 + 质量评分缩略 + 元信息 + 导出 */}
      <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-2 py-2 backdrop-blur-sm">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          <ViewBtn
            active={view === 'continuous'}
            onClick={() => setView('continuous')}
            icon={<BookOpen className="h-3.5 w-3.5" />}
          >
            连续视图
          </ViewBtn>
          <ViewBtn
            active={view === 'chapter'}
            onClick={() => setView('chapter')}
            icon={<List className="h-3.5 w-3.5" />}
          >
            章节视图
          </ViewBtn>
          <ViewBtn
            active={view === 'quick'}
            onClick={() => setView('quick')}
            icon={<Sparkles className="h-3.5 w-3.5" />}
          >
            快速视图
          </ViewBtn>
        </div>
        {/* ★ 2026-04-30 (#51): 工具栏右侧只保留 报告分析 / 导出 两个按钮，
            质量分数 / metadata / 事实表 / 对账 / 工具召回 全移到右侧 slide-over */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
          <button
            type="button"
            onClick={() => {
              setInsightsTab('quality');
              setInsightsOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-gray-700 ring-1 ring-gray-200 transition-colors hover:bg-gray-100"
            title="查看质量评分 / 元信息 / 事实表 / 对账 / 工具召回"
          >
            <Info className="h-3.5 w-3.5" />
            <span className="font-medium">报告分析</span>
            <span
              className={`font-mono ml-1 font-bold ${
                artifact.quality.overall >= 80
                  ? 'text-emerald-600'
                  : artifact.quality.overall >= 65
                    ? 'text-amber-600'
                    : 'text-red-600'
              }`}
            >
              {artifact.quality.overall}
            </span>
          </button>
          {missionId && <ExportMenu missionId={missionId} />}
        </div>
      </div>

      {/* ★ 2026-04-30: 修订进行中 banner —— 用户能看到"哪些章节正在被改" */}
      {liveActivity.revising.length > 0 && (
        <div className="-mx-2 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 font-medium">
              正在修订 {liveActivity.revising.length} 个章节 · Revising{' '}
              {liveActivity.revising.length} chapter
              {liveActivity.revising.length > 1 ? 's' : ''}
            </div>
            <div className="space-y-0.5 text-[11px] leading-relaxed text-amber-800/90">
              {liveActivity.revising.slice(0, 6).map((c, i) => {
                const statusLabel =
                  c.status === 'revising'
                    ? '修订中 · revising'
                    : c.status === 'reviewing'
                      ? '评审中 · reviewing'
                      : '写作中 · writing';
                return (
                  <div key={i} className="truncate">
                    <span className="font-mono mr-1.5 inline-block min-w-[2rem] rounded bg-amber-200/60 px-1 text-center text-amber-900">
                      {c.idx + 1}
                    </span>
                    <span className="text-amber-900">[{c.dim}]</span>{' '}
                    <span className="text-amber-800">{c.heading}</span>{' '}
                    <span className="text-[10px] text-amber-700">
                      ({statusLabel})
                    </span>
                  </div>
                );
              })}
              {liveActivity.revising.length > 6 && (
                <div className="text-[10px] text-amber-700">
                  …还有 {liveActivity.revising.length - 6} 个章节进行中
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ★ 2026-04-30 (#51): 主区只渲染报告正文 —— 元信息全在右侧抽屉 */}
      {view === 'continuous' && <ContinuousReader artifact={artifact} />}
      {view === 'chapter' && (
        <ChapterReader
          artifact={artifact}
          dimensionPipelines={dimensionPipelines}
        />
      )}
      {view === 'quick' && (
        <QuickReader
          artifact={artifact}
          onSwitchToFull={() => setView('continuous')}
        />
      )}

      {/* ★ 2026-04-30 (#51): 报告分析 slide-over —— 元信息抽屉 */}
      {insightsOpen && (
        <>
          {/* backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setInsightsOpen(false)}
          />
          {/* panel */}
          <div className="fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-[92vw] flex-col border-l border-gray-200 bg-white shadow-2xl">
            {/* header + tabs */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">报告分析</h3>
              <button
                type="button"
                onClick={() => setInsightsOpen(false)}
                className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                title="关闭"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1 border-b border-gray-100 px-3 py-2 text-[11px]">
              {(
                [
                  { key: 'quality', label: '质量' },
                  { key: 'meta', label: '元信息' },
                  ...(artifact.factTable.length > 0
                    ? [{ key: 'fact', label: '事实表' } as const]
                    : []),
                  ...(reconciliationReport
                    ? [{ key: 'recon', label: '对账' } as const]
                    : []),
                  ...(toolRecallEntries && toolRecallEntries.length > 0
                    ? [{ key: 'tool', label: '工具召回' } as const]
                    : []),
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setInsightsTab(t.key)}
                  className={
                    insightsTab === t.key
                      ? 'rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700 ring-1 ring-blue-200'
                      : 'rounded-md px-2 py-1 text-gray-600 hover:bg-gray-50'
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* body */}
            <div className="flex-1 overflow-auto p-4">
              {insightsTab === 'quality' && (
                <div className="space-y-3">
                  <QualityBadge quality={artifact.quality} />
                  <ReportHeroStrip artifact={artifact} />
                </div>
              )}
              {insightsTab === 'meta' && (
                <div className="space-y-2 text-[12px] text-gray-700">
                  <div>
                    <span className="text-gray-500">生成时间：</span>
                    {artifact.metadata.generatedAt}
                  </div>
                  <div>
                    <span className="text-gray-500">版本：</span> v
                    {artifact.metadata.version}
                  </div>
                  <div>
                    <span className="text-gray-500">耗时：</span>
                    {Math.round(artifact.metadata.generationTimeMs / 1000)}s
                  </div>
                  <div>
                    <span className="text-gray-500">Tokens：</span>
                    {artifact.metadata.totalTokens?.total ?? 0}
                  </div>
                  <div>
                    <span className="text-gray-500">成本：</span>$
                    {(artifact.metadata.costCents / 100).toFixed(2)}
                  </div>
                  {artifact.metadata.modelTrail.length > 0 && (
                    <div>
                      <span className="text-gray-500">模型：</span>
                      <span className="font-mono text-[11px]">
                        {artifact.metadata.modelTrail.join(' / ')}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {insightsTab === 'fact' && artifact.factTable.length > 0 && (
                <FactTablePanel
                  factTable={artifact.factTable}
                  citations={artifact.citations}
                />
              )}
              {insightsTab === 'recon' && reconciliationReport && (
                <ReconciliationPanel report={reconciliationReport} />
              )}
              {insightsTab === 'tool' &&
                toolRecallEntries &&
                toolRecallEntries.length > 0 && (
                  <ToolRecallTrace entries={toolRecallEntries} />
                )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ExportMenu({ missionId }: { missionId: string }) {
  const [open, setOpen] = useState(false);
  const handleExport = async (format: string) => {
    setOpen(false);
    try {
      const { config } = await import('@/lib/utils/config');
      const { getAuthHeader } = await import('@/lib/utils/auth');
      const url = `${config.apiBaseUrl}/api/v1/agent-playground/missions/${missionId}/export?format=${format}`;
      const resp = await fetch(url, { headers: getAuthHeader() });
      if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);
      const data = await resp.json();
      const payload = (data?.data ?? data) as {
        filename: string;
        mimeType: string;
        content: string;
      };
      const blob = new Blob([payload.content], { type: payload.mimeType });
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = payload.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('export failed', e);
    }
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
      >
        <Download className="h-3 w-3" />
        导出
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => void handleExport('markdown')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            完整 Markdown
          </button>
          <button
            type="button"
            onClick={() => void handleExport('csv-facts')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            事实表 CSV
          </button>
          <button
            type="button"
            onClick={() => void handleExport('csv-citations')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            引用表 CSV
          </button>
          <button
            type="button"
            onClick={() => void handleExport('json')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            完整 JSON
          </button>
        </div>
      )}
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-violet-100 text-violet-700'
          : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
