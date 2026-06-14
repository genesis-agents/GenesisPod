/**
 * Shared test fixtures for agent-playground artifact tests.
 */
import type {
  ReportArtifact,
  ArtifactSection,
  ArtifactCitation,
} from '@/lib/features/agent-playground/report-artifact.types';

export function makeSection(
  overrides: Partial<ArtifactSection> = {}
): ArtifactSection {
  return {
    id: 's1',
    type: 'dimension',
    level: 2,
    title: '市场分析',
    anchor: 'market-analysis',
    startOffset: 0,
    endOffset: 500,
    wordCount: 300,
    readingTimeMinutes: 2,
    citations: [1],
    figureIds: [],
    factIds: [],
    ...overrides,
  };
}

export function makeCitation(
  overrides: Partial<ArtifactCitation> = {}
): ArtifactCitation {
  return {
    index: 1,
    uuid: 'cite-uuid-1',
    title: '市场研究报告',
    url: 'https://example.com/report',
    domain: 'example.com',
    accessedAt: '2026-01-01T00:00:00Z',
    sourceType: 'industry',
    credibilityScore: 85,
    occurrences: [],
    ...overrides,
  };
}

export function makeArtifact(
  overrides: Partial<ReportArtifact> = {}
): ReportArtifact {
  const fullMarkdown = `# AI 市场分析报告\n\n## 市场分析\n\n这是市场分析的内容，包含详细数据和引用[1]。\n市场规模预计达到万亿级别。\n\n## 竞争格局\n\n竞争格局分析内容[2]。\n主要竞争者包括多家头部企业。\n\n## 参考文献\n\n1. 市场研究报告\n2. 竞争分析报告\n`;
  return {
    content: {
      fullMarkdown,
      fullReportSize: fullMarkdown.length,
    },
    sections: [
      makeSection({
        id: 's1',
        title: '市场分析',
        startOffset: 20,
        endOffset: 130,
      }),
      makeSection({
        id: 's2',
        title: '竞争格局',
        type: 'dimension',
        startOffset: 131,
        endOffset: 250,
        wordCount: 200,
        citations: [2],
      }),
    ],
    citations: [
      makeCitation({ index: 1 }),
      makeCitation({
        index: 2,
        uuid: 'cite-uuid-2',
        title: '竞争分析报告',
        url: 'https://example.com/comp',
      }),
    ],
    figures: [],
    quickView: {
      executiveSummary: {
        markdown: '## 核心摘要\n\n这是执行摘要的内容。',
        wordCount: 50,
      },
      topHighlights: [],
      topTrends: [
        {
          title: 'AI 增长趋势',
          description: 'AI 市场持续高速增长',
          direction: 'increasing',
          timeframe: '2026',
        },
      ],
      keyRisks: [],
      topRecommendations: [],
      keyCitations: [1],
      keyFigures: [],
      estimatedReadingTime: 5,
      whatYouWillLearn: ['AI 市场规模', '竞争格局分析'],
      riskMatrix: [
        {
          riskType: '监管风险',
          probability: '高',
          impact: '中',
          timeframe: '2026H1',
        },
        {
          riskType: '技术风险',
          probability: '中',
          impact: '高',
          timeframe: '2026H2',
        },
      ],
      recommendationsByAudience: {
        forEnterprise: {
          shortTerm: ['加大 AI 投入'],
          midTerm: ['建立 AI 护城河'],
        },
        forInvestors: {
          shortTerm: ['关注头部企业'],
          midTerm: ['布局 AI 基础设施'],
        },
      },
      keyFindingsByDimension: [
        {
          dimensionName: '市场规模',
          findings: [
            {
              finding: 'AI 市场规模达万亿',
              significance: 'high',
              body: '详细说明市场规模数据及增长预测。',
            },
            { finding: '年增长率超过30%', significance: 'medium' },
          ],
        },
      ],
      foresight: {
        baseCase: [
          {
            judgment: 'AI 将主导下一轮科技革命',
            probability: 0.75,
            confidence: 'high',
            horizon: '18m-3y',
            resolutionCriteria: '市值超过某阈值',
            evidenceIds: [],
            baseRate: '历史科技革命基准率约 60%',
          },
        ],
        scenarios: [
          {
            kind: 'bull',
            narrative: '乐观情景：AGI 提前到来',
            trigger: '重大技术突破',
            probability: 0.3,
          },
          {
            kind: 'base',
            narrative: '基准情景：稳步发展',
            trigger: '正常监管进程',
            probability: 0.5,
          },
          {
            kind: 'bear',
            narrative: '悲观情景：监管收紧',
            trigger: '重大安全事故',
            probability: 0.2,
          },
        ],
        predeterminedElements: ['大模型能力持续提升'],
        criticalUncertainties: ['监管政策走向'],
        leadingIndicators: [
          { signal: 'GPU 出货量', watchFor: '持续增长说明需求旺盛' },
        ],
        couldBeWrongIf: ['监管超预期收紧'],
        robustness: 72,
      },
    },
    factTable: [],
    metadata: {
      topic: 'AI 市场分析',
      generatedAt: '2026-01-01T10:00:00Z',
      generationTimeMs: 30000,
      version: 1,
      versionLabel: 'initial',
      isIncremental: false,
      dimensionCount: 2,
      sourceCount: 2,
      factCount: 5,
      figureCount: 0,
      wordCount: 5000,
      readingTimeMinutes: 20,
      styleProfile: 'executive',
      lengthProfile: 'standard',
      audienceProfile: 'domain-expert',
      language: 'zh-CN',
      totalTokens: { prompt: 10000, completion: 5000, total: 15000 },
      costCents: 150,
      modelTrail: ['gpt-4o', 'claude-3'],
      searchTimeRange: '30d',
    },
    quality: {
      overall: 85,
      dimensions: {
        traceability: 90,
        factualConsistency: 85,
        novelty: 80,
        coverage: 85,
        redundancy: 90,
        formatCorrectness: 95,
        citationDensity: 80,
        styleConformance: 85,
        lengthAccuracy: 90,
        chapterBalance: 85,
      },
      hardGateViolations: [],
      warnings: [],
      qualityTrace: [],
      finalVerdict: 'good',
    },
    ...overrides,
  };
}
