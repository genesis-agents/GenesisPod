'use client';

import { useState, useCallback } from 'react';
import { X, BookOpen, Loader2, Check, ExternalLink } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';

interface SedimentToInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  outputId: string;
  outputTitle: string;
  outputContent?: string;
}

interface TopicItem {
  id: string;
  name: string;
  type: string;
}

type Mode = 'add_dimension' | 'new_topic';

interface SedimentResult {
  viewUrl: string;
  topicName?: string;
  dimensionName: string;
}

export function SedimentToInsightsModal({
  isOpen,
  onClose,
  projectId,
  outputId,
  outputTitle,
  outputContent,
}: SedimentToInsightsModalProps) {
  const [mode, setMode] = useState<Mode>('add_dimension');
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [dimensionName, setDimensionName] = useState(outputTitle.slice(0, 200));
  const [dimensionDescription, setDimensionDescription] = useState(
    outputContent?.slice(0, 300) ?? ''
  );
  const [topicName, setTopicName] = useState(outputTitle.slice(0, 200));
  const [topicType, setTopicType] = useState('MACRO_INSIGHT');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SedimentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    setTopicsLoading(true);
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/topic-insights/topics?take=20`,
        { headers: getAuthHeader() }
      );
      if (!response.ok) throw new Error('Failed to fetch topics');
      const data = (await response.json()) as {
        data?: { topics?: TopicItem[] };
        topics?: TopicItem[];
      };
      const topicsArr = data.data?.topics ?? data.topics ?? [];
      setTopics(topicsArr);
    } catch (err) {
      logger.error('[SedimentToInsightsModal] fetchTopics error:', err);
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  const handleModeChange = useCallback(
    (newMode: Mode) => {
      setMode(newMode);
      if (newMode === 'add_dimension' && topics.length === 0) {
        void fetchTopics();
      }
    },
    [topics.length, fetchTopics]
  );

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, string | undefined> = {
        outputId,
        mode,
        ...(mode === 'add_dimension'
          ? {
              targetTopicId: selectedTopicId || undefined,
              dimensionName: dimensionName || undefined,
              dimensionDescription: dimensionDescription || undefined,
            }
          : {
              topicName: topicName || undefined,
              topicType,
              topicDescription: dimensionDescription || undefined,
              dimensionName: dimensionName || undefined,
            }),
      };

      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-studio/projects/${projectId}/sediment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errData = (await response.json()) as { message?: string };
        throw new Error(errData.message ?? '沉淀失败');
      }

      const data = (await response.json()) as {
        result?: {
          viewUrl?: string;
          topicName?: string;
          dimensionName?: string;
        };
      };
      const r = data.result;
      setResult({
        viewUrl: r?.viewUrl ?? '/ai-insights',
        topicName: r?.topicName,
        dimensionName: r?.dimensionName ?? dimensionName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '沉淀失败';
      logger.error('[SedimentToInsightsModal] submit error:', err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Fetch topics on open if not already loaded
  if (topics.length === 0 && !topicsLoading && mode === 'add_dimension') {
    void fetchTopics();
  }

  // Success state
  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">沉淀成功</h3>
            <p className="text-center text-sm text-gray-600">
              已将「{result.dimensionName}」添加到 AI 洞察
              {result.topicName && `「${result.topicName}」`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                关闭
              </button>
              <a
                href={result.viewUrl}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <ExternalLink className="h-4 w-4" />
                查看洞察
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">沉淀到洞察</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              onClick={() => handleModeChange('add_dimension')}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                mode === 'add_dimension'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              添加到已有专题
            </button>
            <button
              onClick={() => handleModeChange('new_topic')}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                mode === 'new_topic'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              新建专题
            </button>
          </div>

          {mode === 'add_dimension' ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  目标专题
                </label>
                {topicsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载中...
                  </div>
                ) : (
                  <select
                    value={selectedTopicId}
                    onChange={(e) => setSelectedTopicId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">请选择专题...</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  维度名称
                </label>
                <input
                  value={dimensionName}
                  onChange={(e) => setDimensionName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="输入维度名称..."
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  专题名称
                </label>
                <input
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="输入专题名称..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  专题类型
                </label>
                <select
                  value={topicType}
                  onChange={(e) => setTopicType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="MACRO_INSIGHT">宏观洞察</option>
                  <option value="INDUSTRY_RESEARCH">行业研究</option>
                  <option value="TECHNOLOGY_WATCH">技术追踪</option>
                  <option value="COMPANY_MONITOR">企业监测</option>
                  <option value="COMPETITIVE_INTEL">竞争情报</option>
                  <option value="CUSTOM">自定义</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              描述（摘自研究内容）
            </label>
            <textarea
              value={dimensionDescription}
              onChange={(e) => setDimensionDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="描述内容..."
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={
              submitting || (mode === 'add_dimension' && !selectedTopicId)
            }
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            确认沉淀
          </button>
        </div>
      </div>
    </div>
  );
}
