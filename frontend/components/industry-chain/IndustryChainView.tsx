'use client';

/**
 * 产业链分析视图：拉取 /industry-chain/:id/graph，复用 KnowledgeGraphView（chain 布局）
 * 渲染可点击链路图。点击节点见详情（KnowledgeGraphView 内置右侧面板）。
 * 状态用 canonical LoadingState / ErrorState / EmptyState（标准 22）。
 */

import { useEffect, useState, useCallback } from 'react';
import KnowledgeGraphView from '@/components/common/views/KnowledgeGraphView';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { industryChainApi } from '@/services/industry-chain/api';
import type { ChainGraph } from '@/services/industry-chain/types';

interface Props {
  chainId: string;
}

export default function IndustryChainView({ chainId }: Props) {
  const [graph, setGraph] = useState<ChainGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await industryChainApi.getGraph(chainId);
      setGraph(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('加载产业链图谱失败'));
    } finally {
      setLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <LoadingState text="正在加载产业链图谱…" fullScreen />;
  }
  if (error) {
    return <ErrorState error={error} onRetry={() => void load()} />;
  }
  if (!graph || graph.nodes.length === 0) {
    return (
      <EmptyState
        title="产业链尚无数据"
        description="分析可能仍在进行中，或本产业链未抽取到参与者。稍后重试。"
        action={{ label: '刷新', onClick: () => void load() }}
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
        title="产业链分析"
      />
    </div>
  );
}
