'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type {
  SimulationNodeDatum,
  SimulationLinkDatum,
  ZoomBehavior,
  Selection,
  D3DragEvent,
} from 'd3';

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type:
    | 'User'
    | 'Collection'
    | 'Resource'
    | 'Note'
    | 'Author'
    | 'Topic'
    | 'Tag'
    // 产业链分析节点类型（additive，复用本组件渲染）
    | 'SEGMENT'
    | 'COMPANY'
    | 'PRODUCT'
    // 兜底：允许其他领域复用而不破坏类型（保留上面字面量的自动补全）
    | (string & NonNullable<unknown>);
  properties: {
    /** 产业链：所属环节（chain 布局按此分列） */
    segment?: string | null;
    title?: string;
    username?: string;
    name?: string;
    // 用户个性化数据
    readStatus?: string;
    readProgress?: number;
    userNote?: string;
    userTags?: string[];
    addedAt?: string;
    // Collection 属性
    description?: string;
    icon?: string;
    color?: string;
    itemCount?: number;
    // Note 属性
    contentPreview?: string;
  };
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

interface KnowledgeGraphViewProps {
  nodes: GraphNode[];
  edges: GraphLink[];
  /** 初始布局（默认 force）；产业链页传 'chain' */
  defaultLayout?: 'force' | 'circular' | 'hierarchical' | 'chain';
  /** 顶部标题（默认"知识图谱"） */
  title?: string;
  /**
   * 节点选中回调（保持本组件通用：详情展示由调用方决定）。
   * 提供时**抑制内部浮层**，由调用方自行渲染（如产业链页用 canonical SideDrawer）；
   * 传 null 表示取消选中。
   */
  onNodeSelect?: (node: GraphNode | null) => void;
}

export default function KnowledgeGraphView({
  nodes,
  edges,
  defaultLayout = 'force',
  title,
  onNodeSelect,
}: KnowledgeGraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [layout, setLayout] = useState<
    'force' | 'circular' | 'hierarchical' | 'chain'
  >(defaultLayout);

  useEffect(() => {
    if (!svgRef.current || !nodes || nodes.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // 清空之前的内容
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);

    const g = svg.append('g');

    // 创建缩放行为
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // 颜色映射 - 包含所有节点类型
    const colorScale = d3
      .scaleOrdinal<string>()
      .domain([
        'User',
        'Collection',
        'Resource',
        'Note',
        'Author',
        'Topic',
        'Tag',
        // 产业链类型（additive）
        'SEGMENT',
        'COMPANY',
        'PRODUCT',
      ])
      .range([
        '#8b5cf6', // User: 紫色
        '#6366f1', // Collection: 靛蓝色
        '#3b82f6', // Resource: 蓝色
        '#f59e0b', // Note: 琥珀色
        '#10b981', // Author: 绿色
        '#ec4899', // Topic: 粉色
        '#ef4444', // Tag: 红色
        '#0ea5e9', // SEGMENT: 天蓝
        '#6366f1', // COMPANY: 靛蓝
        '#f59e0b', // PRODUCT: 琥珀
      ]);

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
    let simulation: d3.Simulation<GraphNode, GraphLink>;

    if (layout === 'force') {
      simulation = d3
        .forceSimulation(nodes)
        .force(
          'link',
          d3
            .forceLink<GraphNode, GraphLink>(edges)
            .id((d) => d.id)
            .distance(100)
        )
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(30));
    } else if (layout === 'circular') {
      const angleStep = (2 * Math.PI) / nodes.length;
      const radius = Math.min(width, height) * 0.35;
      nodes.forEach((node, i) => {
        node.x = width / 2 + radius * Math.cos(i * angleStep);
        node.y = height / 2 + radius * Math.sin(i * angleStep);
        node.fx = node.x;
        node.fy = node.y;
      });
      simulation = d3.forceSimulation(nodes);
    } else if (layout === 'chain') {
      // 产业链布局：按 segment 分列（上游→下游，左→右），列内节点纵向堆叠。
      // SEGMENT 节点置于各列顶部作为列标题，COMPANY/PRODUCT 在该列下方堆叠。
      const segmentOf = (n: GraphNode): string =>
        n.type === 'SEGMENT' ? n.label : n.properties?.segment || '其他';
      // 列顺序：优先 SEGMENT 节点出现顺序，其余追加
      const columnOrder: string[] = [];
      nodes
        .filter((n) => n.type === 'SEGMENT')
        .forEach((n) => {
          if (!columnOrder.includes(n.label)) columnOrder.push(n.label);
        });
      nodes.forEach((n) => {
        const seg = segmentOf(n);
        if (!columnOrder.includes(seg)) columnOrder.push(seg);
      });
      const colWidth = width / (columnOrder.length + 1);
      const byColumn: Record<string, GraphNode[]> = {};
      nodes.forEach((n) => {
        const seg = segmentOf(n);
        (byColumn[seg] ||= []).push(n);
      });
      columnOrder.forEach((seg, colIndex) => {
        const colNodes = byColumn[seg] || [];
        // SEGMENT 标题节点排在列首
        colNodes.sort((a, b) =>
          a.type === 'SEGMENT' ? -1 : b.type === 'SEGMENT' ? 1 : 0
        );
        const rowHeight = height / (colNodes.length + 1);
        colNodes.forEach((node, rowIndex) => {
          node.x = colWidth * (colIndex + 1);
          node.y = rowHeight * (rowIndex + 1);
          node.fx = node.x;
          node.fy = node.y;
        });
      });
      simulation = d3.forceSimulation(nodes);
    } else {
      // Grouped layout - organize nodes by type in horizontal bands
      // This is more appropriate for knowledge graphs than tree layouts
      const typeOrder = [
        'User',
        'Collection',
        'Resource',
        'Note',
        'Author',
        'Topic',
        'Tag',
      ];
      const nodesByType: Record<string, GraphNode[]> = {};

      // Group nodes by type
      nodes.forEach((node) => {
        if (!nodesByType[node.type]) {
          nodesByType[node.type] = [];
        }
        nodesByType[node.type].push(node);
      });

      // Position nodes in horizontal bands
      const bandHeight = height / (typeOrder.length + 1);
      typeOrder.forEach((type, bandIndex) => {
        const nodesOfType = nodesByType[type] || [];
        const nodeSpacing = width / (nodesOfType.length + 1);

        nodesOfType.forEach((node, nodeIndex) => {
          node.x = nodeSpacing * (nodeIndex + 1);
          node.y = bandHeight * (bandIndex + 1);
          node.fx = node.x;
          node.fy = node.y;
        });
      });

      simulation = d3.forceSimulation(nodes);
    }

    // 计算每条边的权重（基于源节点和目标节点的连接数）
    const nodeConnectionCount = new Map<string, number>();
    edges.forEach((e) => {
      const sourceId = typeof e.source === 'string' ? e.source : e.source.id;
      const targetId = typeof e.target === 'string' ? e.target : e.target.id;
      nodeConnectionCount.set(
        sourceId,
        (nodeConnectionCount.get(sourceId) || 0) + 1
      );
      nodeConnectionCount.set(
        targetId,
        (nodeConnectionCount.get(targetId) || 0) + 1
      );
    });

    // 绘制边 - 使用曲线路径
    const link = g
      .append('g')
      .selectAll('path')
      .data(edges)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => {
        // 根据关系类型设置颜色
        if (d.type === 'OWNS') return '#8b5cf6'; // 紫色 - 用户拥有
        if (d.type === 'CONTAINS') return '#6366f1'; // 靛蓝 - 收藏集包含
        if (d.type === 'HAS_NOTE') return '#f59e0b'; // 琥珀 - 关联笔记
        if (d.type === 'AUTHORED') return '#10b981'; // 绿色 - 作者
        if (d.type === 'BELONGS_TO') return '#ec4899'; // 粉色 - 主题
        if (d.type === 'TAGGED_WITH') return '#ef4444'; // 红色 - 标签
        if (d.type === 'SIMILAR_TO') return '#06b6d4'; // 青色 - 相似资源
        return '#94a3b8';
      })
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', (d) => {
        // 根据连接强度调整粗细（源和目标节点的平均连接数）
        const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target.id;
        const sourceCount = nodeConnectionCount.get(sourceId) || 1;
        const targetCount = nodeConnectionCount.get(targetId) || 1;
        const avgConnections = (sourceCount + targetCount) / 2;
        // 映射到1-4的粗细范围
        return Math.min(Math.max(avgConnections / 3, 1), 4);
      });

    // 绘制节点
    const node = g
      .append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended)
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
        onNodeSelect?.(d);
      });

    // 节点标签
    node
      .append('text')
      .text((d) => {
        if (d.type === 'User') return d.properties.username || 'Me';
        if (d.type === 'Collection')
          return d.properties.name?.substring(0, 15) || d.label || d.id;
        if (d.type === 'Resource')
          return d.properties.title?.substring(0, 20) || d.id;
        if (d.type === 'Note')
          return d.properties.contentPreview?.substring(0, 15) || 'Note';
        if (d.type === 'Author') return d.properties.username || d.id;
        if (d.type === 'Topic' || d.type === 'Tag')
          return d.properties.name || d.id;
        return d.label || d.id;
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

    // 边端点解析：force 布局由 forceLink 把 source/target 解析成节点对象；
    // chain/circular/hierarchical 无 link force，source/target 仍是字符串 id，
    // 需用 nodeById 自行解析——否则 source.x 为 undefined，线画在原点而不可见。
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    // 更新位置
    simulation.on('tick', () => {
      // 使用二次贝塞尔曲线绘制边
      link.attr('d', (d) => {
        const source =
          typeof d.source === 'string' ? nodeById.get(d.source) : d.source;
        const target =
          typeof d.target === 'string' ? nodeById.get(d.target) : d.target;
        const sourceX = source?.x ?? 0;
        const sourceY = source?.y ?? 0;
        const targetX = target?.x ?? 0;
        const targetY = target?.y ?? 0;

        // 计算中点
        const midX = (sourceX + targetX) / 2;
        const midY = (sourceY + targetY) / 2;

        // 计算垂直于连线的偏移量，产生曲线效果
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 根据距离计算曲率，距离越远曲线越明显
        const curvature = Math.min(distance * 0.15, 40);

        // 垂直方向的偏移（归一化后乘以曲率）
        const offsetX = distance > 0 ? (-dy / distance) * curvature : 0;
        const offsetY = distance > 0 ? (dx / distance) * curvature : 0;

        // 控制点
        const controlX = midX + offsetX;
        const controlY = midY + offsetY;

        // 返回二次贝塞尔曲线路径
        return `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;
      });

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // 拖拽事件
    function dragstarted(
      event: D3DragEvent<SVGGElement, GraphNode, GraphNode>
    ) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0);
      if (layout === 'force') {
        event.subject.fx = null;
        event.subject.fy = null;
      }
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, layout, onNodeSelect]);

  // 详情面板标题：覆盖全部已知类型 + 兜底（含产业链 SEGMENT/COMPANY/PRODUCT，
  // 旧版只列了 7 种 library 类型，产业链节点点开标题为空白）。
  const nodeDisplayName = (n: GraphNode): string => {
    if (n.type === 'User') return n.properties.username || '我的知识库';
    if (n.type === 'Note')
      return n.properties.contentPreview?.substring(0, 30) || '笔记';
    return (
      n.properties.title ||
      n.properties.name ||
      n.properties.username ||
      n.label ||
      n.id
    );
  };

  const nodeTypeLabels: Record<string, string> = {
    User: '我',
    Collection: '收藏集',
    Resource: '资源',
    Note: '笔记',
    Author: '作者',
    Topic: '主题',
    Tag: '标签',
    // 产业链类型（additive）
    SEGMENT: '环节',
    COMPANY: '公司',
    PRODUCT: '产品',
  };

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* 顶部工具栏 */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {title ?? '🗺️ 知识图谱'}
          </h1>

          <div className="flex items-center gap-4">
            {/* 布局切换 */}
            <div className="flex gap-2 rounded-lg bg-gray-100 p-1">
              {(['force', 'circular', 'hierarchical', 'chain'] as const).map(
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
                        chain: '产业链',
                      }[layoutType]
                    }
                  </button>
                )
              )}
            </div>

            {/* 图例 */}
            <div className="flex flex-wrap gap-3">
              {(
                [
                  'User',
                  'Collection',
                  'Resource',
                  'Note',
                  'Author',
                  'Topic',
                  'Tag',
                  'SEGMENT',
                  'COMPANY',
                  'PRODUCT',
                ] as const
              ).map((type) => {
                const color: Record<string, string> = {
                  User: 'bg-purple-500',
                  Collection: 'bg-indigo-500',
                  Resource: 'bg-blue-500',
                  Note: 'bg-amber-500',
                  Author: 'bg-green-500',
                  Topic: 'bg-pink-500',
                  Tag: 'bg-red-500',
                  SEGMENT: 'bg-sky-500',
                  COMPANY: 'bg-indigo-500',
                  PRODUCT: 'bg-amber-500',
                };
                // 只显示存在于当前图谱中的节点类型
                const hasType = nodes.some((n) => n.type === type);
                if (!hasType) return null;

                return (
                  <div key={type} className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${color[type]}`} />
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

        {/* 节点详情面板（调用方提供 onNodeSelect 时抑制，由其用 SideDrawer 等自行渲染） */}
        {selectedNode && !onNodeSelect && (
          <div className="absolute right-4 top-4 w-80 rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-gray-500">
                  {nodeTypeLabels[selectedNode.type]}
                </div>
                <h3 className="mt-1 text-lg font-bold text-gray-900">
                  {nodeDisplayName(selectedNode)}
                </h3>
                {/* 显示额外信息 */}
                {(selectedNode.type === 'COMPANY' ||
                  selectedNode.type === 'PRODUCT') &&
                  selectedNode.properties.segment && (
                    <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      {selectedNode.properties.segment}
                    </span>
                  )}
                {selectedNode.type === 'Collection' &&
                  selectedNode.properties.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                      {selectedNode.properties.description}
                    </p>
                  )}
                {selectedNode.type === 'Resource' &&
                  selectedNode.properties.readStatus && (
                    <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      {selectedNode.properties.readStatus === 'read'
                        ? '已读'
                        : selectedNode.properties.readStatus === 'reading'
                          ? '阅读中'
                          : '待读'}
                    </span>
                  )}
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
