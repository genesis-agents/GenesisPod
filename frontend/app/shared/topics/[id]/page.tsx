'use client';

/**
 * Shared Topic Page
 *
 * 公开分享的专题页面（无需登录）
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getSharedTopic,
  getSharedTopicLatestReport,
} from '@/lib/api/topic-research';
import type { ResearchTopic, TopicReport } from '@/types/topic-research';
import { ResearchTopicType } from '@/types/topic-research';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  { gradient: string; label: string }
> = {
  [ResearchTopicType.MACRO]: {
    gradient: 'from-blue-500 to-cyan-600',
    label: '宏观洞察',
  },
  [ResearchTopicType.TECHNOLOGY]: {
    gradient: 'from-purple-500 to-pink-600',
    label: '技术趋势',
  },
  [ResearchTopicType.COMPANY]: {
    gradient: 'from-emerald-500 to-teal-600',
    label: '企业追踪',
  },
};

export default function SharedTopicPage() {
  const params = useParams();
  const topicId = params?.id as string;

  const [topic, setTopic] = useState<ResearchTopic | null>(null);
  const [report, setReport] = useState<TopicReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topicId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch topic and report in parallel
        const [topicData, reportData] = await Promise.all([
          getSharedTopic(topicId),
          getSharedTopicLatestReport(topicId).catch(() => null),
        ]);

        setTopic(topicData);
        setReport(reportData);
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${typeConfig.gradient} text-white shadow-md`}
            >
              <svg
                className="h-7 w-7"
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
            <div className="flex-1">
              <span className="mb-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {typeConfig.label}
              </span>
              <h1 className="text-2xl font-bold text-gray-900">{topic.name}</h1>
              {topic.description && (
                <p className="mt-1 text-gray-600">{topic.description}</p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 flex items-center gap-6 text-sm text-gray-500">
            <span>{topic.totalReports || 0} 份报告</span>
            <span>{topic.totalSources || 0} 个来源</span>
            {report?.generatedAt && (
              <span>
                最后更新:{' '}
                {new Date(report.generatedAt).toLocaleDateString('zh-CN')}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        {report ? (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            {/* Report Header */}
            <div className="mb-6 border-b pb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                研究报告 v{report.version || 1}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                生成于{' '}
                {report.generatedAt
                  ? new Date(report.generatedAt).toLocaleString('zh-CN')
                  : '未知时间'}
              </p>
            </div>

            {/* Report Content */}
            <article className="prose prose-gray prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-gray-700 prose-a:text-blue-600 prose-strong:text-gray-900 max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.fullReport || report.executiveSummary || '暂无报告内容'}
              </ReactMarkdown>
            </article>
          </div>
        ) : (
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">该专题暂无研究报告</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-400">
          <p>由 DeepDive Engine 生成</p>
        </div>
      </main>
    </div>
  );
}
