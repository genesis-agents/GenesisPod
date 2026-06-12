'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Compass,
  GitBranch,
  Inbox,
  Lightbulb,
  ListChecks,
  Table2,
} from 'lucide-react';
import { Tabs } from '@/components/ui/tabs/Tabs';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { LoadingState } from '@/components/ui/states/LoadingState';
import {
  fetchOverview,
  injectSignal,
  resolveReview,
  seedDemo,
  type ForesightOverview,
  type ForesightSignal,
} from '@/services/foresight/api';
import { pendingByCard } from './foresight-meta';
import { GraphCanvas } from './GraphCanvas';
import { CardDetailPanel } from './CardDetailPanel';
import { WorkbenchTab } from './WorkbenchTab';
import { ReviewTab } from './ReviewTab';
import { ConclusionsTab } from './ConclusionsTab';
import { LibraryTab } from './LibraryTab';

/**
 * AI 前瞻主视图 —— 判断资产 / 假设图谱。
 * Tab IA 按 Owner 一日巡检动线：工作台 → 判断图谱 → 假设库 → 复核 → 洞察结论。
 */
export function ForesightView() {
  const [overview, setOverview] = useState<ForesightOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('workbench');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [injecting, setInjecting] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchOverview();
      setOverview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(
    () => pendingByCard(overview?.reviewItems ?? []),
    [overview]
  );

  const impactedConclusions = useMemo(() => {
    if (!overview) return [];
    const pendingKeys = new Set(
      overview.cards.filter((c) => pending.has(c.id)).map((c) => c.cardKey)
    );
    return overview.conclusions.filter((cc) =>
      cc.upstreamKeys.some((k) => pendingKeys.has(k))
    );
  }, [overview, pending]);

  const impactedKeys = useMemo(
    () => new Set(impactedConclusions.map((c) => c.conclKey)),
    [impactedConclusions]
  );

  const pendingCount = useMemo(
    () =>
      (overview?.reviewItems ?? []).filter((r) => r.status === 'pending')
        .length,
    [overview]
  );

  const selectCard = useCallback((cardId: string) => {
    setSelectedId(cardId);
    setTab('graph');
  }, []);

  const selectCardKey = useCallback(
    (cardKey: string) => {
      const card = overview?.cards.find((c) => c.cardKey === cardKey);
      if (card) selectCard(card.id);
    },
    [overview, selectCard]
  );

  const handleInject = useCallback(
    async (signal: ForesightSignal) => {
      setInjecting(signal.id);
      try {
        await injectSignal(signal.id);
        await load();
        setTab('graph');
        const target = overview?.cards.find(
          (c) => c.id === signal.targetCardId
        );
        if (target) setSelectedId(target.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setInjecting(null);
      }
    },
    [load, overview]
  );

  const handleResolve = useCallback(
    async (itemId: string, decision: 'adjust' | 'keep') => {
      setResolving(itemId);
      try {
        await resolveReview(itemId, decision);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setResolving(null);
      }
    },
    [load]
  );

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      await seedDemo();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  }, [load]);

  if (loading) {
    return <LoadingState text="加载判断资产…" className="min-h-96" />;
  }

  if (!overview || overview.cards.length === 0) {
    return (
      <div className="flex min-h-96 items-center justify-center p-8">
        <EmptyState
          icon={<Compass className="h-12 w-12" />}
          title="AI 前瞻 · 判断资产"
          description={
            error ??
            '把洞察沉淀为可持续检验的假设图谱：信号驱动复核，跨层影响衰减传播。从示例判断资产开始体验。'
          }
          action={{
            label: seeding ? '初始化中…' : '载入示例判断资产（下一代算力底座）',
            onClick: () => void handleSeed(),
          }}
        />
      </div>
    );
  }

  const selectedCard = overview.cards.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-amber-700">
            Foresight · Assumption Graph
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            AI 前瞻 · 判断资产
          </h1>
        </div>
        <div className="font-mono flex gap-4 text-xs text-gray-500">
          <span>
            假设 <b className="text-gray-900">{overview.cards.length}</b>
          </span>
          <span>
            影响边 <b className="text-gray-900">{overview.edges.length}</b>
          </span>
          <span>
            待复核{' '}
            <b
              className={pendingCount > 0 ? 'text-amber-600' : 'text-gray-900'}
            >
              {pendingCount}
            </b>
          </span>
        </div>
      </div>

      {error && (
        <p className="mb-3 border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-5 border-b border-gray-200"
        items={[
          { key: 'workbench', label: '工作台', icon: Inbox },
          { key: 'graph', label: '判断图谱', icon: GitBranch },
          { key: 'library', label: '假设库', icon: Table2 },
          {
            key: 'review',
            label: '复核',
            icon: ListChecks,
            count: pendingCount > 0 ? pendingCount : undefined,
          },
          { key: 'conclusions', label: '洞察结论', icon: Lightbulb },
        ]}
      />

      {tab === 'workbench' && (
        <WorkbenchTab
          overview={overview}
          pending={pending}
          impactedConclusions={impactedConclusions}
          injecting={injecting}
          onInject={(s) => void handleInject(s)}
          onGoTab={setTab}
          onSelectCard={selectCard}
        />
      )}

      {tab === 'graph' && (
        <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
          <div className="min-w-0">
            <p className="font-mono mb-2 text-xs text-gray-400">
              边粗细 = 传导强度 · 点击卡片查看血缘与详情 ·
              传播冲击度沿边权连乘衰减（阈值 0.30）
            </p>
            <GraphCanvas
              cards={overview.cards}
              edges={overview.edges}
              pending={pending}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
          <aside className="xl:sticky xl:top-4 xl:max-h-screen xl:overflow-y-auto">
            <div className="border border-gray-300 bg-white p-4 shadow-sm">
              {selectedCard ? (
                <CardDetailPanel
                  card={selectedCard}
                  cards={overview.cards}
                  edges={overview.edges}
                  onSelect={setSelectedId}
                />
              ) : (
                <EmptyState
                  size="sm"
                  title="点击图谱中任意假设卡片"
                  description="查看完整断言 / 信源 / 证伪信号 / 情景 / 账本 / 上下游血缘"
                />
              )}
            </div>
          </aside>
        </div>
      )}

      {tab === 'library' && (
        <LibraryTab
          overview={overview}
          pending={pending}
          onSelectCard={selectCard}
        />
      )}

      {tab === 'review' && (
        <ReviewTab
          overview={overview}
          resolving={resolving}
          onResolve={(id, d) => void handleResolve(id, d)}
          onSelectCard={selectCard}
        />
      )}

      {tab === 'conclusions' && (
        <ConclusionsTab
          overview={overview}
          impactedKeys={impactedKeys}
          onSelectCardKey={selectCardKey}
        />
      )}
    </div>
  );
}
