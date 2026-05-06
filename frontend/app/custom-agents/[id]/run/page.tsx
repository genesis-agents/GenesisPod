'use client';

/**
 * E R4 Phase 2 (PR-E3, 2026-05-05): 用 Custom Agent 启动 mission
 *
 * 流程：
 *   1. 输入 topic + 可选 override
 *   2. POST /user/custom-agents/:id/translate → 拿 RunMissionInput
 *   3. POST /agent-playground/team/run → 启动 mission
 *   4. 跳转到 /agent-playground/missions/:missionId
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Play } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { launchCustomAgentMission } from '@/services/custom-agents/api';
import type { CustomAgentRecord } from '@/components/custom-agents/types';

export default function RunCustomAgentPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  // Next.js 14：params 是同步对象，直接取 id（详见 [id]/page.tsx 注释）
  const { id } = params;
  const [record, setRecord] = useState<CustomAgentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiClient
      .get<CustomAgentRecord>(`/user/custom-agents/${id}`)
      .then((data) => {
        setRecord(data);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const launch = async () => {
    if (!record) return;
    if (topic.trim().length < 2) {
      setError('topic 至少 2 个字符');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // ★ 2026-05-05 R-CA: 一站式 /launch endpoint（translate + 启动 + 写 launch 行）
      //   旧的两步 API（/translate + /agent-playground/team/run）不会写 launches 表，
      //   导致 agent 主页 mission 历史拉不到。
      const launched = await launchCustomAgentMission(id, { topic });
      // 启动后跳回 agent 主页（mission 详情通过 agent 主页卡片点击进入）
      router.push(`/custom-agents/${id}?lastMission=${launched.missionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-sm text-gray-500">加载中...</p>
      </div>
    );
  }
  if (error && !record) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }
  if (!record) return null;

  if (record.status !== 'PUBLISHED') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Link
          href="/custom-agents"
          className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-3 w-3" /> 返回列表
        </Link>
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          该 agent 当前状态为 <code>{record.status}</code>，必须先 publish
          才能启动 mission。
          <Link
            href={`/custom-agents/${record.id}`}
            className="ml-2 underline hover:opacity-80"
          >
            去编辑发布
          </Link>
        </div>
      </div>
    );
  }

  const config = record.config;
  const purpose = config.basicInfo?.purpose;
  const goal = config.topicSchema?.goalTemplate;
  const dims = config.topicSchema?.dimensions ?? [];

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/custom-agents"
        className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-3 w-3" /> 返回列表
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">{record.displayName}</h1>
      <p className="mb-6 text-sm text-gray-500">
        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
          {record.slug}
        </code>{' '}
        · v{record.version}
      </p>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 space-y-2 border-b border-gray-100 pb-4 text-sm">
          {purpose && (
            <div>
              <span className="text-xs text-gray-500">用途：</span>
              <span className="text-gray-900">{purpose}</span>
            </div>
          )}
          {goal && (
            <div>
              <span className="text-xs text-gray-500">目标模板：</span>
              <span className="text-gray-700">{goal}</span>
            </div>
          )}
          {dims.length > 0 && (
            <div>
              <span className="text-xs text-gray-500">
                维度（{dims.length}）：
              </span>
              <span className="text-gray-700">
                {dims.map((d) => d.name).join(' / ')}
              </span>
            </div>
          )}
          <div className="text-xs text-gray-500">
            depth: {config.integration?.defaultDepth ?? 'deep'} · length:{' '}
            {config.integration?.defaultLength ?? 'standard'} · budget:{' '}
            {config.integration?.defaultBudget ?? 'medium'}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">研究主题 *</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="例如：2026 中国新能源车出海机会分析"
          />
          {goal && (
            <p className="mt-1 text-xs text-gray-500">
              启动时 topic 会自动拼接为："{topic.trim() || '{你的主题}'}（聚焦：
              {goal}）"
            </p>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={launch}
            disabled={submitting || topic.trim().length < 2}
            className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {submitting ? '启动中...' : '启动 Mission'}
          </button>
        </div>
      </div>
    </div>
  );
}
