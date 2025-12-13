'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface GraphNode {
  id: string;
  label: string;
  type: 'Resource' | 'Author' | 'Topic' | 'Tag';
  properties: {
    title?: string;
    username?: string;
    name?: string;
  };
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

interface KnowledgeGraphViewProps {
  nodes: GraphNode[];
  edges: GraphLink[];
}

export default function KnowledgeGraphView({
  nodes,
  edges,
}: KnowledgeGraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [layout, setLayout] = useState<'force' | 'circular' | 'hierarchical'>(
    'force'
  );

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // 清空之前的内容
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);

    // 创建缩放行为
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    const g = svg.append('g');

    // 颜色映射
    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(['Resource', 'Author', 'Topic', 'Tag'])
      .range(['#3b82f6', '#10b981', '#f59e0b', '#ef4444']);

    // 节点大小映射
    const sizeScale = d3
      .scaleLinear()
      .domain([
        0,
        d3.max(nodes, (d) => {
          const connections = edges.filter(
            (e) => e.source === d.id || e.target === d.id
          ).length;
          return connections;
        }) || 1,
      ])
      .range([8, 24]);

    // 创建力导向模拟
    let simulation: d3.Simulation<any, any>;

    if (layout === 'force') {
      simulation = d3
        .forceSimulation(nodes as any)
        .force(
          'link',
          d3
            .forceLink(edges)
            .id((d: any) => d.id)
            .distance(100)
        )
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(30));
    } else if (layout === 'circular') {
      const angleStep = (2 * Math.PI) / nodes.length;
      const radius = Math.min(width, height) * 0.35;
      nodes.forEach((node, i) => {
        (node as any).x = width / 2 + radius * Math.cos(i * angleStep);
        (node as any).y = height / 2 + radius * Math.sin(i * angleStep);
        (node as any).fx = (node as any).x;
        (node as any).fy = (node as any).y;
      });
      simulation = d3.forceSimulation(nodes as any);
    } else {
      // Hierarchical layout (simplified tree)
      const root = d3
        .stratify<GraphNode>()
        .id((d) => d.id)
        .parentId(() => null)(nodes);

      const treeLayout = d3.tree().size([width - 100, height - 100]);

      treeLayout(root as any);

      nodes.forEach((node) => {
        const treeNode = root.descendants().find((n) => n.id === node.id);
        if (treeNode) {
          (node as any).x = treeNode.x! + 50;
          (node as any).y = treeNode.y! + 50;
          (node as any).fx = (node as any).x;
          (node as any).fy = (node as any).y;
        }
      });
      simulation = d3.forceSimulation(nodes as any);
    }

    // 绘制边
    const link = g
      .append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', (d) => {
        // 根据关系类型调整粗细
        if (d.type === 'AUTHORED') return 2;
        if (d.type === 'BELONGS_TO') return 1.5;
        return 1;
      });

    // 绘制节点
    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<any, any>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended) as any
      );

    // 节点圆形
    node
      .append('circle')
      .attr('r', (d) =>
        sizeScale(
          edges.filter((e) => e.source === d.id || e.target === d.id).length
        )
      )
      .attr('fill', (d) => colorScale(d.type))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
        highlightNode(d);
      });

    // 节点标签
    node
      .append('text')
      .text((d) => {
        if (d.type === 'Resource')
          return d.properties.title?.substring(0, 20) || d.id;
        if (d.type === 'Author') return d.properties.username || d.id;
        if (d.type === 'Topic' || d.type === 'Tag')
          return d.properties.name || d.id;
        return d.id;
      })
      .attr('x', 12)
      .attr('y', 4)
      .attr('font-size', '12px')
      .attr('fill', '#475569')
      .attr('font-weight', 500);

    // 高亮功能
    function highlightNode(selectedNode: GraphNode) {
      const connectedNodeIds = new Set(
        edges
          .filter(
            (e) => e.source === selectedNode.id || e.target === selectedNode.id
          )
          .flatMap((e) => [e.source, e.target])
      );

      node
        .select('circle')
        .attr('opacity', (d) =>
          d.id === selectedNode.id || connectedNodeIds.has(d.id) ? 1 : 0.2
        );

      link
        .attr('stroke-opacity', (d) =>
          d.source === selectedNode.id || d.target === selectedNode.id
            ? 0.8
            : 0.1
        )
        .attr('stroke-width', (d) =>
          d.source === selectedNode.id || d.target === selectedNode.id ? 3 : 1
        );
    }

    // 更新位置
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // 拖拽事件
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      if (layout === 'force') {
        event.subject.fx = null;
        event.subject.fy = null;
      }
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, layout]);

  const nodeTypeLabels = {
    Resource: '资源',
    Author: '作者',
    Topic: '主题',
    Tag: '标签',
  };

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* 顶部工具栏 */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">🗺️ 知识图谱</h1>

          <div className="flex items-center gap-4">
            {/* 布局切换 */}
            <div className="flex gap-2 rounded-lg bg-gray-100 p-1">
              {(['force', 'circular', 'hierarchical'] as const).map(
                (layoutType) => (
                  <button
                    key={layoutType}
                    onClick={() => setLayout(layoutType)}
                    className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                      layout === layoutType
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {
                      {
                        force: '力导向',
                        circular: '环形',
                        hierarchical: '层次',
                      }[layoutType]
                    }
                  </button>
                )
              )}
            </div>

            {/* 图例 */}
            <div className="flex gap-3">
              {(['Resource', 'Author', 'Topic', 'Tag'] as const).map((type) => {
                const color = {
                  Resource: 'bg-blue-500',
                  Author: 'bg-green-500',
                  Topic: 'bg-orange-500',
                  Tag: 'bg-red-500',
                }[type];

                return (
                  <div key={type} className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${color}`} />
                    <span className="text-sm text-gray-600">
                      {nodeTypeLabels[type]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-600">
          {nodes.length} 个节点 • {edges.length} 条关系
        </div>
      </div>

      {/* 图谱画布 */}
      <div className="relative flex-1">
        <svg
          ref={svgRef}
          className="h-full w-full"
          style={{
            background: 'radial-gradient(circle, #f8fafc 0%, #e2e8f0 100%)',
          }}
        />

        {/* 节点详情面板 */}
        {selectedNode && (
          <div className="absolute right-4 top-4 w-80 rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-gray-500">
                  {nodeTypeLabels[selectedNode.type]}
                </div>
                <h3 className="mt-1 text-lg font-bold text-gray-900">
                  {selectedNode.type === 'Resource' &&
                    selectedNode.properties.title}
                  {selectedNode.type === 'Author' &&
                    selectedNode.properties.username}
                  {(selectedNode.type === 'Topic' ||
                    selectedNode.type === 'Tag') &&
                    selectedNode.properties.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <svg
                  className="h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-gray-700">关联数量</div>
              <div className="mt-1 text-2xl font-bold text-purple-600">
                {
                  edges.filter(
                    (e) =>
                      e.source === selectedNode.id ||
                      e.target === selectedNode.id
                  ).length
                }
              </div>
            </div>

            <button className="mt-4 w-full rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 py-2 text-sm font-medium text-white shadow-sm hover:shadow-md">
              查看详情
            </button>
          </div>
        )}

        {/* 操作提示 */}
        <div className="absolute bottom-4 left-4 rounded-lg bg-white/90 px-4 py-2 text-xs text-gray-600 shadow-sm backdrop-blur-sm">
          💡 拖拽节点重新布局 • 点击节点查看详情 • 滚轮缩放
        </div>
      </div>
    </div>
  );
}
