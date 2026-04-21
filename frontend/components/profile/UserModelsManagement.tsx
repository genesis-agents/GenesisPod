'use client';

import { useMemo, useState } from 'react';
import { Check, Edit, Plus, Search, Star, Trash2, X } from 'lucide-react';
import {
  USER_MODEL_TYPE_OPTIONS,
  useUserModelConfigs,
  type UserModelConfig,
  type UserModelType,
  type ModelImportance,
} from '@/hooks/features/useUserModelConfigs';
import { useUserApiKeys } from '@/hooks/features/useUserApiKeys';
import { UserModelConfigModal } from './UserModelConfigModal';
import { UserModelsAutoConfigureButton } from './UserModelsAutoConfigureButton';

const TYPE_BADGE_CLASS: Record<UserModelType, string> = {
  CHAT: 'bg-blue-100 text-blue-700',
  CHAT_FAST: 'bg-sky-100 text-sky-700',
  CODE: 'bg-purple-100 text-purple-700',
  MULTIMODAL: 'bg-violet-100 text-violet-700',
  IMAGE_GENERATION: 'bg-green-100 text-green-700',
  IMAGE_EDITING: 'bg-orange-100 text-orange-700',
  EMBEDDING: 'bg-indigo-100 text-indigo-700',
  RERANK: 'bg-pink-100 text-pink-700',
  EVALUATOR: 'bg-amber-100 text-amber-700',
};

function typeLabel(t: UserModelType): string {
  return USER_MODEL_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

/**
 * 用户自己的模型管理页 — 布局和字段与管理员 /admin/ai/models 完全一致。
 * 列：MODEL / MODEL ID / TYPE / API KEY / STATUS / CAPABILITIES / ACTIONS
 * 顶部：搜索 + Provider 过滤 + Add Model
 */
export function UserModelsManagement() {
  const { items, loading, update, remove, setDefault, refresh } =
    useUserModelConfigs();
  const { keys: apiKeys } = useUserApiKeys();

  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<UserModelConfig | null>(null);

  // Provider 过滤下拉：只列出用户已配过 Key 的 provider
  const availableProviders = useMemo(() => {
    const set = new Set(apiKeys.map((k) => k.provider));
    items.forEach((m) => set.add(m.provider));
    return [...set].sort();
  }, [apiKeys, items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((m) => {
      if (providerFilter && m.provider !== providerFilter) return false;
      if (!q) return true;
      return (
        m.displayName.toLowerCase().includes(q) ||
        m.modelId.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
      );
    });
  }, [items, search, providerFilter]);

  // 新增 Modal 的 provider：从第一个已配 Key 的 provider 取，否则 openai
  const addProvider = availableProviders[0] ?? 'openai';
  const addApiKeyHint = apiKeys.find((k) => k.provider === addProvider);

  // ★ 需求概览：每个 modelType 是否已有一个启用的模型；没有则提示用户
  const coverage = useMemo(() => {
    const map = new Map<
      UserModelType,
      { hasEnabled: boolean; hasDefault: boolean; count: number }
    >();
    for (const opt of USER_MODEL_TYPE_OPTIONS) {
      map.set(opt.value, { hasEnabled: false, hasDefault: false, count: 0 });
    }
    for (const m of items) {
      const entry = map.get(m.modelType);
      if (!entry) continue;
      entry.count += 1;
      if (m.isEnabled) entry.hasEnabled = true;
      if (m.isEnabled && m.isDefault) entry.hasDefault = true;
    }
    return map;
  }, [items]);

  const missingRequired = USER_MODEL_TYPE_OPTIONS.filter(
    (o) => o.importance === 'required' && !coverage.get(o.value)?.hasEnabled
  );

  return (
    <div className="space-y-4">
      {/* Header — 对齐管理员 `/admin/ai/models` 的顶栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">我的模型</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            界面和字段与管理员的「模型管理」一致；使用你自己的 API Key
            运行，不受系统默认模型 tier 限制
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UserModelsAutoConfigureButton
            disabled={apiKeys.length === 0}
            onDone={() => void refresh()}
          />
          <button
            onClick={() => setShowAdd(true)}
            disabled={apiKeys.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            title={
              apiKeys.length === 0
                ? '请先在 API Keys Tab 配置至少一个 Provider 的 Key'
                : undefined
            }
          >
            <Plus className="h-4 w-4" /> Add Model
          </button>
        </div>
      </div>

      {/* 需求概览 —— 告诉用户 Topic Insights / Research / RAG 等功能依赖哪些 modelType，
          以及当前缺什么。一键定位到 Add Modal 并预选缺失类型。 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">
              模型需求概览
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              不同功能（AI 问答 / Topic Insights / 知识库
              RAG）依赖不同类型的模型； 建议至少配置标记为「必需」的类型。
            </div>
          </div>
          {missingRequired.length > 0 && (
            <div className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              缺 {missingRequired.length} 类必需模型
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {USER_MODEL_TYPE_OPTIONS.map((opt) => {
            const c = coverage.get(opt.value)!;
            return (
              <CoverageCard
                key={opt.value}
                label={opt.label}
                description={opt.description}
                usedBy={opt.usedBy}
                importance={opt.importance}
                count={c.count}
                hasEnabled={c.hasEnabled}
                hasDefault={c.hasDefault}
                onAdd={() => setShowAdd(true)}
              />
            );
          })}
        </div>
      </div>

      {/* Search + Filter — 对齐管理员 */}
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search 模型名称、Model ID、Provider..."
            className="w-full rounded-md border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Providers ({availableProviders.length})</option>
          {availableProviders.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* 表格 — 完全复刻管理员列：MODEL / MODEL ID / TYPE / API KEY / STATUS / CAPABILITIES / ACTIONS */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Model
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Model ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                API Key
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Capabilities
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  加载中...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  {items.length === 0 ? (
                    <>
                      还没配置任何模型。点击右上角「Add Model」添加 —
                      界面和字段与管理员端完全一致。
                    </>
                  ) : (
                    <>没有匹配的模型</>
                  )}
                </td>
              </tr>
            )}
            {filtered.map((m) => {
              const hasKey = apiKeys.some(
                (k) => k.provider === m.provider && k.isActive
              );
              return (
                <tr
                  key={m.id}
                  className={`hover:bg-gray-50 ${!m.isEnabled ? 'opacity-60' : ''}`}
                >
                  {/* MODEL */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-lg font-semibold text-white shadow-sm">
                        {m.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {m.displayName}
                          </span>
                          {m.isDefault && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              Default
                            </span>
                          )}
                          {m.isReasoning && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                              Reasoning
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {m.provider}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* MODEL ID */}
                  <td className="px-4 py-4">
                    <code className="font-mono rounded bg-gray-100 px-2 py-1 text-xs">
                      {m.modelId}
                    </code>
                  </td>

                  {/* TYPE */}
                  <td className="whitespace-nowrap px-4 py-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        TYPE_BADGE_CLASS[m.modelType] ??
                        'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {typeLabel(m.modelType)}
                    </span>
                    <div className="mt-1 text-xs text-gray-400">
                      {m.apiFormat}
                    </div>
                  </td>

                  {/* API KEY */}
                  <td className="px-4 py-4">
                    <span
                      className={`text-sm font-medium ${
                        hasKey ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {hasKey ? '✓ Configured' : '✗ Missing'}
                    </span>
                    <div className="mt-0.5 text-xs text-gray-400">
                      via your {m.provider} key
                    </div>
                  </td>

                  {/* STATUS toggle */}
                  <td className="px-4 py-4 text-center">
                    <button
                      onClick={() =>
                        update(m.id, { isEnabled: !m.isEnabled }).then(() =>
                          refresh()
                        )
                      }
                      className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                        m.isEnabled ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          m.isEnabled ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </td>

                  {/* CAPABILITIES */}
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {m.supportsTemperature && (
                        <span
                          title="支持 temperature"
                          className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700"
                        >
                          T
                        </span>
                      )}
                      {m.supportsStreaming && (
                        <span
                          title="支持流式"
                          className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700"
                        >
                          S
                        </span>
                      )}
                      {m.supportsFunctionCalling && (
                        <span
                          title="支持函数调用"
                          className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700"
                        >
                          F
                        </span>
                      )}
                      {m.supportsVision && (
                        <span
                          title="支持视觉"
                          className="rounded bg-pink-100 px-1.5 py-0.5 text-xs text-pink-700"
                        >
                          V
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      P:{m.priority} | T:{m.temperature} | {m.maxTokens}tok
                    </div>
                  </td>

                  {/* ACTIONS */}
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!m.isDefault && m.isEnabled && (
                        <button
                          onClick={() => setDefault(m.id)}
                          title="设为该类型默认"
                          className="rounded p-1.5 text-amber-600 hover:bg-amber-50"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setEditing(m)}
                        title="编辑"
                        className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `确定删除模型 ${m.displayName}（${m.modelId}）吗？`
                            )
                          ) {
                            void remove(m.id);
                          }
                        }}
                        title="删除"
                        className="rounded p-1.5 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal — 字段完全对齐管理员 AIModelSettings */}
      {(showAdd || editing) && (
        <UserModelConfigModal
          key={editing?.id ?? 'new'}
          provider={editing?.provider ?? addProvider}
          apiKey=""
          apiEndpoint={addApiKeyHint?.apiEndpoint ?? undefined}
          initial={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowAdd(false);
            setEditing(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

// Re-export icons that the IDE sometimes trims from tree-shake analysis
export { Check, X };

function CoverageCard({
  label,
  description,
  usedBy,
  importance,
  count,
  hasEnabled,
  hasDefault,
  onAdd,
}: {
  label: string;
  description: string;
  usedBy: string[];
  importance: ModelImportance;
  count: number;
  hasEnabled: boolean;
  hasDefault: boolean;
  onAdd: () => void;
}) {
  const importanceBadge = {
    required: {
      text: '必需',
      className: 'bg-red-50 text-red-700',
    },
    recommended: {
      text: '推荐',
      className: 'bg-amber-50 text-amber-700',
    },
    optional: {
      text: '可选',
      className: 'bg-gray-50 text-gray-600',
    },
  }[importance];

  const status = hasDefault
    ? { text: '✓ 已配默认', className: 'text-green-600' }
    : hasEnabled
      ? { text: '● 已配置（未设默认）', className: 'text-blue-600' }
      : { text: '✗ 未配置', className: 'text-red-500' };

  return (
    <div
      className={`rounded-md border p-3 transition-colors ${
        !hasEnabled && importance === 'required'
          ? 'border-red-200 bg-red-50/40'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{label}</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] ${importanceBadge.className}`}
          >
            {importanceBadge.text}
          </span>
        </div>
        <span className={`text-xs font-medium ${status.className}`}>
          {status.text}
        </span>
      </div>
      <div className="text-xs text-gray-600">{description}</div>
      <div className="mt-1 text-[11px] text-gray-400">
        用于：{usedBy.join(' · ')}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-gray-500">{count} 个已配置</span>
        {!hasEnabled && (
          <button
            onClick={onAdd}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            立即添加 →
          </button>
        )}
      </div>
    </div>
  );
}
