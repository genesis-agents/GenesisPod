'use client';

/**
 * Shared Topic Page
 *
 * 公开分享的专题页面（无需登录）
 * 参考 AI Writing 分享页面设计：左侧目录 + 悬浮菜单
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getSharedTopic,
  getSharedTopicLatestReport,
} from '@/lib/api/topic-research';
import type {
  ResearchTopic,
  TopicReport,
  DimensionAnalysis,
  ReportChart,
} from '@/types/topic-research';
import { ResearchTopicType } from '@/types/topic-research';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ReportChartRenderer,
  RiskMatrixRenderer,
} from '@/components/ai-research/charts/ReportChartRenderer';

// Icons
const LoaderIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const AlertIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const topicTypeConfig: Record<
  ResearchTopicType,
  { gradient: string; label: string; color: string }
> = {
  [ResearchTopicType.MACRO]: {
    gradient: 'from-blue-500 to-cyan-600',
    label: '宏观洞察',
    color: 'blue',
  },
  [ResearchTopicType.TECHNOLOGY]: {
    gradient: 'from-purple-500 to-pink-600',
    label: '技术趋势',
    color: 'purple',
  },
  [ResearchTopicType.COMPANY]: {
    gradient: 'from-emerald-500 to-teal-600',
    label: '企业追踪',
    color: 'emerald',
  },
};

// ★ 目录项类型（v2.0 增强）
interface TocItem {
  id: string;
  title: string;
  type:
    | 'executive-summary'
    | 'overview'
    | 'highlights'
    | 'dimension'
    | 'cross-dimension'
    | 'risk-assessment'
    | 'strategic-recommendations'
    | 'data-visualization';
  analysis?: DimensionAnalysis;
  charts?: ReportChart[];
}

// ★ 生成目录结构（v2.0 增强）
function generateToc(report: TopicReport): TocItem[] {
  const items: TocItem[] = [];

  // 1. 执行摘要（v2.0 新增，最重要）
  if (report.executiveSummaryV2?.fullText || report.executiveSummary) {
    items.push({
      id: 'executive-summary',
      title: '执行摘要',
      type: 'executive-summary',
    });
  }

  // 2. 概览（如果有标题或摘要）
  if (report.title || report.summary) {
    items.push({ id: 'overview', title: '研究概览', type: 'overview' });
  }

  // 3. 核心发现
  if (report.highlights && report.highlights.length > 0) {
    const validHighlights = report.highlights.filter(
      (h) => h.content && h.content.trim().length > 20
    );
    if (validHighlights.length > 0) {
      items.push({ id: 'highlights', title: '核心发现', type: 'highlights' });
    }
  }

  // 4. 维度分析
  if (report.dimensionAnalyses && report.dimensionAnalyses.length > 0) {
    report.dimensionAnalyses.forEach((analysis) => {
      const content = analysis.detailedContent || analysis.summary;
      if (content && content.trim().length > 20) {
        const title =
          analysis.dimension?.name || `维度 ${analysis.dimensionId}`;
        items.push({
          id: `dimension-${analysis.dimensionId}`,
          title,
          type: 'dimension',
          analysis,
        });
      }
    });
  }

  // 5. 跨维度关联分析（v2.0 新增）
  if (report.crossDimensionAnalysis?.fullText) {
    items.push({
      id: 'cross-dimension',
      title: '跨维度关联',
      type: 'cross-dimension',
    });
  }

  // 6. 风险评估（v2.0 新增）
  if (
    report.riskAssessment?.fullText ||
    report.riskAssessment?.riskMatrix?.length
  ) {
    items.push({
      id: 'risk-assessment',
      title: '风险评估',
      type: 'risk-assessment',
    });
  }

  // 7. 战略建议（v2.0 新增）
  if (report.strategicRecommendations?.fullText) {
    items.push({
      id: 'strategic-recommendations',
      title: '战略建议',
      type: 'strategic-recommendations',
    });
  }

  // 8. 数据可视化（v2.0 新增）
  if (report.charts && report.charts.length > 0) {
    items.push({
      id: 'data-visualization',
      title: '数据可视化',
      type: 'data-visualization',
      charts: report.charts,
    });
  }

  return items;
}

// ★ 辅助函数：将结构化执行摘要转为 Markdown
function formatExecutiveSummaryToMarkdown(es: {
  coreConclusions?: string[];
  keyMetrics?: Array<{ metric: string; value: string; source: string }>;
  riskAlerts?: string[];
  actionItems?: string[];
  fullText?: string;
}): string {
  const parts: string[] = [];

  // 核心结论
  const conclusions = es.coreConclusions;
  if (conclusions && conclusions.length > 0) {
    parts.push('## 核心结论\n\n');
    conclusions.forEach((c, i) => {
      parts.push(`${i + 1}. **${c}**\n`);
    });
    parts.push('\n');
  }

  // 关键数据
  const metrics = es.keyMetrics;
  if (metrics && metrics.length > 0) {
    parts.push('## 关键数据\n\n');
    parts.push('| 指标 | 数值 | 来源 |\n');
    parts.push('|------|------|------|\n');
    metrics.forEach((m) => {
      parts.push(`| ${m.metric} | ${m.value} | ${m.source} |\n`);
    });
    parts.push('\n');
  }

  // 风险提示
  const alerts = es.riskAlerts;
  if (alerts && alerts.length > 0) {
    parts.push('## 风险提示\n\n');
    alerts.forEach((r) => {
      parts.push(`- ${r}\n`);
    });
    parts.push('\n');
  }

  // 行动建议
  const actions = es.actionItems;
  if (actions && actions.length > 0) {
    parts.push('## 行动建议\n\n');
    actions.forEach((a) => {
      parts.push(`- ${a}\n`);
    });
    parts.push('\n');
  }

  return parts.join('') || es.fullText || '';
}

// ★ 生成单个章节内容（v2.0 增强）
function generateSectionContent(report: TopicReport, section: TocItem): string {
  // 1. 执行摘要（v2.0 新增）
  if (section.type === 'executive-summary') {
    // 优先使用 v2.0 结构化摘要
    if (report.executiveSummaryV2) {
      const result = formatExecutiveSummaryToMarkdown(
        report.executiveSummaryV2
      );
      return result || '暂无执行摘要';
    }

    // 兼容旧版：检测 executiveSummary 是否是 JSON 字符串
    if (report.executiveSummary) {
      const trimmed = report.executiveSummary.trim();
      // 检测是否为 JSON 格式
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          // 支持 { executiveSummary: {...} } 或直接 { coreConclusions: [...] } 格式
          const esData = parsed.executiveSummary || parsed;
          if (esData && (esData.coreConclusions || esData.keyMetrics)) {
            const result = formatExecutiveSummaryToMarkdown(esData);
            if (result) return result;
          }
        } catch {
          // 解析失败，作为普通文本处理
        }
      }
      // 非 JSON 或解析失败，直接返回原文本
      return report.executiveSummary;
    }

    return '暂无执行摘要';
  }

  // 2. 概览
  if (section.type === 'overview') {
    const parts: string[] = [];
    if (report.title) {
      parts.push(`# ${report.title}\n\n`);
    }
    if (report.summary) {
      parts.push(`${report.summary}\n\n`);
    }
    return parts.join('') || '暂无概览内容';
  }

  // 3. 核心发现
  if (section.type === 'highlights') {
    const parts: string[] = [];
    if (report.highlights && report.highlights.length > 0) {
      report.highlights
        .filter((h) => h.content && h.content.trim().length > 20)
        .forEach((h, idx) => {
          if (h.title) {
            parts.push(`### ${idx + 1}. ${h.title}\n\n${h.content}\n\n`);
          } else {
            parts.push(`${h.content}\n\n`);
          }
        });
    }
    return parts.join('') || '暂无核心发现';
  }

  // 4. 维度分析
  if (section.type === 'dimension' && section.analysis) {
    const content =
      section.analysis.detailedContent || section.analysis.summary;
    return content || '暂无此维度的分析内容';
  }

  // 5. 跨维度关联分析（v2.0 新增）
  if (section.type === 'cross-dimension' && report.crossDimensionAnalysis) {
    const cda = report.crossDimensionAnalysis;
    const parts: string[] = [];

    // 因果链
    if (cda.causalChains?.length > 0) {
      parts.push('## 因果关系链\n\n');
      cda.causalChains.forEach((chain, i) => {
        parts.push(`### ${i + 1}. ${chain.chain}\n\n`);
        parts.push(`${chain.explanation}\n\n`);
        parts.push(`**影响时间窗口**: ${chain.timeframe}\n\n`);
      });
    }

    // 关键联动点
    if (cda.keyLinkages?.length > 0) {
      parts.push('## 关键联动点\n\n');
      cda.keyLinkages.forEach((link, i) => {
        parts.push(
          `${i + 1}. **${link.dimensions.join(' ↔ ')}**: ${link.relationship}\n`
        );
        parts.push(`   - 影响程度: ${link.impact}\n\n`);
      });
    }

    return parts.join('') || cda.fullText || '暂无跨维度分析';
  }

  // 6. 风险评估（v2.0 新增）
  if (section.type === 'risk-assessment' && report.riskAssessment) {
    const ra = report.riskAssessment;
    const parts: string[] = [];

    // 风险矩阵表格
    if (ra.riskMatrix?.length > 0) {
      parts.push('## 风险矩阵\n\n');
      parts.push(
        '| 风险类型 | 发生概率 | 影响程度 | 时间窗口 | 预警指标 | 应对建议 |\n'
      );
      parts.push(
        '|----------|----------|----------|----------|----------|----------|\n'
      );
      ra.riskMatrix.forEach((risk) => {
        parts.push(
          `| ${risk.riskType} | ${risk.probability} | ${risk.impact} | ${risk.timeframe} | ${risk.indicators} | ${risk.mitigation} |\n`
        );
      });
      parts.push('\n');
    }

    return parts.join('') || ra.fullText || '暂无风险评估';
  }

  // 7. 战略建议（v2.0 新增）
  if (
    section.type === 'strategic-recommendations' &&
    report.strategicRecommendations
  ) {
    const sr = report.strategicRecommendations;
    const parts: string[] = [];

    // 对企业决策者
    if (sr.forEnterprise) {
      parts.push('## 对企业决策者\n\n');
      if (sr.forEnterprise.shortTerm?.length > 0) {
        parts.push('### 短期建议（6-12个月）\n\n');
        sr.forEnterprise.shortTerm.forEach((s) => {
          parts.push(`- ${s}\n`);
        });
        parts.push('\n');
      }
      if (sr.forEnterprise.midTerm?.length > 0) {
        parts.push('### 中期建议（1-3年）\n\n');
        sr.forEnterprise.midTerm.forEach((s) => {
          parts.push(`- ${s}\n`);
        });
        parts.push('\n');
      }
    }

    // 对投资者
    if (sr.forInvestors) {
      parts.push('## 对投资者\n\n');
      if (sr.forInvestors.opportunities?.length > 0) {
        parts.push('### 看好方向\n\n');
        sr.forInvestors.opportunities.forEach((s) => {
          parts.push(`- 🔥 ${s}\n`);
        });
        parts.push('\n');
      }
      if (sr.forInvestors.risks?.length > 0) {
        parts.push('### 警惕风险\n\n');
        sr.forInvestors.risks.forEach((s) => {
          parts.push(`- ⚠️ ${s}\n`);
        });
        parts.push('\n');
      }
    }

    // 对政策研究者
    if (sr.forPolicymakers?.keyObservations?.length > 0) {
      parts.push('## 对政策研究者\n\n');
      sr.forPolicymakers.keyObservations.forEach((s) => {
        parts.push(`- ${s}\n`);
      });
      parts.push('\n');
    }

    return parts.join('') || sr.fullText || '暂无战略建议';
  }

  // 8. 数据可视化章节（返回空字符串，由React组件单独渲染）
  if (section.type === 'data-visualization') {
    return ''; // 图表由 ChartsSectionRenderer 组件渲染
  }

  return '暂无内容';
}

// ★ 图表章节渲染组件
function ChartsSectionRenderer({ charts }: { charts: ReportChart[] }) {
  if (!charts || charts.length === 0) {
    return <p className="text-gray-500">暂无数据可视化图表</p>;
  }

  return (
    <div className="space-y-8">
      <p className="text-gray-600">
        本报告基于研究数据生成了 {charts.length}{' '}
        个可视化图表，帮助您更直观地理解研究发现。
      </p>
      {charts.map((chart) => (
        <ReportChartRenderer key={chart.id} chart={chart} />
      ))}
    </div>
  );
}

// ★ 生成完整报告内容（用于没有选中章节时的全文显示）
function generateFullReportContent(report: TopicReport): string {
  const parts: string[] = [];

  if (report.title) {
    parts.push(`# ${report.title}\n\n`);
  }

  if (report.summary) {
    parts.push(`## 摘要\n\n${report.summary}\n\n`);
  }

  if (report.highlights && report.highlights.length > 0) {
    const validHighlights = report.highlights.filter(
      (h) => h.content && h.content.trim().length > 20
    );
    if (validHighlights.length > 0) {
      parts.push(`## 核心发现\n\n`);
      validHighlights.forEach((h, idx) => {
        if (h.title) {
          parts.push(`### ${idx + 1}. ${h.title}\n\n${h.content}\n\n`);
        } else {
          parts.push(`${h.content}\n\n`);
        }
      });
    }
  }

  if (report.dimensionAnalyses && report.dimensionAnalyses.length > 0) {
    report.dimensionAnalyses.forEach((analysis) => {
      const content = analysis.detailedContent || analysis.summary;
      if (content && content.trim().length > 20) {
        const title =
          analysis.dimension?.name || `维度 ${analysis.dimensionId}`;
        parts.push(`## ${title}\n\n${content}\n\n`);
      }
    });
  }

  if (parts.length > 0) {
    return parts.join('');
  }

  return report.fullReport || report.executiveSummary || '暂无报告内容';
}

export default function SharedTopicPage() {
  const params = useParams();
  const topicId = params?.id as string;

  const [topic, setTopic] = useState<ResearchTopic | null>(null);
  const [report, setReport] = useState<TopicReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ★ 目录相关状态
  const [selectedSection, setSelectedSection] = useState<TocItem | null>(null);
  const [showToc, setShowToc] = useState(true);
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [readProgress, setReadProgress] = useState(0);

  // 生成目录
  const tocItems = useMemo(() => {
    if (!report) return [];
    return generateToc(report);
  }, [report]);

  // 当前章节索引
  const currentIndex = selectedSection
    ? tocItems.findIndex((item) => item.id === selectedSection.id)
    : -1;
  const prevSection = currentIndex > 0 ? tocItems[currentIndex - 1] : null;
  const nextSection =
    currentIndex < tocItems.length - 1 ? tocItems[currentIndex + 1] : null;

  // 滚动监听
  const handleScroll = useCallback(() => {
    const scrollTop = window.scrollY;
    const docHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    setReadProgress(Math.min(100, Math.round(progress)));
    setShowFloatingMenu(scrollTop > 200);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // 加载数据
  useEffect(() => {
    if (!topicId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [topicData, reportData] = await Promise.all([
          getSharedTopic(topicId),
          getSharedTopicLatestReport(topicId).catch(() => null),
        ]);

        setTopic(topicData);
        setReport(reportData);

        // 默认选中第一个章节
        if (reportData) {
          const toc = generateToc(reportData);
          if (toc.length > 0) {
            setSelectedSection(toc[0]);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : '无法加载专题，请检查链接是否正确'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [topicId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <LoaderIcon className="h-10 w-10 animate-spin text-blue-500" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-4 max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <AlertIcon className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h1 className="mb-2 text-xl font-semibold text-gray-900">
            无法访问此专题
          </h1>
          <p className="mb-6 text-gray-600">
            {error || '该专题不存在或未设置为公开'}
          </p>
          <a
            href="/"
            className="inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
          >
            返回首页
          </a>
        </div>
      </div>
    );
  }

  const typeConfig = topicTypeConfig[topic.type] || topicTypeConfig.MACRO;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header - offset by sidebar width on desktop */}
      <header className="sticky top-0 z-10 border-b border-blue-100 bg-white/80 backdrop-blur-sm md:ml-72">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowToc(!showToc)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 md:hidden"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full bg-gradient-to-r ${typeConfig.gradient} px-2 py-0.5 text-xs font-medium text-white`}
                >
                  {typeConfig.label}
                </span>
                <h1 className="text-lg font-bold text-gray-900">
                  {topic.name || '未命名专题'}
                </h1>
              </div>
              <p className="text-xs text-gray-500">
                {topic.totalSources || 0} 个来源 · v{report?.version || 1}
              </p>
            </div>
          </div>
          <Link
            href="/ai-research"
            className="flex items-center gap-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            <span>🔍</span>
            开始研究
          </Link>
        </div>
      </header>

      {/* Sidebar - Table of Contents */}
      <aside
        className={`fixed inset-y-0 left-0 z-20 w-72 transform border-r border-gray-100 bg-white pt-16 shadow-lg transition-transform ${
          showToc ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="h-full overflow-y-auto p-4">
          {/* Topic Info */}
          <div className="mb-4 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 p-3">
            <div
              className={`mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${typeConfig.gradient} text-white`}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">{topic.name}</h3>
            {topic.description && (
              <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                {topic.description}
              </p>
            )}
          </div>

          <h2 className="mb-3 text-sm font-semibold text-gray-700">目录</h2>
          <nav className="space-y-1">
            {tocItems.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedSection(item);
                  setShowToc(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedSection?.id === item.id
                    ? 'bg-blue-100 font-medium text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-gray-400">{idx + 1}.</span> {item.title}
              </button>
            ))}
          </nav>

          {/* Stats */}
          <div className="mt-6 border-t pt-4">
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg bg-gray-50 p-2">
                <div className="font-semibold text-gray-900">
                  {topic.totalReports || 0}
                </div>
                <div className="text-gray-500">份报告</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <div className="font-semibold text-gray-900">
                  {tocItems.filter((i) => i.type === 'dimension').length}
                </div>
                <div className="text-gray-500">个维度</div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {showToc && (
        <div
          className="fixed inset-0 z-10 bg-black/30 md:hidden"
          onClick={() => setShowToc(false)}
        />
      )}

      {/* Main Content */}
      <main className="min-h-screen px-4 py-8 md:ml-72 md:px-8">
        {report ? (
          <article className="mx-auto max-w-2xl">
            {/* Section Header */}
            <header className="mb-8 border-b border-gray-100 pb-6">
              <p className="mb-1 text-sm text-blue-600">
                {selectedSection
                  ? `第 ${currentIndex + 1} 节`
                  : `研究报告 v${report.version || 1}`}
              </p>
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedSection?.title || report.title || '研究报告'}
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                {report.generatedAt
                  ? new Date(report.generatedAt).toLocaleString('zh-CN')
                  : ''}
              </p>
            </header>

            {/* Content */}
            <div className="prose prose-gray prose-p:text-gray-700 prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-a:text-blue-600 prose-strong:text-gray-900 prose-li:text-gray-700 max-w-none">
              {selectedSection ? (
                selectedSection.type === 'data-visualization' &&
                selectedSection.charts ? (
                  <ChartsSectionRenderer charts={selectedSection.charts} />
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {generateSectionContent(report, selectedSection)}
                  </ReactMarkdown>
                )
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {generateFullReportContent(report)}
                </ReactMarkdown>
              )}
            </div>

            {/* Inline Charts for current section */}
            {selectedSection &&
              selectedSection.type !== 'data-visualization' &&
              report.charts &&
              report.charts.filter((c) => c.sectionId === selectedSection.id)
                .length > 0 && (
                <div className="mt-8 border-t border-gray-100 pt-8">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">
                    相关图表
                  </h3>
                  <div className="space-y-6">
                    {report.charts
                      .filter((c) => c.sectionId === selectedSection.id)
                      .map((chart) => (
                        <ReportChartRenderer key={chart.id} chart={chart} />
                      ))}
                  </div>
                </div>
              )}

            {/* Navigation */}
            <nav className="mt-12 flex items-center justify-between border-t border-gray-100 pt-6">
              {prevSection ? (
                <button
                  onClick={() => {
                    setSelectedSection(prevSection);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-100"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  上一节
                </button>
              ) : (
                <div />
              )}
              {nextSection ? (
                <button
                  onClick={() => {
                    setSelectedSection(nextSection);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
                >
                  下一节
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ) : (
                <div className="rounded-lg bg-green-100 px-4 py-2 text-sm text-green-700">
                  已读完全部内容
                </div>
              )}
            </nav>
          </article>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <span className="mb-4 text-5xl">📊</span>
            <p className="text-gray-500">该专题暂无研究报告</p>
          </div>
        )}
      </main>

      {/* Floating Menu */}
      <div
        className={`fixed bottom-6 left-1/2 z-30 -translate-x-1/2 transform transition-all duration-300 md:left-[calc(50%+9rem)] ${
          showFloatingMenu
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-10 opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-2 shadow-lg backdrop-blur-sm">
          {/* Toggle TOC */}
          <button
            onClick={() => setShowToc(!showToc)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            title="目录"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
          </button>

          <div className="h-6 w-px bg-gray-200" />

          {/* Previous Section */}
          <button
            onClick={() => {
              if (prevSection) {
                setSelectedSection(prevSection);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            disabled={!prevSection}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
            title="上一节"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {/* Progress Indicator */}
          <div className="flex min-w-[100px] flex-col items-center px-2">
            <span className="text-xs font-medium text-gray-700">
              {selectedSection ? `第${currentIndex + 1}节` : '选择章节'}
            </span>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${readProgress}%` }}
              />
            </div>
            <span className="mt-0.5 text-[10px] text-gray-400">
              {currentIndex + 1}/{tocItems.length} · {readProgress}%
            </span>
          </div>

          {/* Next Section */}
          <button
            onClick={() => {
              if (nextSection) {
                setSelectedSection(nextSection);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            disabled={!nextSection}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
            title="下一节"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <div className="h-6 w-px bg-gray-200" />

          {/* Scroll to Top */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            title="回到顶部"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white py-6 md:ml-72">
        <div className="mx-auto max-w-4xl px-4 text-center text-sm text-gray-400">
          <p>
            由{' '}
            <Link href="/" className="text-blue-600 hover:underline">
              DeepDive Engine
            </Link>{' '}
            生成
          </p>
        </div>
      </footer>
    </div>
  );
}
