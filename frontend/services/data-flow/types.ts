/**
 * 系统数据流图 —— 前后端共享类型（镜像 backend DataFlowService）。
 */

export type DataFlowGroup =
  | 'external'
  | 'explore'
  | 'library'
  | 'engine'
  | 'ontology'
  | 'apps';

export type DataFlowEdgeKind =
  | 'ingest'
  | 'process'
  | 'retrieve'
  | 'save'
  | 'ofill'
  | 'ouse';

export interface DataFlowLayer {
  id: number;
  label: string;
}

export interface DataFlowNode {
  id: string;
  layer: number;
  group: DataFlowGroup;
  title: string;
  subtitle: string;
  tag: string;
  description: string;
  capabilityId?: string;
  sourceId?: string;
  /** 有真实运行时实体在线（registry 校验）；声明式节点为 null */
  live: boolean | null;
}

export interface DataFlowEdge {
  id: string;
  from: string;
  to: string;
  kind: DataFlowEdgeKind;
  label: string;
}

export interface DataFlowGraph {
  layers: DataFlowLayer[];
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
  generatedAt: string;
}

export interface DataFlowNodeMetric {
  calls: number;
  errors: number;
  avgMs: number | null;
  tokens: number;
}

export interface DataFlowMetrics {
  windowHours: number;
  generatedAt: string;
  nodes: Record<string, DataFlowNodeMetric>;
  totalCalls: number;
}
