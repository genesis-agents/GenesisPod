'use client';

/**
 * 产业链分析视图。
 *
 * 后端 analyze 是 fire-and-forget 异步编排（status: PLANNING/RUNNING→COMPLETED/FAILED）。
 * 本视图轮询 getChain 看 status：
 *   - RUNNING/PLANNING → 显示「分析进行中」加载态，每 POLL_INTERVAL_MS 轮询一次
 *   - COMPLETED        → 拉 getGraph，复用 KnowledgeGraphView（chain 布局）渲染
 *   - FAILED           → ErrorState
 * 终态停轮询；组件卸载清理定时器（防泄漏 + 重入）。
 * 状态用 canonical LoadingState / ErrorState / EmptyState（标准 22）。
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from '@/lib/i18n';
import KnowledgeGraphView from '@/components/common/views/KnowledgeGraphView';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { industryChainApi } from '@/services/industry-chain/api';
import type {
  ChainGraph,
  IndustryChain,
  IndustryEntityDetail,
} from '@/services/industry-chain/types';
import { logger } from '@/lib/utils/logger';

interface Props {
  chainId: string;
}

/**
 * 节点详情：按 entityId 拉 getEntity，展示公司/环节档案（描述 / CIK / SEC 来源链接）。
 * 作为 renderNodeDetail 注入 KnowledgeGraphView 的领域详情区（key=entityId 切换即重拉）。
 */
function ChainEntityDetail({ entityId }: { entityId: string }) {
  const [entity, setEntity] = useState<IndustryEntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    industryChainApi
      .getEntity(entityId)
      .then((e) => {
        if (alive) setEntity(e);
      })
      .catch((err) => {
        logger.error('[IndustryChain] getEntity failed:', err);
        if (alive) setLoadError('加载详情失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [entityId]);

  if (loading) {
    return <p className="text-xs text-gray-400">加载详情…</p>;
  }
  if (loadError) {
    return <p className="text-xs text-red-600">{loadError}</p>;
  }
  if (!entity) return null;

  const refs = entity.sourceRefs ?? [];
  const hasNoDetail = !entity.description && !entity.cik && refs.length < 1;
  return (
    <div className="space-y-3">
      {entity.description && (
        <p className="text-sm leading-relaxed text-gray-600">
          {entity.description}
        </p>
      )}
      {entity.cik && (
        <div className="text-xs text-gray-500">
          CIK：<span className="font-mono text-gray-700">{entity.cik}</span>
        </div>
      )}
      {refs.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-gray-700">SEC 来源</div>
          <ul className="space-y-1">
            {refs.map((r, i) => (
              <li key={r.accessionNumber ?? r.url ?? i}>
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-600 underline underline-offset-2 hover:text-emerald-700"
                  >
                    {r.reportType || r.accessionNumber || r.url}
                    {r.date ? ` · ${r.date}` : ''}
                  </a>
                ) : (
                  <span className="text-xs text-gray-500">
                    {r.reportType || r.accessionNumber}
                    {r.date ? ` · ${r.date}` : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasNoDetail && <p className="text-xs text-gray-400">暂无更多详情</p>}
    </div>
  );
}

const POLL_INTERVAL_MS = 3000;
const TERMINAL = new Set(['COMPLETED', 'FAILED']);

export default function IndustryChainView({ chainId }: Props) {
  const { t } = useTranslation();
  const [chain, setChain] = useState<IndustryChain | null>(null);
  const [graph, setGraph] = useState<ChainGraph | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const meta = await industryChainApi.getChain(chainId);
      setChain(meta);
      if (!TERMINAL.has(meta.status)) {
        // 仍在分析 → 安排下一次轮询
        timerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        return;
      }
      if (meta.status === 'COMPLETED') {
        setGraph(await industryChainApi.getGraph(chainId));
      }
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error(t('industryChain.loadFailed'))
      );
    }
  }, [chainId, t]);

  useEffect(() => {
    void poll();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  const retry = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setError(null);
    setChain(null);
    setGraph(null);
    void poll();
  }, [poll]);

  if (error) {
    return <ErrorState error={error} onRetry={retry} />;
  }
  if (!chain) {
    return <LoadingState text={t('industryChain.loadingChain')} fullScreen />;
  }
  if (chain.status === 'PLANNING' || chain.status === 'RUNNING') {
    return (
      <LoadingState
        text={`${t('industryChain.analyzingDetail')}（${chain.topic}）`}
        fullScreen
      />
    );
  }
  if (chain.status === 'FAILED') {
    return (
      <ErrorState
        error={new Error(t('industryChain.failedDesc'))}
        onRetry={retry}
      />
    );
  }

  // COMPLETED
  if (!graph || graph.nodes.length === 0) {
    return (
      <EmptyState
        title={t('industryChain.emptyTitle')}
        description={t('industryChain.emptyDesc')}
        action={{ label: t('industryChain.refresh'), onClick: retry }}
      />
    );
  }

  // 映射为 KnowledgeGraphView 的节点/边形态
  const nodes = graph.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    properties: { name: n.label, segment: n.segment ?? undefined },
  }));
  const edges = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
  }));

  return (
    <div className="h-full">
      <KnowledgeGraphView
        nodes={nodes}
        edges={edges}
        defaultLayout="chain"
        title={t('industryChain.title')}
        renderNodeDetail={(node) => (
          <ChainEntityDetail key={node.id} entityId={node.id} />
        )}
      />
    </div>
  );
}
