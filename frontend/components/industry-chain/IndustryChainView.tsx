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
import {
  Network,
  LineChart,
  Activity,
  FileText,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import KnowledgeGraphView from '@/components/common/views/KnowledgeGraphView';
import { SideDrawer } from '@/components/common/drawers/SideDrawer';
import { SectionPanelCard, StatCard } from '@/components/ui/cards';
import { CitationListItem } from '@/components/common/citations';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { industryChainApi } from '@/services/industry-chain/api';
import type {
  ChainGraph,
  EntityFinance,
  EntityInvestment,
  IndustryChain,
  IndustryEntityDetail,
} from '@/services/industry-chain/types';
import { logger } from '@/lib/utils/logger';

/** 迷你走势图（series 时间正序，左旧右新）。涨绿跌红。 */
function Sparkline({ series }: { series: Array<{ close: number }> }) {
  const closes = series.map((p) => p.close);
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const w = 200;
  const h = 40;
  const pts = closes
    .map(
      (c, i) =>
        `${(i / (closes.length - 1)) * w},${h - ((c - min) / range) * h}`
    )
    .join(' ');
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-1 h-10 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke={up ? '#10b981' : '#ef4444'}
        strokeWidth={1.5}
      />
    </svg>
  );
}

interface Props {
  chainId: string;
}

/** 图谱节点的最小读取形（KnowledgeGraphView 的 GraphNode 子集，用于详情抽屉）。 */
interface ChainNode {
  id: string;
  label: string;
  type: string;
  properties?: { segment?: string | null; companyType?: string | null };
}

/** 企业类型 → 中文标签 + 画布颜色（节点着色 + 图例 + 抽屉徽章共用）。 */
const COMPANY_TYPE_META: Record<string, { label: string; color: string }> = {
  LISTED_US: { label: '美股上市', color: '#3b82f6' },
  LISTED_OTHER: { label: '非美上市', color: '#06b6d4' },
  STARTUP: { label: '初创', color: '#f59e0b' },
  STATE_OWNED: { label: '国企', color: '#ef4444' },
  PRIVATE: { label: '私营', color: '#8b5cf6' },
  OTHER: { label: '其他', color: '#94a3b8' },
};

/**
 * 节点详情：按 entityId 拉 getEntity，展示公司/环节档案（描述 / CIK / SEC 来源链接）。
 * 渲染在节点详情 SideDrawer 内（key=entityId 切换即重拉）。
 */
function ChainEntityDetail({
  entityId,
  connections,
}: {
  entityId: string;
  connections: number;
}) {
  const { t } = useTranslation();
  const [entity, setEntity] = useState<IndustryEntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [finance, setFinance] = useState<EntityFinance | null>(null);
  const [investment, setInvestment] = useState<EntityInvestment | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

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

  // 行情 + 资本动态（实时数据，仅公司类）。refreshKey 变化 → 手动刷新重拉。
  useEffect(() => {
    if (
      !entity ||
      (entity.type !== 'COMPANY' && entity.type !== 'PRODUCT') ||
      !entity.cik
    ) {
      setFinance(null);
      setInvestment(null);
      return;
    }
    let alive = true;
    if (refreshKey > 0) setRefreshing(true);
    void Promise.allSettled([
      industryChainApi.getEntityFinance(entity.id).then((f) => {
        if (alive) setFinance(f);
      }),
      industryChainApi.getEntityInvestment(entity.id).then((inv) => {
        if (alive) setInvestment(inv);
      }),
    ]).finally(() => {
      if (alive) setRefreshing(false);
    });
    return () => {
      alive = false;
    };
  }, [entity, refreshKey]);

  if (loading) {
    return <p className="px-1 py-2 text-sm text-gray-400">加载详情…</p>;
  }
  if (loadError) {
    return <p className="px-1 py-2 text-sm text-red-600">{loadError}</p>;
  }
  if (!entity) return null;

  // SEC 来源按日期倒序（最新在上）
  const refs = [...(entity.sourceRefs ?? [])].sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? '')
  );
  const isCompany = entity.type === 'COMPANY' || entity.type === 'PRODUCT';
  const typeLabel =
    entity.type === 'SEGMENT'
      ? t('industryChain.typeSegment')
      : entity.type === 'COMPANY'
        ? t('industryChain.typeCompany')
        : entity.type === 'PRODUCT'
          ? t('industryChain.typeProduct')
          : entity.type;
  const q = (s: string) => encodeURIComponent(s);
  // 深链入口（零依赖）：财报走 SEC EDGAR 公司页（需 CIK），股价/融资走搜索（覆盖非美/未上市）。
  const deepLinks: Array<{ label: string; href: string }> = [];
  if (entity.cik) {
    deepLinks.push({
      label: 'SEC 财报',
      href: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${entity.cik}&type=&dateb=&owner=include&count=40`,
    });
  }
  if (isCompany) {
    deepLinks.push({
      label: '股价 / 行情',
      href: `https://www.google.com/search?q=${q(entity.name + ' 股价 行情')}`,
    });
    deepLinks.push({
      label: '融资 / 投资动态',
      href: `https://www.google.com/search?q=${q(entity.name + ' 融资 投资')}`,
    });
  }
  const up = (finance?.change ?? 0) >= 0;

  return (
    <div className="space-y-4">
      {/* 概览 */}
      <SectionPanelCard
        title="概览"
        accent="emerald"
        titleSize="sm"
        icon={<Network className="h-4 w-4 text-white" aria-hidden />}
        actions={
          isCompany ? (
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={refreshing}
              title="刷新实时数据（股价 / 资本动态）"
              aria-label="刷新实时数据"
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden
              />
            </button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={t('industryChain.connections')}
            value={connections}
            tone="emerald"
            icon={<Network className="h-5 w-5" aria-hidden />}
          />
          <StatCard label="类型" value={typeLabel} tone="slate" />
        </div>
        {isCompany &&
          entity.companyType &&
          COMPANY_TYPE_META[entity.companyType] && (
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      COMPANY_TYPE_META[entity.companyType].color,
                  }}
                />
                {COMPANY_TYPE_META[entity.companyType].label}
              </span>
            </div>
          )}
        {entity.segment && (
          <div className="mt-3 text-xs text-gray-500">
            所属环节：<span className="text-gray-700">{entity.segment}</span>
          </div>
        )}
        {entity.cik && (
          <div className="mt-1 text-xs text-gray-500">
            CIK：<span className="font-mono text-gray-700">{entity.cik}</span>
          </div>
        )}
        {entity.description && (
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            {entity.description}
          </p>
        )}
      </SectionPanelCard>

      {/* 行情 */}
      {finance?.available && (
        <SectionPanelCard
          title="行情"
          subtitle={finance.ticker ?? undefined}
          accent="blue"
          titleSize="sm"
          icon={<LineChart className="h-4 w-4 text-white" aria-hidden />}
        >
          <div className="grid grid-cols-2 gap-3">
            {finance.price !== undefined && (
              <StatCard
                label="现价"
                value={finance.price.toFixed(2)}
                tone="blue"
              />
            )}
            {finance.changePercent && (
              <StatCard
                label="涨跌幅"
                value={finance.changePercent}
                tone={up ? 'emerald' : 'red'}
                trend={{ direction: up ? 'up' : 'down' }}
              />
            )}
          </div>
          {finance.series && finance.series.length > 1 && (
            <Sparkline series={finance.series} />
          )}
        </SectionPanelCard>
      )}

      {/* 资本动态 */}
      {investment?.available && investment.items.length > 0 && (
        <SectionPanelCard
          title="资本动态"
          subtitle="来自 SEC 备案"
          accent="amber"
          titleSize="sm"
          icon={<Activity className="h-4 w-4 text-white" aria-hidden />}
        >
          <div className="space-y-2">
            {investment.items.map((it, i) => (
              <CitationListItem
                key={(it.form || '') + (it.date || '') + i}
                title={it.label}
                href={it.url || undefined}
                meta={`${it.date}${it.form ? ` · ${it.form}` : ''}`}
              />
            ))}
          </div>
        </SectionPanelCard>
      )}

      {/* SEC 备案来源 */}
      {refs.length > 0 && (
        <SectionPanelCard
          title="SEC 备案来源"
          accent="gray"
          titleSize="sm"
          icon={<FileText className="h-4 w-4 text-white" aria-hidden />}
        >
          <div className="space-y-2">
            {refs.map((r, i) => (
              <CitationListItem
                key={r.accessionNumber ?? r.url ?? i}
                title={r.reportType || r.accessionNumber || 'SEC filing'}
                href={r.url || undefined}
                meta={r.date}
              />
            ))}
          </div>
        </SectionPanelCard>
      )}

      {/* 外部链接 */}
      {deepLinks.length > 0 && (
        <SectionPanelCard
          title="外部链接"
          accent="gray"
          titleSize="sm"
          icon={<ExternalLink className="h-4 w-4 text-white" aria-hidden />}
        >
          <div className="flex flex-wrap gap-2">
            {deepLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 transition-colors hover:border-emerald-400 hover:text-emerald-700"
              >
                {l.label}
              </a>
            ))}
          </div>
        </SectionPanelCard>
      )}
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
  const [drawerNode, setDrawerNode] = useState<ChainNode | null>(null);
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
    properties: {
      name: n.label,
      segment: n.segment ?? undefined,
      companyType: n.companyType ?? undefined,
    },
  }));
  const edges = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
  }));

  const drawerConnections = drawerNode
    ? graph.edges.filter(
        (e) => e.source === drawerNode.id || e.target === drawerNode.id
      ).length
    : 0;

  // 图例：仅列出本图实际出现的企业类型
  const presentTypes = Array.from(
    new Set(
      graph.nodes
        .filter((n) => n.type === 'COMPANY' && n.companyType)
        .map((n) => n.companyType as string)
    )
  ).filter((k) => COMPANY_TYPE_META[k]);

  return (
    <div className="relative h-full">
      <KnowledgeGraphView
        nodes={nodes}
        edges={edges}
        defaultLayout="chain"
        title={t('industryChain.title')}
        onNodeSelect={setDrawerNode}
        nodeColor={(node) =>
          node.type === 'COMPANY'
            ? COMPANY_TYPE_META[node.properties?.companyType ?? '']?.color
            : undefined
        }
      />

      {presentTypes.length > 0 && (
        <div className="absolute left-4 top-20 z-10 flex flex-col gap-1 rounded-lg bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
          <span className="mb-0.5 font-medium text-gray-500">企业类型</span>
          {presentTypes.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 text-gray-600"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: COMPANY_TYPE_META[k].color }}
              />
              {COMPANY_TYPE_META[k].label}
            </span>
          ))}
        </div>
      )}

      <SideDrawer
        open={drawerNode !== null}
        onClose={() => setDrawerNode(null)}
        title={drawerNode?.label ?? ''}
      >
        {drawerNode && (
          <ChainEntityDetail
            key={drawerNode.id}
            entityId={drawerNode.id}
            connections={drawerConnections}
          />
        )}
      </SideDrawer>
    </div>
  );
}
