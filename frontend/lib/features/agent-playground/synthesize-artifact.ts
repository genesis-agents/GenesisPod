// @blueprint:legacy-derive
/**
 * synthesize-artifact —— 把任意形状的报告数据 upgrade 成 ReportArtifact 让 ArtifactReader 渲染
 *
 * 用户明确：不要 fallback ReportPanel，所有报告都走三视图（continuous / chapter / quick）。
 * 实际数据可能是：
 *   - v2 ReportArtifact（理想态，S11 写完 DB 时是这个）
 *   - v1 ResearchReport（来自 socket stream report:draft 事件，{title, summary, sections, citations}）
 *   - null / undefined（mission 还没跑到 / 失败 / 孤立）
 *
 * 本模块负责：
 *   isReportArtifact(x): 是否已经是 v2 形状
 *   synthesizeArtifactFromV1(v1): v1 → v2 适配（最小可渲染骨架）
 *   synthesizeArtifactFromMissionState(...): 从 mission 状态 / failed message 生成空态 artifact
 */

import type {
  ReportArtifact,
  ArtifactSection,
  ArtifactCitation,
} from './report-artifact.types';
import { isReportArtifact } from './report-artifact.types';

interface V1Report {
  title?: string;
  summary?: string;
  sections?: { heading: string; body: string; sources?: string[] }[];
  conclusion?: string;
  citations?: string[];
}

/**
 * 从 v1 ResearchReport 适配成 ReportArtifact 骨架。
 *
 * - sections[i].body 拼接成 fullMarkdown（## heading\n\nbody）
 * - sections 数组转成 ArtifactSection[]，offset 在拼接时计算
 * - citations URL 数组转成 ArtifactCitation[]，每条只有 url + title=域名
 * - 缺失的字段（quality / metadata / figures / factTable）填空骨架
 */
export function synthesizeArtifactFromV1(v1: V1Report): ReportArtifact {
  const title = v1.title ?? '研究报告';
  const summary = v1.summary ?? '';
  const v1Sections = Array.isArray(v1.sections) ? v1.sections : [];

  const mdParts: string[] = [];
  if (summary) {
    mdParts.push(`# ${title}\n\n${summary}\n`);
  } else {
    mdParts.push(`# ${title}\n`);
  }

  let charOffset = mdParts.join('').length;
  const artifactSections: ArtifactSection[] = [];

  // executive_summary 占位
  if (summary) {
    artifactSections.push({
      id: 'sec-summary',
      type: 'executive_summary',
      level: 2,
      title: '摘要',
      anchor: 'summary',
      startOffset: 0,
      endOffset: charOffset,
      wordCount: summary.length,
      readingTimeMinutes: Math.max(1, Math.ceil(summary.length / 400)),
      citations: [],
      figureIds: [],
      factIds: [],
    });
  }

  v1Sections.forEach((s, i) => {
    const heading = (s.heading ?? `章节 ${i + 1}`).trim();
    const body = (s.body ?? '').trim();
    const block = `\n## ${heading}\n\n${body}\n`;
    const startOffset = charOffset;
    mdParts.push(block);
    charOffset += block.length;
    artifactSections.push({
      id: `sec-${i + 1}`,
      type: 'dimension',
      level: 2,
      title: heading,
      anchor: `sec-${i + 1}`,
      startOffset,
      endOffset: charOffset,
      wordCount: body.length,
      readingTimeMinutes: Math.max(1, Math.ceil(body.length / 400)),
      citations: [],
      figureIds: [],
      factIds: [],
    });
  });

  if (v1.conclusion) {
    const block = `\n## 结论\n\n${v1.conclusion.trim()}\n`;
    const startOffset = charOffset;
    mdParts.push(block);
    charOffset += block.length;
    artifactSections.push({
      id: 'sec-conclusion',
      type: 'conclusion',
      level: 2,
      title: '结论',
      anchor: 'conclusion',
      startOffset,
      endOffset: charOffset,
      wordCount: v1.conclusion.length,
      readingTimeMinutes: Math.max(1, Math.ceil(v1.conclusion.length / 400)),
      citations: [],
      figureIds: [],
      factIds: [],
    });
  }

  const fullMarkdown = mdParts.join('');

  // citations 数组（v1 是裸 URL 列表）
  const citations: ArtifactCitation[] = (v1.citations ?? []).map((url, i) => {
    let domain = '';
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // 无效 URL 时 domain 留空
    }
    return {
      index: i + 1,
      uuid: `cite-${i + 1}`,
      title: domain || url,
      url,
      domain,
      accessedAt: new Date().toISOString(),
      sourceType: 'other',
      credibilityScore: 0,
      occurrences: [],
    };
  });

  // ★ 2026-04-30: 必须填齐 ReportArtifact schema 全部字段，否则下游组件访问
  //   undefined 会触发 React error boundary（如 metadata.totalTokens.total /
  //   quality.dimensions.factualConsistency 等深路径）。
  return {
    metadata: {
      topic: title,
      generatedAt: new Date().toISOString(),
      generationTimeMs: 0,
      version: 1,
      isIncremental: false,
      dimensionCount: 0,
      sourceCount: citations.length,
      factCount: 0,
      figureCount: 0,
      wordCount: fullMarkdown.length,
      readingTimeMinutes: Math.max(1, Math.ceil(fullMarkdown.length / 400)),
      styleProfile: 'executive',
      lengthProfile: 'standard',
      audienceProfile: 'domain-expert',
      language: 'zh-CN',
      totalTokens: { prompt: 0, completion: 0, total: 0 },
      costCents: 0,
      modelTrail: [],
    },
    content: {
      fullMarkdown,
      fullReportSize: fullMarkdown.length,
    },
    sections: artifactSections,
    citations,
    figures: [],
    factTable: [],
    quality: {
      overall: 0,
      dimensions: {
        traceability: 0,
        factualConsistency: 0,
        novelty: 0,
        coverage: 0,
        redundancy: 0,
        formatCorrectness: 0,
        citationDensity: 0,
        styleConformance: 0,
        lengthAccuracy: 0,
        chapterBalance: 0,
      },
      hardGateViolations: [],
      warnings: [],
      qualityTrace: [],
    },
    // ★ 2026-05-01 (PR-G iter5): quickView 必须填齐 schema 全部字段。
    //   之前 synthesize 只塞 keyHighlights/topInsights（已废弃字段名），
    //   实际 schema 要求 topHighlights/topTrends/keyRisks/topRecommendations
    //   ChapterReader / QuickReader 访问 undefined.map → React error boundary。
    quickView: {
      executiveSummary: { markdown: summary, wordCount: summary.length },
      topHighlights: [],
      topTrends: [],
      keyRisks: [],
      topRecommendations: [],
      keyCitations: [],
      keyFigures: [],
      estimatedReadingTime: Math.max(1, Math.ceil(fullMarkdown.length / 400)),
      whatYouWillLearn: [],
      // ★ PR-quickview-parity (2026-05-09): synthesize-artifact 走 v1 老路径，
      //   不消费 analyst 结构化字段；保留空兜底以满足 ArtifactQuickView 类型契约。
      riskMatrix: [],
      keyFindingsByDimension: [],
    },
  };
}

/**
 * 主入口：保证返回一个可被 ArtifactReader 渲染的 artifact，绝不返回 null。
 *
 * @param raw  原始数据（可能是 v2 / v1 / null）
 * @param fallbackTitle 如果完全无数据时显示的标题
 * @param emptyMessage  如果完全无数据时显示的提示文（如"Mission 失败" / "Mission 进行中"）
 */
export function ensureRenderableArtifact(
  raw: unknown,
  fallbackTitle: string,
  emptyMessage: string
): ReportArtifact {
  if (raw && isReportArtifact(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const r = raw as V1Report;
    if (r.sections || r.summary || r.title) {
      return synthesizeArtifactFromV1(r);
    }
  }
  // 完全无数据：返回一个空态 artifact，三视图都会显示这个 placeholder markdown
  return synthesizeArtifactFromV1({
    title: fallbackTitle,
    summary: emptyMessage,
    sections: [],
  });
}
