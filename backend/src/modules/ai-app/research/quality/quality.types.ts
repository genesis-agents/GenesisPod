/** 违规严重程度 */
export type ViolationSeverity = "error" | "warning" | "info";

/** 单条违规 */
export interface QualityViolation {
  rule: string;
  severity: ViolationSeverity;
  message: string;
  section?: string;
  autoFixed?: boolean;
}

/** 报告质量检查结果 */
export interface ReportQualityResult {
  passed: boolean;
  violations: QualityViolation[];
  wasAutoFixed: boolean;
  fixedContent?: string;
  rewriteGuidance: string[];
  scores: {
    formatting: number;
    citationCoverage: number;
    contentDepth: number;
    overall: number;
  };
}

/** 事实检查结果 */
export interface FactCheckResult {
  totalClaims: number;
  verifiedClaims: number;
  disputedClaims: number;
  unverifiedClaims: number;
  accuracyScore: number;
  details: FactCheckDetail[];
}

export interface FactCheckDetail {
  claim: string;
  verdict: "verified" | "disputed" | "unverified";
  confidence: number;
  supportingSources: string[];
}

/** 一致性检查结果 */
export interface ConsistencyCheckResult {
  isConsistent: boolean;
  conflicts: ConsistencyConflict[];
  overallScore: number;
}

export interface ConsistencyConflict {
  type: "data_conflict" | "logic_contradiction" | "source_conflict";
  description: string;
  sections: string[];
  severity: "high" | "medium" | "low";
}
