'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): Custom Agent 编辑页
 *
 * 加载现有 agent → 5 步向导 edit 模式（slug 不可改）。
 */
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { CustomAgentWizard } from '@/components/custom-agents/CustomAgentWizard';
import type { CustomAgentRecord } from '@/components/custom-agents/types';

export default function EditCustomAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [record, setRecord] = useState<CustomAgentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href="/custom-agents"
        className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-3 w-3" /> 返回列表
      </Link>
      <h1 className="mb-2 text-2xl font-semibold">
        编辑自定义 Agent
        {record && (
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({record.slug} · v{record.version} · {record.status})
          </span>
        )}
      </h1>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          加载中...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : record ? (
        <CustomAgentWizard initial={record} />
      ) : null}
    </div>
  );
}
