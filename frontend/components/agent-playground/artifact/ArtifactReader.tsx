'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Download, List, Sparkles } from 'lucide-react';
import type { ReportArtifact } from '@/lib/agent-playground/report-artifact.types';
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
}: Props) {
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
    <div className="space-y-3">
      {/* 报告头部资讯条（标题 / 字数 / 章节 / 引用 / 图表 / 事实 / 阅读时长 / 受众 tags） */}
      <ReportHeroStrip artifact={artifact} />
      {/* 质量评分卡 + 视图切换 */}
      <QualityBadge quality={artifact.quality} />
      <div className="flex items-center justify-between">
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
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] text-gray-500"
            title={[
              `生成于 ${artifact.metadata.generatedAt}`,
              artifact.metadata.modelTrail.length > 0
                ? `模型: ${artifact.metadata.modelTrail.join(', ')}`
                : '',
              `tokens: ${artifact.metadata.totalTokens.total}`,
              `cost: $${(artifact.metadata.costCents / 100).toFixed(2)}`,
            ]
              .filter(Boolean)
              .join('\n')}
          >
            v{artifact.metadata.version} · {artifact.metadata.wordCount} 字 ·{' '}
            {Math.round(artifact.metadata.generationTimeMs / 1000)}s
          </span>
          {missionId && <ExportMenu missionId={missionId} />}
        </div>
      </div>

      {view === 'continuous' && <ContinuousReader artifact={artifact} />}
      {view === 'chapter' && <ChapterReader artifact={artifact} />}
      {view === 'quick' && (
        <QuickReader
          artifact={artifact}
          onSwitchToFull={() => setView('continuous')}
        />
      )}

      {/* 事实表（所有视图都显示，超越 TI 的关键差异化） */}
      {artifact.factTable.length > 0 && (
        <FactTablePanel
          factTable={artifact.factTable}
          citations={artifact.citations}
        />
      )}

      {/* 对账总览（如有 Reconciler [3.5] 产物） */}
      {reconciliationReport && (
        <ReconciliationPanel report={reconciliationReport} />
      )}

      {/* Tool Recall trace（如有运行时事件） */}
      {toolRecallEntries && toolRecallEntries.length > 0 && (
        <ToolRecallTrace entries={toolRecallEntries} />
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
