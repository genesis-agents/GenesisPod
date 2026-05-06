'use client';

/**
 * E R4 Phase 2 (PR-E2 / 2026-05-05): 我的 Agent tab
 *
 * 嵌入 /me/ai?tab=agents。点"创建 / 编辑"在 tab 内 inline 切换显示
 * 创建/编辑表单（不跳路由 / 不弹 Modal），sidebar + 顶层 tabs 持续显示，
 * 配色与 /me/ai 主框架统一。
 */
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Play, ChevronLeft } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { CustomAgentWizard } from './CustomAgentWizard';
import type { CustomAgentRecord } from './types';

type ViewMode =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; record: CustomAgentRecord };

export function MyAgentsTab() {
  const [items, setItems] = useState<CustomAgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>({ mode: 'list' });

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
    if (view.mode === 'list') load();
  }, [view.mode]);

  const remove = async (id: string) => {
    if (!confirm('确认删除？此操作不可恢复。')) return;
    try {
      await apiClient.delete(`/user/custom-agents/${id}`);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  const backToList = () => setView({ mode: 'list' });

  // ─── 创建 / 编辑视图（在 tab 内显示，不跳页 / 不弹 Modal） ───
  if (view.mode === 'create' || view.mode === 'edit') {
    const isEdit = view.mode === 'edit';
    const initial = isEdit ? view.record : undefined;
    return (
      <div>
        <button
          type="button"
          onClick={backToList}
          className="mb-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-3 w-3" /> 返回我的 Agent 列表
        </button>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? '编辑自定义 Agent' : '创建自定义 Agent'}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {isEdit
              ? `${initial!.slug} · v${initial!.version} · ${initial!.status}`
              : '通过 5 步向导配置一个属于你的 agent：基础信息 → 话题维度 → 技能 → 流水线 → 集成 → 复核发布'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <CustomAgentWizard initial={initial} onClose={backToList} />
        </div>
      </div>
    );
  }

  // ─── 列表视图 ───
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          创建属于你的 agent，配置话题维度、技能、流水线和集成
        </p>
        <button
          type="button"
          onClick={() => setView({ mode: 'create' })}
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> 创建
        </button>
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
          <p className="mb-3 text-sm text-gray-500">还没有自己的 agent。</p>
          <button
            type="button"
            onClick={() => setView({ mode: 'create' })}
            className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> 创建第一个
          </button>
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
                      <a
                        href={`/custom-agents/${it.id}`}
                        className="mr-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                        title="打开 agent 主页 + 历史 mission"
                      >
                        <Play className="h-3 w-3" /> 打开
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setView({ mode: 'edit', record: it })}
                      className="mr-2 inline-flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900"
                    >
                      <Pencil className="h-3 w-3" /> 编辑
                    </button>
                    <button
                      type="button"
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
