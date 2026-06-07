'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart2,
  GitBranch,
  Layers,
  Network,
  Share2,
  Users,
} from 'lucide-react';
import KnowledgeGraphView from '@/components/common/views/KnowledgeGraphView';
import { SectionPanelCard, StatCard } from '@/components/ui/cards';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { ErrorState } from '@/components/ui/states/ErrorState';
import { LoadingState } from '@/components/ui/states/LoadingState';
import { Button } from '@/components/ui/primitives/button';
import {
  getMissionGraph,
  buildMissionGraph,
} from '@/services/agent-playground/api';
import type {
  MissionGraphArtifact,
  Analyses,
  MissionGraph,
} from '@/services/agent-playground/graph-types';

interface MissionGraphTabProps {
  missionId: string;
}

export function MissionGraphTab({ missionId }: MissionGraphTabProps) {
  const [artifact, setArtifact] = useState<MissionGraphArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMissionGraph(missionId);
      setArtifact(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => {
    void fetchGraph();
  }, [fetchGraph]);

  const handleBuild = useCallback(async () => {
    setBuilding(true);
    setError(null);
    try {
      const result = await buildMissionGraph(missionId);
      setArtifact(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBuilding(false);
    }
  }, [missionId]);

  if (loading) {
    return <LoadingState text="加载图谱数据..." />;
  }

  if (error && !artifact) {
    return (
      <ErrorState
        error={error}
        title="图谱加载失败"
        onRetry={() => void fetchGraph()}
      />
    );
  }

  // Not yet built or status is NONE/FAILED
  const status = artifact?.status;
  if (!artifact || status === 'NONE' || status === 'FAILED') {
    return (
      <EmptyState
        type="noData"
        title={status === 'FAILED' ? '图谱生成失败' : '尚未生成图谱分析'}
        description={
          status === 'FAILED'
            ? '上次生成遇到问题，可尝试重新生成'
            : '对 Mission 报告进行实体抽取与关系图谱分析'
        }
        action={
          building ? (
            <LoadingState text="图谱生成中，请稍候..." size="sm" />
          ) : (
            <Button onClick={() => void handleBuild()}>
              <Network className="mr-2 h-4 w-4" />
              生成图谱分析
            </Button>
          )
        }
      />
    );
  }

  if (status === 'BUILDING') {
    return <LoadingState text="图谱构建中，请稍候..." />;
  }

  // READY — render full graph + analyses panels
  const graph = artifact.graph as MissionGraph;
  const analyses = artifact.analyses as Analyses;

  // Map contract GraphNode -> KnowledgeGraphView GraphNode (add required properties:{})
  const viewNodes = graph.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    properties: {},
  }));

  // Map contract GraphEdge -> KnowledgeGraphView GraphLink
  const viewEdges = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
    ...(e.weight != null ? { weight: e.weight } : {}),
  }));

  return (
    <div className="space-y-6">
      {/* Graph stats summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="节点总数"
          value={graph.stats.totalNodes}
          icon={<Network className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="关系总数"
          value={graph.stats.totalEdges}
          icon={<Share2 className="h-5 w-5" />}
          tone="violet"
        />
        <StatCard
          label="关键节点"
          value={analyses.keyNodes.items.length}
          icon={<BarChart2 className="h-5 w-5" />}
          tone="emerald"
        />
        <StatCard
          label="社区数量"
          value={analyses.community.communities.length}
          icon={<Users className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      {/* Knowledge graph visualization */}
      <SectionPanelCard
        title="知识图谱"
        icon={<Network className="h-4 w-4" />}
        accent="blue"
      >
        <div className="h-[480px] w-full">
          <KnowledgeGraphView
            nodes={viewNodes}
            edges={viewEdges}
            defaultLayout="force"
          />
        </div>
      </SectionPanelCard>

      {/* Five analysis panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 关键节点 */}
        <SectionPanelCard
          title="关键节点"
          icon={<BarChart2 className="h-4 w-4" />}
          accent="blue"
        >
          <div className="space-y-3 p-4">
            <p className="text-sm text-gray-600">{analyses.keyNodes.summary}</p>
            {analyses.keyNodes.items.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {analyses.keyNodes.items.slice(0, 8).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="mr-2 flex-1 truncate font-medium text-gray-800">
                      {item.label}
                    </span>
                    <span className="flex-shrink-0 text-xs text-gray-500">
                      度: {item.degree} · 得分: {item.score.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionPanelCard>

        {/* 关联性 */}
        <SectionPanelCard
          title="关联性"
          icon={<Share2 className="h-4 w-4" />}
          accent="violet"
        >
          <div className="space-y-3 p-4">
            <p className="text-sm text-gray-600">
              {analyses.relatedness.summary}
            </p>
            {analyses.relatedness.pairs.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {analyses.relatedness.pairs.slice(0, 6).map((pair, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="mr-2 flex-1 truncate text-gray-800">
                      {pair.a} <span className="text-gray-400">—</span> {pair.b}
                    </span>
                    <span className="flex-shrink-0 text-xs text-gray-500">
                      强度: {pair.strength.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionPanelCard>

        {/* 竞争格局 */}
        <SectionPanelCard
          title="竞争格局"
          icon={<GitBranch className="h-4 w-4" />}
          accent="orange"
        >
          <div className="space-y-3 p-4">
            <p className="text-sm text-gray-600">
              {analyses.competitive.summary}
            </p>
            {analyses.competitive.clusters.length > 0 && (
              <ul className="space-y-2">
                {analyses.competitive.clusters.map((cluster, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-gray-700">
                      阵营 {i + 1}：
                    </span>
                    <span className="text-gray-600">
                      {cluster.members.join('、')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionPanelCard>

        {/* 集群社区 */}
        <SectionPanelCard
          title="集群社区"
          icon={<Users className="h-4 w-4" />}
          accent="emerald"
        >
          <div className="space-y-3 p-4">
            <p className="text-sm text-gray-600">
              {analyses.community.summary}
            </p>
            {analyses.community.communities.length > 0 && (
              <ul className="space-y-2">
                {analyses.community.communities.slice(0, 5).map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="font-medium text-gray-700">
                      社区 {c.id}：
                    </span>
                    <span className="text-gray-600">
                      {c.members.join('、')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionPanelCard>

        {/* 产业链 */}
        <SectionPanelCard
          title="产业链"
          icon={<Layers className="h-4 w-4" />}
          accent="amber"
          className="lg:col-span-2"
        >
          <div className="space-y-3 p-4">
            <p className="text-sm text-gray-600">
              {analyses.supplyChain.summary}
            </p>
            {analyses.supplyChain.layers.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {analyses.supplyChain.layers
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((layer) => (
                    <div
                      key={layer.order}
                      className="min-w-[120px] rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm"
                    >
                      <div className="mb-1 font-semibold text-amber-800">
                        层级 {layer.order}
                      </div>
                      <div className="text-xs text-amber-700">
                        {layer.members.join('、')}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </SectionPanelCard>
      </div>
    </div>
  );
}
