export interface ScenarioRun {
  id: string;
  status: string;
  currentRound?: number;
}

export interface ScenarioCard {
  id: string;
  name: string;
  industry: string;
  region?: string;
  companies?: ScenarioFormCompany[];
  agents?: ScenarioFormAgent[];
  runs?: ScenarioRun[];
  goals?: ScenarioGoals;
  params?: ScenarioParams;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioFormCompany {
  name: string;
  type: string;
  market: string;
  metrics?: CompanyMetrics | Partial<CompanyMetrics>;
}

export interface ScenarioFormAgent {
  role: string;
  team: 'BLUE' | 'RED' | 'GREEN' | 'WHITE' | 'CHAOS';
  companyName?: string;
  persona?: string | object; // Can be JSON string or object from backend
  memoryPublic?: string | object;
  memoryPrivate?: string | object;
}

export interface ScenarioTemplate {
  name: string;
  industry: string;
  region?: string;
  goals?: ScenarioGoals;
  constraints?: ScenarioParams;
  companies?: ScenarioFormCompany[];
  agents?: ScenarioFormAgent[];
  description?: string;
  badge?: string;
}

export interface ScenarioGoals {
  targetShare?: string;
  risk?: string;
  growth?: string;
  custom?: string;
}

export interface ScenarioParams {
  blindMove: boolean;
  cot: boolean;
  chaosProb: number;
  irrationalProb: number;
  humanBreakEvery: number;
}

export interface ExternalSnapshot {
  snapshot: Record<string, unknown>;
  evidence: Array<{
    provider: string;
    ok: boolean;
    error?: string;
    endpoint?: string;
    timestamp: string;
  }>;
}

export interface CompanyMetrics {
  cash: number; // 现金
  share: number; // 市场份额 %
  priceBand: string; // 价格带
  capacity: number; // 产能
  inventory: number; // 库存
  delivery: string; // 交付周期
  arpu: number; // ARPU
  margin: number; // 毛利率 %
  debt: number; // 负债
}

export interface CompanyMoat {
  patents: number; // 专利数
  channels: string; // 渠道
  brand: string; // 品牌影响力
}

export interface CompanyFull extends ScenarioFormCompany {
  metrics: CompanyMetrics;
  moat: CompanyMoat;
  riskThresholds: {
    cashMin: number;
    debtMax: number;
    complianceLevel: string;
  };
  sentimentScore: number;
}

export type TabType = 'basic' | 'companies' | 'agents' | 'params';
