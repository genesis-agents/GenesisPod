'use client';

/**
 * E R4 Phase 2 (PR-E2 / 2026-05-05): 我的 Agent tab
 *
 * 嵌入 /me/ai?tab=agents。点"创建 / 编辑"在 tab 内 inline 切换显示
 * 创建/编辑表单（不跳路由 / 不弹 Modal），sidebar + 顶层 tabs 持续显示，
 * 配色与 /me/ai 主框架统一。
 */
import { useEffect, useState } from 'react';
import { Plus, ChevronLeft, Bot, Hash } from 'lucide-react';
import { AssetCard } from '@/components/common/asset-card';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { CustomAgentWizard } from './CustomAgentWizard';
import { notifyCustomAgentChanged } from './usePublishedCustomAgents';
import type { CustomAgentRecord } from './types';
import { toast, confirm } from '@/stores';

type ViewMode =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; record: CustomAgentRecord };

export function MyAgentsTab() {
  const [items, setItems] = useState<CustomAgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>({ mode: 'list' });
  const router = useRouter();

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
    const ok = await confirm({
      title: '确认删除？',
      description: '此操作不可恢复。',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/user/custom-agents/${id}`);
      // ★ R-CA bug #4 防御：删除 → 通知 Sidebar 刷新动态菜单
      notifyCustomAgentChanged();
      load();
    } catch (e) {
      toast.error('删除失败', e instanceof Error ? e.message : undefined);
    }
  };

  const backToList = () => {
    // ★ R-CA bug #3/#4 防御：退出编辑回列表 → 同时通知 Sidebar
    //   （编辑里可能改了 displayName / unpublish / archive，sidebar 缓存需要刷新）
    notifyCustomAgentChanged();
    setView({ mode: 'list' });
  };

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
        <EmptyState
          title="还没有自己的 agent"
          action={{
            label: '创建第一个',
            onClick: () => setView({ mode: 'create' }),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <AssetCard
              key={it.id}
              title={it.displayName}
              description={it.description}
              icon={<Bot className="h-6 w-6 text-white" />}
              badges={[
                {
                  key: 'status',
                  label: it.status,
                  className:
                    it.status === 'PUBLISHED'
                      ? 'bg-green-100 text-green-700'
                      : it.status === 'ARCHIVED'
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-amber-100 text-amber-700',
                },
              ]}
              isOwner
              onEdit={() => setView({ mode: 'edit', record: it })}
              onDelete={() => remove(it.id)}
              onClick={() =>
                it.status === 'PUBLISHED'
                  ? router.push(`/custom-agents/${it.id}`)
                  : setView({ mode: 'edit', record: it })
              }
              stats={[
                {
                  key: 'slug',
                  icon: <Hash className="h-3.5 w-3.5" />,
                  text: it.slug,
                },
                { key: 'ver', icon: null, text: `v${it.version}` },
              ]}
              timestamp={it.updatedAt}
              timestampLabel="更新"
            />
          ))}
        </div>
      )}
    </div>
  );
}
