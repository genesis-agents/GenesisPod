/**
 * 产业链分析 API client（走全局 apiClient，自动解包 { success, data }）。
 */

import apiClient from '@/lib/api/client';
import type {
  AnalyzeChainResult,
  ChainGraph,
  IndustryChain,
  IndustryEntityDetail,
} from './types';

const BASE = '/industry-chain';

export const industryChainApi = {
  /** 发起产业链分析（动态编排 mission）。 */
  analyze(topic: string): Promise<AnalyzeChainResult> {
    return apiClient.post<AnalyzeChainResult>(`${BASE}/analyze`, { topic });
  },

  /** 产业链元信息 + 状态。 */
  getChain(chainId: string): Promise<IndustryChain> {
    return apiClient.get<IndustryChain>(`${BASE}/${chainId}`);
  },

  /** 产业链图谱 {nodes,edges,stats}。 */
  getGraph(chainId: string): Promise<ChainGraph> {
    return apiClient.get<ChainGraph>(`${BASE}/${chainId}/graph`);
  },

  /** 单实体详情（点击节点）。 */
  getEntity(entityId: string): Promise<IndustryEntityDetail> {
    return apiClient.get<IndustryEntityDetail>(`${BASE}/entity/${entityId}`);
  },
};
