'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): Custom Agent 列表页
 *
 * 我的所有 custom agent（DRAFT / PUBLISHED）+ 新建入口。
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Play } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import type { CustomAgentRecord } from '@/components/custom-agents/types';

export default function CustomAgentsListPage() {
  const [items, setItems] = useState<CustomAgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiClient
      .get<CustomAgentRecord[]>('/user/custom-agents')
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm('确认删除？此操作不可恢复。')) return;
    try {
      await apiClient.delete(`/user/custom-agents/${id}`);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">自定义 Agent</h1>
          <p className="mt-1 text-sm text-gray-500">
            创建属于你的 agent，配置话题维度、技能、流水线和集成
          </p>
        </div>
        <Link
          href="/custom-agents/new"
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> 创建
        </Link>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          加载中...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="mb-3 text-sm text-gray-500">还没有自定义 agent。</p>
          <Link
            href="/custom-agents/new"
            className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> 创建第一个
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">名称</th>
                <th className="px-4 py-2 text-left">Slug</th>
                <th className="px-4 py-2 text-left">状态</th>
                <th className="px-4 py-2 text-left">版本</th>
                <th className="px-4 py-2 text-left">更新时间</th>
                <th className="px-4 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {it.displayName}
                    {it.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                        {it.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                      {it.slug}
                    </code>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-xs ${
                        it.status === 'PUBLISHED'
                          ? 'bg-green-100 text-green-700'
                          : it.status === 'ARCHIVED'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {it.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    v{it.version}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(it.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {it.status === 'PUBLISHED' && (
                      <Link
                        href={`/custom-agents/${it.id}/run`}
                        className="mr-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                        title="启动 mission"
                      >
                        <Play className="h-3 w-3" /> 启动
                      </Link>
                    )}
                    <Link
                      href={`/custom-agents/${it.id}`}
                      className="mr-2 inline-flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900"
                    >
                      <Pencil className="h-3 w-3" /> 编辑
                    </Link>
                    <button
                      onClick={() => remove(it.id)}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-3 w-3" /> 删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
