'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PublicReport {
  id: string;
  title: string;
  description: string;
  status: string;
  leader: string;
  createdAt: string;
  completedAt: string | null;
  fullContent: string;
  taskCount: number;
  totalWords: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Fix markdown table formatting
function fixMarkdownTables(content: string): string {
  return content.replace(
    /\|([^|\n]+)\|([^|\n]+)\|/g,
    (match, col1, col2) => `| ${col1.trim()} | ${col2.trim()} |`
  );
}

export default function PublicReportPage() {
  const params = useParams();
  const missionId = params?.missionId as string;

  const [report, setReport] = useState<PublicReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(-1); // -1 = View All

  useEffect(() => {
    if (!missionId) return;

    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${API_BASE}/api/v1/public/reports/${missionId}`
        );
        const data = await response.json();
        if (data.success && data.report) {
          setReport(data.report);
        } else {
          setError(data.message || '无法加载报告');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [missionId]);

  // Split content into chapters
  const chapters = useMemo(() => {
    if (!report?.fullContent) return [];

    const chapterPattern =
      /卷[一二三四五六七八九十百\d]+|第[一二三四五六七八九十百千\d]+[章节回]|Chapter\s*\d+/i;
    const chapterRegex =
      /(?=^##\s+(?:卷[一二三四五六七八九十百\d]+|第[一二三四五六七八九十百千\d]+[章节回]|Chapter\s*\d+))/gim;
    const parts = report.fullContent.split(chapterRegex).filter(Boolean);

    const chapterParts = parts.filter((part) => {
      const firstLine = part
        .split('\n')[0]
        .replace(/^#+\s*/, '')
        .trim();
      return chapterPattern.test(firstLine);
    });

    if (chapterParts.length === 0) {
      return [{ title: '完整报告', content: report.fullContent }];
    }

    return chapterParts.map((content, idx) => {
      const firstLine = content
        .split('\n')[0]
        .replace(/^#+\s*/, '')
        .trim();
      return {
        title: firstLine || `第 ${idx + 1} 章`,
        content: content.trim(),
      };
    });
  }, [report?.fullContent]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 animate-spin text-green-500"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="mt-4 text-gray-600">正在加载报告...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-500"
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
          </div>
          <h2 className="mt-4 text-xl font-semibold text-gray-800">
            无法加载报告
          </h2>
          <p className="mt-2 text-gray-500">
            {error || '报告不存在或已被删除'}
          </p>
          <a
            href="/"
            className="mt-6 inline-block rounded-lg bg-green-500 px-6 py-2 text-white transition-colors hover:bg-green-600"
          >
            返回首页
          </a>
        </div>
      </div>
    );
  }

  const displayContent =
    currentPage === -1
      ? report.fullContent
      : chapters[currentPage]?.content || report.fullContent;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                {report.title}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {report.taskCount} 章节 | {report.totalWords.toLocaleString()}{' '}
                字 | 负责人: {report.leader}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                已完成
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Chapter Navigation */}
      {chapters.length > 1 && (
        <div className="sticky top-[73px] z-40 border-b border-gray-200 bg-gray-50">
          <div className="mx-auto max-w-5xl px-4">
            <div className="flex items-center gap-2 overflow-x-auto py-3">
              <button
                onClick={() => setCurrentPage(-1)}
                className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  currentPage === -1
                    ? 'bg-green-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                全部
              </button>
              <div className="h-6 w-px bg-gray-300" />
              {chapters.map((chapter, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPage(idx)}
                  title={chapter.title}
                  className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    currentPage === idx
                      ? 'bg-green-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  第{idx + 1}章
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        <article className="rounded-xl bg-white p-8 shadow-sm">
          <div className="prose prose-lg prose-headings:text-gray-800 prose-p:text-gray-600 prose-li:text-gray-600 prose-strong:text-gray-800 prose-table:w-full prose-th:bg-gray-100 prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-gray-700 prose-td:px-4 prose-td:py-2 prose-td:text-gray-600 prose-tr:border-b prose-tr:border-gray-200 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {fixMarkdownTables(displayContent)}
            </ReactMarkdown>
          </div>
        </article>

        {/* Pagination */}
        {chapters.length > 1 && currentPage !== -1 && (
          <div className="mt-6 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
            <button
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
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
              上一章
            </button>
            <span className="text-sm text-gray-500">
              {currentPage + 1} / {chapters.length}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(chapters.length - 1, p + 1))
              }
              disabled={currentPage === chapters.length - 1}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一章
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
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-gray-500">
          <p>
            报告完成于{' '}
            {report.completedAt
              ? new Date(report.completedAt).toLocaleString('zh-CN')
              : '未知时间'}
          </p>
          <p className="mt-1">Powered by AI Teams</p>
        </div>
      </footer>
    </div>
  );
}
