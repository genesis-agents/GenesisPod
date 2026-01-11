'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  RelationshipGraph,
  RelationshipNode,
  RelationshipEdge,
  getRelationshipGraph,
  addCharacterRelationship,
  deleteCharacterRelationship,
} from '@/lib/api/ai-writing';

interface Props {
  projectId: string;
}

// 角色类型对应的颜色
const ROLE_COLORS: Record<string, string> = {
  PROTAGONIST: '#10B981', // 绿色 - 主角
  ANTAGONIST: '#EF4444', // 红色 - 反派
  SUPPORTING: '#3B82F6', // 蓝色 - 配角
  MINOR: '#9CA3AF', // 灰色 - 龙套
};

// 关系类型对应的颜色
const RELATION_COLORS: Record<string, string> = {
  父子: '#F59E0B',
  母子: '#F59E0B',
  夫妻: '#EC4899',
  恋人: '#EC4899',
  师徒: '#8B5CF6',
  朋友: '#10B981',
  仇敌: '#EF4444',
  同门: '#3B82F6',
  主仆: '#6B7280',
  兄弟: '#F97316',
  姐妹: '#F97316',
  同事: '#06B6D4',
};

// 简单的力导向布局计算
function calculateLayout(
  nodes: RelationshipNode[],
  edges: RelationshipEdge[],
  width: number,
  height: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;

  // 按角色类型分组
  const protagonists = nodes.filter((n) => n.role === 'PROTAGONIST');
  const antagonists = nodes.filter((n) => n.role === 'ANTAGONIST');
  const supporting = nodes.filter((n) => n.role === 'SUPPORTING');
  const minor = nodes.filter((n) => n.role === 'MINOR');

  // 主角放中心
  protagonists.forEach((node, i) => {
    const angle = (i * 2 * Math.PI) / Math.max(protagonists.length, 1);
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius * 0.2,
      y: centerY + Math.sin(angle) * radius * 0.2,
    });
  });

  // 反派放对面
  antagonists.forEach((node, i) => {
    const angle =
      Math.PI + (i * Math.PI) / Math.max(antagonists.length, 1) - Math.PI / 4;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius * 0.8,
      y: centerY + Math.sin(angle) * radius * 0.8,
    });
  });

  // 配角围绕
  supporting.forEach((node, i) => {
    const angle = (i * 2 * Math.PI) / Math.max(supporting.length, 1);
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius * 0.6,
      y: centerY + Math.sin(angle) * radius * 0.6,
    });
  });

  // 龙套外围
  minor.forEach((node, i) => {
    const angle = (i * 2 * Math.PI) / Math.max(minor.length, 1) + Math.PI / 6;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  });

  return positions;
}

export default function CharacterRelationshipGraph({ projectId }: Props) {
  const [graph, setGraph] = useState<RelationshipGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<RelationshipNode | null>(
    null
  );
  const [hoveredEdge, setHoveredEdge] = useState<RelationshipEdge | null>(null);

  // 添加关系的状态
  const [isAddingRelation, setIsAddingRelation] = useState(false);
  const [sourceNode, setSourceNode] = useState<RelationshipNode | null>(null);
  const [relationType, setRelationType] = useState('');
  const [relationDesc, setRelationDesc] = useState('');

  const fetchGraph = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRelationshipGraph(projectId);
      setGraph(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // 计算布局
  const positions = useMemo(() => {
    if (!graph) return new Map();
    return calculateLayout(graph.nodes, graph.edges, 800, 600);
  }, [graph]);

  // 添加关系
  const handleAddRelation = async (targetNode: RelationshipNode) => {
    if (!sourceNode || !relationType) return;

    try {
      await addCharacterRelationship(projectId, sourceNode.id, {
        targetCharacterId: targetNode.id,
        relationshipType: relationType,
        description: relationDesc || undefined,
      });
      setIsAddingRelation(false);
      setSourceNode(null);
      setRelationType('');
      setRelationDesc('');
      fetchGraph();
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加关系失败');
    }
  };

  // 删除关系
  const handleDeleteRelation = async (edge: RelationshipEdge) => {
    if (!confirm(`确定要删除关系"${edge.label}"吗？`)) return;

    try {
      await deleteCharacterRelationship(projectId, edge.id);
      fetchGraph();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除关系失败');
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
        <span className="ml-2 text-gray-400">加载角色关系图谱...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 flex-col items-center justify-center">
        <p className="mb-4 text-red-400">{error}</p>
        <button
          onClick={fetchGraph}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          重试
        </button>
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center text-gray-400">
        <svg
          className="mb-4 h-16 w-16"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <p>暂无角色数据</p>
        <p className="mt-2 text-sm">请先在故事圣经中添加角色</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 工具栏 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium text-white">角色关系图谱</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: ROLE_COLORS.PROTAGONIST }}
              />
              主角
            </span>
            <span className="flex items-center gap-1">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: ROLE_COLORS.ANTAGONIST }}
              />
              反派
            </span>
            <span className="flex items-center gap-1">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: ROLE_COLORS.SUPPORTING }}
              />
              配角
            </span>
            <span className="flex items-center gap-1">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: ROLE_COLORS.MINOR }}
              />
              龙套
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAddingRelation ? (
            <>
              <input
                type="text"
                value={relationType}
                onChange={(e) => setRelationType(e.target.value)}
                placeholder="关系类型（如：师徒、朋友）"
                className="rounded border border-gray-600 bg-gray-700 px-3 py-1 text-sm text-white"
              />
              <button
                onClick={() => {
                  setIsAddingRelation(false);
                  setSourceNode(null);
                }}
                className="rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-500"
              >
                取消
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsAddingRelation(true)}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              + 添加关系
            </button>
          )}
          <button
            onClick={fetchGraph}
            className="rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-500"
          >
            刷新
          </button>
        </div>
      </div>

      {/* 添加关系提示 */}
      {isAddingRelation && (
        <div className="mb-4 rounded border border-blue-700 bg-blue-900/30 p-3 text-sm text-blue-300">
          {!sourceNode
            ? '请点击源角色节点'
            : `已选择 ${sourceNode.name}，请点击目标角色节点建立关系`}
        </div>
      )}

      {/* 图谱 SVG */}
      <div className="relative overflow-hidden rounded-lg border border-gray-700 bg-gray-900/50">
        <svg width="100%" height="600" viewBox="0 0 800 600">
          <defs>
            {/* 箭头标记 */}
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280" />
            </marker>
          </defs>

          {/* 绘制边（关系线） */}
          {graph.edges.map((edge) => {
            const sourcePos = positions.get(edge.source);
            const targetPos = positions.get(edge.target);
            if (!sourcePos || !targetPos) return null;

            const color =
              RELATION_COLORS[edge.type] ||
              RELATION_COLORS[edge.label] ||
              '#6B7280';
            const isHovered = hoveredEdge?.id === edge.id;

            // 计算线的中点用于放置标签
            const midX = (sourcePos.x + targetPos.x) / 2;
            const midY = (sourcePos.y + targetPos.y) / 2;

            // 计算缩短的线（避免覆盖节点）
            const dx = targetPos.x - sourcePos.x;
            const dy = targetPos.y - sourcePos.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nodeRadius = 30;
            const startX = sourcePos.x + (dx / len) * nodeRadius;
            const startY = sourcePos.y + (dy / len) * nodeRadius;
            const endX = targetPos.x - (dx / len) * (nodeRadius + 5);
            const endY = targetPos.y - (dy / len) * (nodeRadius + 5);

            return (
              <g
                key={edge.id}
                onMouseEnter={() => setHoveredEdge(edge)}
                onMouseLeave={() => setHoveredEdge(null)}
                onClick={() => handleDeleteRelation(edge)}
                style={{ cursor: 'pointer' }}
              >
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={color}
                  strokeWidth={isHovered ? 3 : 2}
                  strokeOpacity={isHovered ? 1 : 0.6}
                  markerEnd="url(#arrowhead)"
                />
                <text
                  x={midX}
                  y={midY - 8}
                  textAnchor="middle"
                  fill={color}
                  fontSize="12"
                  fontWeight={isHovered ? 'bold' : 'normal'}
                >
                  {edge.label}
                </text>
              </g>
            );
          })}

          {/* 绘制节点 */}
          {graph.nodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;

            const color = ROLE_COLORS[node.role] || ROLE_COLORS.MINOR;
            const isSelected = selectedNode?.id === node.id;
            const isSource = sourceNode?.id === node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => {
                  if (isAddingRelation) {
                    if (!sourceNode) {
                      setSourceNode(node);
                    } else if (sourceNode.id !== node.id) {
                      handleAddRelation(node);
                    }
                  } else {
                    setSelectedNode(isSelected ? null : node);
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* 节点圆圈 */}
                <circle
                  r={isSelected || isSource ? 35 : 30}
                  fill={color}
                  fillOpacity={0.2}
                  stroke={color}
                  strokeWidth={isSelected || isSource ? 3 : 2}
                />
                {/* 头像首字母 */}
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fill={color}
                  fontSize="18"
                  fontWeight="bold"
                >
                  {node.name.charAt(0)}
                </text>
                {/* 名字标签 */}
                <text
                  y={45}
                  textAnchor="middle"
                  fill="white"
                  fontSize="12"
                  fontWeight="medium"
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 选中节点的详情面板 */}
      {selectedNode && (
        <div className="absolute right-4 top-16 w-64 rounded-lg border border-gray-700 bg-gray-800 p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-medium text-white">{selectedNode.name}</h4>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">角色类型:</span>
              <span
                className="rounded px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: ROLE_COLORS[selectedNode.role] + '30',
                  color: ROLE_COLORS[selectedNode.role],
                }}
              >
                {selectedNode.role === 'PROTAGONIST'
                  ? '主角'
                  : selectedNode.role === 'ANTAGONIST'
                    ? '反派'
                    : selectedNode.role === 'SUPPORTING'
                      ? '配角'
                      : '龙套'}
              </span>
            </div>
            {selectedNode.aliases.length > 0 && (
              <div>
                <span className="text-gray-400">别名:</span>
                <span className="ml-2 text-gray-300">
                  {selectedNode.aliases.join(', ')}
                </span>
              </div>
            )}
            {selectedNode.traits.length > 0 && (
              <div>
                <span className="text-gray-400">性格特征:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedNode.traits.map((trait, i) => (
                    <span
                      key={i}
                      className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* 关系列表 */}
            <div className="mt-3 border-t border-gray-700 pt-3">
              <span className="text-gray-400">关系:</span>
              <div className="mt-1 space-y-1">
                {graph.edges
                  .filter(
                    (e) =>
                      e.source === selectedNode.id ||
                      e.target === selectedNode.id
                  )
                  .map((edge) => {
                    const isSource = edge.source === selectedNode.id;
                    const otherNode = graph.nodes.find(
                      (n) => n.id === (isSource ? edge.target : edge.source)
                    );
                    return (
                      <div
                        key={edge.id}
                        className="flex items-center gap-1 text-xs text-gray-300"
                      >
                        <span>{isSource ? '→' : '←'}</span>
                        <span
                          style={{
                            color: RELATION_COLORS[edge.label] || '#9CA3AF',
                          }}
                        >
                          {edge.label}
                        </span>
                        <span>{otherNode?.name}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 悬浮边的详情 */}
      {hoveredEdge && hoveredEdge.description && (
        <div className="absolute bottom-4 left-4 max-w-xs rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
          <span className="font-medium">{hoveredEdge.label}:</span>{' '}
          {hoveredEdge.description}
        </div>
      )}
    </div>
  );
}
