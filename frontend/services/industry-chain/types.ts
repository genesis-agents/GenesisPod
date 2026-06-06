/** 产业链分析 — 前后端共享类型（与 backend industry-chain 对齐）。 */

export interface ChainGraphNode {
  id: string;
  label: string;
  type: string; // SEGMENT | COMPANY | PRODUCT
  segment?: string | null;
}

export interface ChainGraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number | null;
}

export interface ChainGraph {
  nodes: ChainGraphNode[];
  edges: ChainGraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    segments: number;
    companies: number;
  };
}

export interface IndustryChain {
  id: string;
  topic: string;
  status: string; // PLANNING | RUNNING | COMPLETED | FAILED
  ownerId: string;
  missionId?: string | null;
  createdAt: string;
}

export interface IndustryEntityDetail {
  id: string;
  chainId: string;
  name: string;
  type: string;
  cik?: string | null;
  segment?: string | null;
  description?: string | null;
  sourceRefs?: Array<{
    accessionNumber?: string;
    url?: string;
    reportType?: string;
    date?: string;
  }> | null;
}

export interface AnalyzeChainResult {
  chainId: string;
  missionId: string;
}
