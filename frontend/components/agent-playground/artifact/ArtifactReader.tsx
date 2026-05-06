'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BookmarkCheck,
  Calendar,
  Clock,
  Coins,
  Cpu,
  Database,
  Download,
  FileText,
  GitCompareArrows,
  ImageIcon,
  Info,
  Layers,
  List,
  RefreshCw,
  Sparkles,
  Timer,
  X as XIcon,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReportArtifact } from '@/lib/agent-playground/report-artifact.types';
import type { DimensionPipelineState } from '@/lib/agent-playground/derive';
import { ContinuousReader } from './ContinuousReader';
import { ChapterReader } from './ChapterReader';
import { QuickReader } from './QuickReader';
import { QualityBadge } from './QualityBadge';
import { FactTablePanel } from './FactTablePanel';
import { ReconciliationPanel } from './ReconciliationPanel';
import { ToolRecallTrace } from './ToolRecallTrace';

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
  /**
   * ★ 2026-05-06: 报告版本列表（含当前选中 + 切换回调）。
   * 父组件（page）维护 list + currentVersion，切换时用 getReportVersion
   * 拉新版本 reportFull 替换 artifact prop。
   * undefined = 没接版本切换；2+ 版本时 MetaTabBody 显示下拉。
   */
  reportVersions?: ReportVersionMeta[];
  currentVersion?: number;
  onSelectVersion?: (version: number) => void;
  versionSwitching?: boolean;
}

export interface ReportVersionMeta {
  version: number;
  versionLabel: string | null;
  triggerType: string;
  generatedAt: string;
  finalScore: number | null;
  leaderSigned: boolean | null;
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
  reportVersions,
  currentVersion,
  onSelectVersion,
  versionSwitching,
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
          // 'done' / 'failed-finalized' / 'passed' / 'failed' 已落地，不进修订列表
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
          <div className="fixed right-0 top-0 z-50 flex h-full w-[480px] max-w-[92vw] flex-col border-l border-gray-200 bg-white shadow-2xl">
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
                <QualityTabBody artifact={artifact} />
              )}
              {insightsTab === 'meta' && (
                <MetaTabBody
                  artifact={artifact}
                  reportVersions={reportVersions}
                  currentVersion={currentVersion}
                  onSelectVersion={onSelectVersion}
                  versionSwitching={versionSwitching}
                />
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

/**
 * ★ 2026-05-02 (#7 报告下载对齐 TI 公共能力 —— 真·公共能力)
 *
 * playground 不再有专属导出端点。统一走 TI 同款的：
 *   - useExport.exportMission(missionId, '', format) → POST /api/export
 *   - useExport.downloadExport(jobId) → GET /api/export/:jobId/download
 * 后端 MissionTransformerService.transform 已扩展同时识别 AgentPlaygroundMission
 * 与 TeamMission，前端无需关心是哪类 mission。
 *
 * 旧的 sync 导出（Markdown/CSV/JSON）保留 —— 这是 playground 独有的
 * "原始数据"路径，TI 没有对等能力，故保留 GET 端点向后兼容。
 */
function ExportMenu({ missionId }: { missionId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // 同步导出 —— playground 独有的"原始数据"通道（Markdown/CSV/JSON 即取即用）
  const handleSyncExport = async (format: string) => {
    setOpen(false);
    setBusy(format);
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
    } finally {
      setBusy(null);
    }
  };

  // 异步导出 —— 公共能力（PDF / DOCX / PPTX / HTML）
  // 使用 useExport hook 的同款 API：exportMission(missionId, '', format) + downloadExport(jobId)
  const handleAsyncExport = async (
    format: 'PDF' | 'DOCX' | 'PPTX' | 'HTML'
  ) => {
    setOpen(false);
    setBusy(format);
    try {
      // useExport hook 是组件内的；这里在事件回调里直接调公共 /api/export 端点，
      // 走与 useExport 完全一致的请求路径（POST → poll → download blob）。
      const { apiClient } = await import('@/lib/api/client');
      const { config } = await import('@/lib/utils/config');
      const { getAuthHeader } = await import('@/lib/utils/auth');

      // ★ 2026-05-06 #84: 删除 templateId — backend export_templates 表当前为空
      //   （未 seed 'mission-report'），传 templateId 会被校验拒绝抛 400 "Invalid
      //   export template: mission-report"。让 backend 走默认渲染逻辑（templateId
      //   是 optional 字段，没传时直接跳过 templateManager.getTemplate）。
      // 1. POST /api/export 创建 job（公共端点 —— TI 同款）
      const job = await apiClient.post<{ jobId: string }>('/export', {
        source: { type: 'MISSION', missionId, topicId: '' },
        format,
        options: {
          includeCover: true,
          includeTableOfContents: true,
        },
      });
      const jobId = job.jobId;

      // 2. 轮询 GET /api/export/:jobId（公共端点）
      type JobStatus = {
        status: string;
        downloadUrl?: string;
        fileName?: string;
        error?: string;
      };
      let result: JobStatus | null = null;
      for (let i = 0; i < 120; i++) {
        result = await apiClient.get<JobStatus>(`/export/${jobId}`);
        if (result.status === 'COMPLETED') break;
        if (result.status === 'FAILED') {
          throw new Error(result.error || 'Export job failed');
        }
        await new Promise((res) => setTimeout(res, 1000));
      }
      if (!result || result.status !== 'COMPLETED') {
        throw new Error('Export timeout');
      }

      // 3. GET /api/export/:jobId/download（公共端点）
      const downloadResp = await fetch(
        `${config.apiBaseUrl}/api/v1/export/${jobId}/download`,
        { headers: getAuthHeader() }
      );
      if (!downloadResp.ok) throw new Error('Download failed');
      const blob = await downloadResp.blob();
      const cd = downloadResp.headers.get('Content-Disposition') || '';
      let fileName =
        result.fileName || `mission-${missionId}.${format.toLowerCase()}`;
      const rfc5987 = cd.match(/filename\*=UTF-8''(.+?)(?:;|$)/i);
      if (rfc5987) {
        fileName = decodeURIComponent(rfc5987[1]);
      } else {
        const std = cd.match(/filename="?([^";]+)"?/);
        if (std) fileName = std[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('async export failed', e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy != null}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Download className="h-3 w-3" />
        {busy ? `导出中…(${busy})` : '导出'}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {/* 异步导出 —— TI 同款公共能力 */}
          <div className="border-b border-gray-100 px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400">
            报告（PDF / Office）
          </div>
          <button
            type="button"
            onClick={() => void handleAsyncExport('PDF')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => void handleAsyncExport('DOCX')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            Word (DOCX)
          </button>
          <button
            type="button"
            onClick={() => void handleAsyncExport('PPTX')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            PPT (PPTX)
          </button>
          <button
            type="button"
            onClick={() => void handleAsyncExport('HTML')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            HTML
          </button>

          {/* 同步导出 —— playground 独有的原始数据通道 */}
          <div className="mt-1 border-y border-gray-100 px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400">
            原始数据
          </div>
          <button
            type="button"
            onClick={() => void handleSyncExport('markdown')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            完整 Markdown
          </button>
          <button
            type="button"
            onClick={() => void handleSyncExport('csv-facts')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            事实表 CSV
          </button>
          <button
            type="button"
            onClick={() => void handleSyncExport('csv-citations')}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
          >
            引用表 CSV
          </button>
          <button
            type="button"
            onClick={() => void handleSyncExport('json')}
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

/* ============================================================
 * 报告分析 slide-over —— 紧凑版面（专为 480px 窄面板设计）
 *   2026-05-06 重构：原来塞了主区域用的 ReportHeroStrip 6-cell grid，
 *   在 sidebar 里挤成一坨。换成单列 stat row + 版本徽章。
 * ============================================================ */

const VERDICT_LABEL: Record<
  string,
  { label: string; tone: string; hint: string }
> = {
  excellent: {
    label: '优秀',
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    hint: '10 维全部达标，可直接交付。',
  },
  good: {
    label: '良好',
    tone: 'bg-blue-50 text-blue-700 ring-blue-200',
    hint: '主要维度通过，少量提醒可酌情处理。',
  },
  acceptable: {
    label: '合格',
    tone: 'bg-amber-50 text-amber-700 ring-amber-200',
    hint: '基本可用，建议针对弱项补强后再交付。',
  },
  poor: {
    label: '不达标',
    tone: 'bg-red-50 text-red-700 ring-red-200',
    hint: '存在硬卡违规或严重弱项，建议 rerun。',
  },
};

function QualityTabBody({ artifact }: { artifact: ReportArtifact }) {
  const verdict = artifact.quality.finalVerdict;
  const v = verdict ? VERDICT_LABEL[verdict] : undefined;
  return (
    <div className="space-y-3">
      {v && (
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] ring-1 ${v.tone}`}
        >
          <span className="mt-0.5 inline-flex h-5 items-center rounded px-1.5 text-[11px] font-semibold">
            {v.label}
          </span>
          <span className="leading-relaxed">{v.hint}</span>
        </div>
      )}
      <QualityBadge quality={artifact.quality} defaultOpen />
    </div>
  );
}

const TRIGGER_LABEL: Record<string, string> = {
  initial: '首次生成',
  'rerun-fresh': '全量重跑',
  'rerun-incremental': '增量重跑',
  'todo-rerun': 'Todo 修订',
};

function MetaTabBody({
  artifact,
  reportVersions,
  currentVersion,
  onSelectVersion,
  versionSwitching,
}: {
  artifact: ReportArtifact;
  reportVersions?: ReportVersionMeta[];
  currentVersion?: number;
  onSelectVersion?: (v: number) => void;
  versionSwitching?: boolean;
}) {
  const m = artifact.metadata;
  // 2+ 版本时显示下拉；只有 1 个 / 0 个时仅展示当前版本徽章
  const hasMultipleVersions =
    !!reportVersions && reportVersions.length >= 2 && !!onSelectVersion;
  const selectedVersion = currentVersion ?? m.version;
  const generatedAt = (() => {
    try {
      const d = new Date(m.generatedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return m.generatedAt;
    }
  })();
  const tokens = m.totalTokens.total;
  const cost = (m.costCents / 100).toFixed(2);
  const seconds = Math.round(m.generationTimeMs / 1000);
  const wordValue =
    m.wordCount >= 1000
      ? `${(m.wordCount / 1000).toFixed(1)}k`
      : String(m.wordCount);

  // changesFromPrev 来自 ReportArtifact metadata（有的话），不是来自 mission_report_versions 表
  const changeCount = m.changesFromPrev?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* 版本头部条 */}
      <div className="rounded-lg border border-gray-200 bg-gradient-to-r from-violet-50/40 to-sky-50/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono inline-flex items-center rounded-md bg-violet-100 px-2 py-0.5 text-[12px] font-bold text-violet-800">
            v{selectedVersion}
          </span>
          {m.versionLabel && (
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10.5px] text-gray-700">
              {m.versionLabel}
            </span>
          )}
          {m.isIncremental && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700">
              <GitCompareArrows className="h-2.5 w-2.5" />
              增量
            </span>
          )}
          {changeCount > 0 && (
            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10.5px] text-amber-800">
              vs 前一版：{changeCount} 处变更
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[12px] font-medium text-gray-800">
          {m.topic}
        </p>

        {hasMultipleVersions ? (
          <div className="mt-2 flex items-center gap-2">
            <label
              htmlFor="report-version-select"
              className="text-[11px] text-gray-500"
            >
              切换版本：
            </label>
            <select
              id="report-version-select"
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:bg-gray-50 disabled:text-gray-400"
              value={selectedVersion}
              disabled={!!versionSwitching}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(next) && next !== selectedVersion) {
                  onSelectVersion?.(next);
                }
              }}
            >
              {reportVersions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                  {v.versionLabel ? ` · ${v.versionLabel}` : ''}
                  {v.finalScore != null ? ` · ${v.finalScore} 分` : ''}
                </option>
              ))}
            </select>
            {versionSwitching && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-violet-500" />
            )}
          </div>
        ) : (
          <p className="mt-0.5 text-[11px] text-gray-500">
            {reportVersions && reportVersions.length === 1
              ? '当前是首次生成版本，rerun 后会出现版本切换器'
              : '版本历史'}
          </p>
        )}
      </div>

      {/* 内容统计 */}
      <StatGroup title="内容统计">
        <StatRow Icon={FileText} label="总字数" value={wordValue} />
        <StatRow
          Icon={Layers}
          label="章节数"
          value={artifact.sections.length}
        />
        <StatRow Icon={BookmarkCheck} label="引用源" value={m.sourceCount} />
        <StatRow Icon={ImageIcon} label="图表" value={m.figureCount} />
        <StatRow Icon={Database} label="事实条目" value={m.factCount} />
        <StatRow
          Icon={Clock}
          label="阅读时长"
          value={`${m.readingTimeMinutes} 分钟`}
        />
        <StatRow
          Icon={Sparkles}
          label="研究维度"
          value={m.dimensionCount || '—'}
        />
      </StatGroup>

      {/* 生成元数据 */}
      <StatGroup title="生成元数据">
        <StatRow Icon={Calendar} label="生成时间" value={generatedAt} />
        <StatRow Icon={Timer} label="耗时" value={`${seconds}s`} />
        <StatRow Icon={Zap} label="Tokens" value={tokens.toLocaleString()} />
        <StatRow Icon={Coins} label="成本" value={`$${cost}`} />
        {m.modelTrail.length > 0 && (
          <StatRow
            Icon={Cpu}
            label="模型链路"
            value={
              <span
                className="font-mono text-[11px] text-gray-700"
                title={m.modelTrail.join(', ')}
              >
                {m.modelTrail.length <= 3
                  ? m.modelTrail.join(' › ')
                  : `${m.modelTrail.slice(0, 3).join(' › ')} +${m.modelTrail.length - 3}`}
              </span>
            }
          />
        )}
      </StatGroup>

      {/* 配置画像 */}
      <StatGroup title="配置画像">
        <StatRow label="风格" value={m.styleProfile} />
        <StatRow label="长度" value={m.lengthProfile} />
        <StatRow label="受众" value={m.audienceProfile} />
        <StatRow label="语言" value={m.language} />
      </StatGroup>

      {/* triggerType 不在 ArtifactMetadata 内，但 versionLabel 可能含线索；仅当显式标 trigger 才显示 */}
      {m.versionLabel && TRIGGER_LABEL[m.versionLabel] && (
        <p className="text-[11px] text-gray-500">
          触发类型：{TRIGGER_LABEL[m.versionLabel]}
        </p>
      )}
    </div>
  );
}

function StatGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </p>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {children}
      </div>
    </div>
  );
}

function StatRow({
  Icon,
  label,
  value,
}: {
  Icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
      <span className="flex items-center gap-2 text-gray-500">
        {Icon && (
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-600 ring-1 ring-violet-100">
            <Icon className="h-3 w-3" />
          </span>
        )}
        {label}
      </span>
      <span className="truncate text-right font-medium text-gray-900">
        {value}
      </span>
    </div>
  );
}
