'use client';

/**
 * Report Reading Page
 *
 * 报告阅读页面 - 左侧目录 + 右侧内容布局
 * 需要登录，根据专题visibility权限访问
 */

import { useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getTopic, getLatestReport } from '@/lib/api/topic-research';
import type { ResearchTopic, TopicReport } from '@/types/topic-research';

// Helper to safely extract text from React children
function getTextFromChildren(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    return children.map(getTextFromChildren).join('');
  }
  if (children && typeof children === 'object' && 'props' in children) {
    return getTextFromChildren(
      (children as { props: { children?: ReactNode } }).props.children
    );
  }
  return '';
}

// Interface for structured report content
interface StructuredReport {
  preface?: string;
  tableOfContents?: string;
  executiveSummary?: string;
  sections?: Array<{
    sectionNumber?: string;
    title?: string;
    content?: string;
    coreViewpoints?: string[];
    keyData?: Array<{ data?: string; source?: string }>;
  }>;
}

// Helper to safely get string content from report
function getReportContent(report: TopicReport | null): string {
  if (!report) return '';

  // Handle fullReport
  if (report.fullReport) {
    // If it's already a string (plain markdown)
    if (typeof report.fullReport === 'string') {
      // Check if it looks like JSON
      const trimmed = report.fullReport.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed) as StructuredReport;
          return extractMarkdownFromStructuredReport(parsed);
        } catch {
          // Not valid JSON, return as-is
          return report.fullReport;
        }
      }
      return report.fullReport;
    }

    // If it's an object (structured report)
    if (typeof report.fullReport === 'object') {
      return extractMarkdownFromStructuredReport(
        report.fullReport as StructuredReport
      );
    }
  }

  // Fallback to executiveSummary
  if (report.executiveSummary && typeof report.executiveSummary === 'string') {
    return report.executiveSummary;
  }

  return '暂无报告内容';
}

// Extract markdown content from structured report JSON
function extractMarkdownFromStructuredReport(data: StructuredReport): string {
  const parts: string[] = [];

  // Add preface
  if (data.preface && typeof data.preface === 'string') {
    parts.push(data.preface);
  }

  // Add executive summary
  if (data.executiveSummary && typeof data.executiveSummary === 'string') {
    parts.push('## 执行摘要\n\n' + data.executiveSummary);
  }

  // Add sections
  if (Array.isArray(data.sections)) {
    for (const section of data.sections) {
      if (section.content && typeof section.content === 'string') {
        // Add section title if content doesn't start with a heading
        if (
          section.title &&
          !section.content.trim().startsWith('#') &&
          !section.content.trim().startsWith('##')
        ) {
          parts.push(
            `## ${section.sectionNumber || ''}. ${section.title}\n\n${section.content}`
          );
        } else {
          parts.push(section.content);
        }
      }
    }
  }

  return parts.join('\n\n---\n\n');
}

// 从Markdown中提取目录
interface TocItem {
  id: string;
  title: string;
  level: number;
}

function extractTocFromMarkdown(markdown: string): TocItem[] {
  const lines = markdown.split('\n');
  const toc: TocItem[] = [];

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim();
      // 生成唯一ID
      const id = `section-${index}-${title
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .slice(0, 30)}`;
      toc.push({ id, title, level });
    }
  });

  return toc;
}

export default function ReportReadingPage() {
  const params = useParams();
  const topicId = params.topicId as string;

  const [topic, setTopic] = useState<ResearchTopic | null>(null);
  const [report, setReport] = useState<TopicReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToc, setShowToc] = useState(true);
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // 获取报告内容
  const reportContent = useMemo(() => getReportContent(report), [report]);

  // 从报告内容提取目录
  const toc = useMemo(() => {
    if (!reportContent) return [];
    return extractTocFromMarkdown(reportContent);
  }, [reportContent]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const scrollTop = window.scrollY;
    const docHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    setReadProgress(Math.min(100, Math.round(progress)));
    setShowFloatingMenu(scrollTop > 200);

    // 更新当前活动章节
    const sections = document.querySelectorAll('[data-section-id]');
    let currentSection: string | null = null;
    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= 100) {
        currentSection = section.getAttribute('data-section-id');
      }
    });
    if (currentSection) {
      setActiveSection(currentSection);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // 获取数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [topicData, reportData] = await Promise.all([
          getTopic(topicId),
          getLatestReport(topicId).catch(() => null),
        ]);
        setTopic(topicData);
        setReport(reportData);
      } catch (err) {
        if (err instanceof Error) {
          if (
            err.message.includes('permission') ||
            err.message.includes('403')
          ) {
            setError('您没有权限访问此专题');
          } else if (
            err.message.includes('not found') ||
            err.message.includes('404')
          ) {
            setError('专题不存在');
          } else {
            setError('加载失败，请稍后重试');
          }
        } else {
          setError('加载失败');
        }
      } finally {
        setLoading(false);
      }
    };

    if (topicId) {
      void fetchData();
    }
  }, [topicId]);

  // 滚动到指定章节
  const scrollToSection = (sectionId: string) => {
    const element = document.querySelector(`[data-section-id="${sectionId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setShowToc(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <span className="mb-4 text-6xl">📊</span>
        <h1 className="mb-2 text-xl font-semibold text-gray-800">
          {error || '专题不存在'}
        </h1>
        <p className="mb-6 text-gray-500">请检查链接或登录后重试</p>
        <Link
          href="/ai-research"
          className="rounded-lg bg-blue-500 px-6 py-2 text-white hover:bg-blue-600"
        >
          返回研究中心
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
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
              <h1 className="text-lg font-bold text-gray-900">{topic.name}</h1>
              <p className="text-xs text-gray-500">
                {report?.totalSources || 0} 个来源 · 版本 {report?.version || 1}
              </p>
            </div>
          </div>
          <Link
            href={`/ai-research?topicId=${topicId}`}
            className="flex items-center gap-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            <span>🔬</span>
            查看详情
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
          <h2 className="mb-4 text-sm font-semibold text-gray-700">报告目录</h2>
          <nav className="space-y-1">
            {toc.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  activeSection === item.id
                    ? 'bg-blue-100 font-medium text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                style={{ paddingLeft: `${(item.level - 1) * 12 + 12}px` }}
              >
                {item.title}
              </button>
            ))}
            {toc.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">暂无目录</p>
            )}
          </nav>
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
          <article className="mx-auto max-w-3xl">
            {/* Report Header */}
            <header className="mb-8 border-b border-gray-100 pb-6">
              <h2 className="text-2xl font-bold text-gray-900">研究报告</h2>
              <p className="mt-2 text-sm text-gray-500">
                生成于{' '}
                {report.generatedAt
                  ? new Date(report.generatedAt).toLocaleString('zh-CN')
                  : '未知时间'}
              </p>
              {topic.description && (
                <p className="mt-3 text-gray-600">{topic.description}</p>
              )}
            </header>

            {/* Report Content */}
            <div className="prose prose-gray prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-gray-700 prose-p:leading-relaxed prose-a:text-blue-600 prose-strong:text-gray-900 prose-li:text-gray-700 max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // 为标题添加data-section-id
                  h1: ({ children, ...props }) => {
                    const text = getTextFromChildren(children);
                    const id = `section-h1-${text
                      .toLowerCase()
                      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
                      .slice(0, 30)}`;
                    return (
                      <h1 data-section-id={id} {...props}>
                        {children}
                      </h1>
                    );
                  },
                  h2: ({ children, ...props }) => {
                    const text = getTextFromChildren(children);
                    const id = `section-h2-${text
                      .toLowerCase()
                      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
                      .slice(0, 30)}`;
                    return (
                      <h2 data-section-id={id} {...props}>
                        {children}
                      </h2>
                    );
                  },
                  h3: ({ children, ...props }) => {
                    const text = getTextFromChildren(children);
                    const id = `section-h3-${text
                      .toLowerCase()
                      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
                      .slice(0, 30)}`;
                    return (
                      <h3 data-section-id={id} {...props}>
                        {children}
                      </h3>
                    );
                  },
                }}
              >
                {reportContent}
              </ReactMarkdown>
            </div>
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
        className={`fixed bottom-6 left-1/2 z-30 -translate-x-1/2 transform transition-all duration-300 ${
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

          {/* Progress Indicator */}
          <div className="flex min-w-[80px] flex-col items-center px-2">
            <span className="text-xs font-medium text-gray-700">阅读进度</span>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${readProgress}%` }}
              />
            </div>
            <span className="mt-0.5 text-[10px] text-gray-400">
              {readProgress}%
            </span>
          </div>

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
        <div className="mx-auto max-w-3xl px-4 text-center text-sm text-gray-400">
          <p>由 DeepDive Engine 生成</p>
        </div>
      </footer>
    </div>
  );
}
