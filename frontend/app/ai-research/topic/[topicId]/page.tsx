'use client';

/**
 * AI Research - Topic Detail Page
 * 专题研究详情页面 - 直接路径访问
 *
 * 路由: /ai-research/topic/[topicId]
 * 用于分享链接直接跳转到报告
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getAuthTokens } from '@/lib/utils/auth';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import { TopicDetail } from '@/components/ai-research';
import type { ResearchTopic } from '@/types/topic-research';
import * as api from '@/lib/api/topic-research';

import { logger } from '@/lib/utils/logger';
export default function TopicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicId = params?.topicId as string;

  // ★ 读取 view 参数（用于直接跳转到报告视图）
  const viewParam = searchParams?.get('view');

  const [topic, setTopic] = useState<ResearchTopic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check authentication
  useEffect(() => {
    const tokens = getAuthTokens();
    if (!tokens?.accessToken) {
      router.push('/login');
    }
  }, [router]);

  // Load topic data
  const loadTopic = useCallback(async () => {
    if (!topicId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await api.getTopic(topicId);
      setTopic(data);
    } catch (err) {
      logger.error('Failed to load topic:', err);
      setError(err instanceof Error ? err.message : '加载专题失败');
    } finally {
      setIsLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    loadTopic();
  }, [loadTopic]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    router.push('/ai-research?tab=topic');
  }, [router]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="border-3 h-10 w-10 animate-spin rounded-full border-gray-300 border-t-violet-600" />
          <p className="text-sm text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !topic) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-50">
        <div className="rounded-xl bg-white p-8 text-center shadow-lg">
          <div className="mb-4 text-5xl">😕</div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            {error || '未找到该专题'}
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            专题可能已被删除或您没有访问权限
          </p>
          <button
            onClick={handleBack}
            className="rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            返回专题列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden">
      <TopicDetail topic={topic} onBack={handleBack} initialView={viewParam} />
    </div>
  );
}
