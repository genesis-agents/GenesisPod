'use client';

import { useMemo, useState } from 'react';
import { confirm } from '@/stores';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table';
import { TruncatedCell } from '@/components/common/tables';
import { StatusBadge } from '@/components/ui/badges';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { Modal } from '@/components/ui/dialogs/Modal';
import {
  Edit,
  Heart,
  Key,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  useUserApiKeys,
  type ProviderInfo,
  type UserApiKeyInfo,
} from '@/hooks/features/useUserApiKeys';
import { apiClient } from '@/lib/api/client';
import { UserApiKeyDrawer } from './UserApiKeyDrawer';

const PROVIDER_ICONS: Record<string, { color: string; icon: string }> = {
  openai: {
    color: 'bg-green-100 text-green-700',
    icon: '/icons/ai/openai.svg',
  },
  anthropic: {
    color: 'bg-orange-100 text-orange-700',
    icon: '/icons/ai/claude.svg',
  },
  deepseek: {
    color: 'bg-blue-100 text-blue-700',
    icon: '/icons/ai/deepseek.svg',
  },
  google: { color: 'bg-blue-100 text-blue-600', icon: '/icons/ai/gemini.svg' },
  xai: { color: 'bg-gray-100 text-gray-700', icon: '/icons/ai/grok.svg' },
  qwen: { color: 'bg-purple-100 text-purple-700', icon: '/icons/ai/qwen.svg' },
  cohere: { color: 'bg-indigo-100 text-indigo-700', icon: '' },
  groq: { color: 'bg-red-100 text-red-600', icon: '/icons/ai/groq.svg' },
  openrouter: {
    color: 'bg-violet-100 text-violet-700',
    icon: '/icons/ai/openrouter.svg',
  },
  minimax: {
    color: 'bg-slate-100 text-slate-700',
    icon: '/icons/ai/minimax.svg',
  },
  voyage: { color: 'bg-teal-100 text-teal-700', icon: '' },
};

type CategoryFilter = 'ALL' | 'BUILTIN' | 'CUSTOM';
type StatusFilter = 'ALL' | 'CONFIGURED' | 'DONATED' | 'UNCONFIGURED';

/**
 * BYOK API Key 管理 tab —— 视觉与 admin /admin/access/secrets 完全对齐：
 *
 * - 顶部 banner + 已配置 / 已捐赠 stats
 * - search + category filter + Add Custom Provider
 * - 真表格列：Name(icon+slug) / Category(badge) / Value(masked hint) /
 *   Status(personal/donated/未配置) / Usage Count / Actions
 * - 操作走共享的 UserApiKeyDrawer（多 KEY 管理 + Add Key 流）
 *
 * 2026-05-08：本 tab 只关心"我的 KEY"。模型申请（KeyRequest）和系统授权
 * 展示（KeyAssignment）都属于"模型"概念，已迁移到 UserModelsManagement.tsx。
 */
export function UserApiKeysTab() {
  const { t } = useTranslation();
  const {
    keys,
    providers,
    loading,
    saving,
    testing,
    saveKey,
    deleteKey,
    withdrawDonation,
    refresh,
    getKeyForProvider,
    getKeysForProvider,
  } = useUserApiKeys();

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [drawerProvider, setDrawerProvider] = useState<ProviderInfo | null>(
    null
  );
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  // ★ 2026-05-27: 编辑模式 (custom provider) — null = 新建模式 (showAddCustomModal=true)
  const [editingProvider, setEditingProvider] =
    useState<CustomProviderEditable | null>(null);

  const donatedCount = keys.filter((k) => k.mode === 'donated').length;
  const configuredCount = keys.length;

  const filteredProviders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return providers.filter((p) => {
      const isBuiltin = p.id in PROVIDER_ICONS;
      const existing = getKeyForProvider(p.id);
      const status: StatusFilter = existing
        ? existing.mode === 'donated'
          ? 'DONATED'
          : 'CONFIGURED'
        : 'UNCONFIGURED';

      if (categoryFilter === 'BUILTIN' && !isBuiltin) return false;
      if (categoryFilter === 'CUSTOM' && isBuiltin) return false;
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (
        term &&
        !p.name.toLowerCase().includes(term) &&
        !p.id.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [providers, searchTerm, categoryFilter, statusFilter, getKeyForProvider]);

  const handleDelete = async (provider: ProviderInfo) => {
    const existing = getKeyForProvider(provider.id);
    if (!existing) return;
    if (
      !(await confirm({
        title: `确定删除「${provider.name}」的 API Key？`,
        description: '此操作不可恢复（保留多 KEY 时请用「Manage Keys」）。',
        type: 'danger',
      }))
    ) {
      return;
    }
    await deleteKey(provider.id);
  };

  const handleWithdraw = async (provider: ProviderInfo) => {
    if (
      !(await confirm({
        title: `撤回「${provider.name}」的捐赠 KEY？`,
        description: '将转回个人模式。',
        type: 'warning',
      }))
    )
      return;
    await withdrawDonation(provider.id);
  };

  if (loading && providers.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          {t('profile.apiKeys.infoBanner')}
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
        <span className="text-gray-500">
          {t('profile.apiKeys.configured')}: <strong>{configuredCount}</strong>
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">
          {t('profile.apiKeys.donated')}: <strong>{donatedCount}</strong>
        </span>
      </div>

      {/* Search + filters + actions（与 admin SecretsManager 一致结构） */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索 Provider 名称 / slug…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">所有分类</option>
          <option value="BUILTIN">内置 Provider</option>
          <option value="CUSTOM">自定义 Provider</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">所有状态</option>
          <option value="CONFIGURED">已配置（个人）</option>
          <option value="DONATED">已捐赠</option>
          <option value="UNCONFIGURED">未配置</option>
        </select>
        <button
          onClick={() => refresh()}
          className="rounded-lg border border-gray-300 p-2 transition-colors hover:bg-gray-100"
          title="刷新"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={() => setShowAddCustomModal(true)}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          添加自定义 Provider
        </button>
      </div>

      {/* 表格（结构和列宽与 admin SecretsManager 完全一致） */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <Table className="w-full">
          <THead className="bg-gray-50">
            <Tr>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Category
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Value
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </Th>
              <Th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Usage Count
              </Th>
              <Th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </Th>
            </Tr>
          </THead>
          <TBody className="divide-y divide-gray-200">
            {filteredProviders.length === 0 ? (
              <Tr>
                <Td colSpan={6}>
                  <EmptyState
                    size="sm"
                    title={
                      searchTerm ||
                      categoryFilter !== 'ALL' ||
                      statusFilter !== 'ALL'
                        ? '无匹配 Provider'
                        : '暂无 Provider'
                    }
                  />
                </Td>
              </Tr>
            ) : (
              filteredProviders.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  existingKey={getKeyForProvider(provider.id)}
                  providerKeys={getKeysForProvider(provider.id)}
                  onOpenDrawer={() => setDrawerProvider(provider)}
                  onDelete={() => handleDelete(provider)}
                  onWithdraw={() => handleWithdraw(provider)}
                  onEditCustom={() =>
                    setEditingProvider({
                      id: provider.id,
                      slug: provider.id,
                      name: provider.name,
                      endpoint: (provider as { endpoint?: string }).endpoint,
                      apiFormat: (provider as { apiFormat?: string }).apiFormat,
                      testModel: (provider as { testModel?: string }).testModel,
                      capabilities: (provider as { capabilities?: string[] })
                        .capabilities,
                    })
                  }
                  saving={saving}
                />
              ))
            )}
          </TBody>
        </Table>
      </div>

      {/* 共享 drawer：Configure（空 keys 走 Add Key）+ Manage Keys 都进它 */}
      {drawerProvider && (
        <UserApiKeyDrawer
          open={true}
          onClose={() => setDrawerProvider(null)}
          provider={drawerProvider}
          keys={getKeysForProvider(drawerProvider.id)}
          loading={loading}
          saving={saving}
          testing={testing}
          onSave={saveKey}
          onDelete={deleteKey}
        />
      )}

      {showAddCustomModal && (
        <AddCustomProviderModal onClose={() => setShowAddCustomModal(false)} />
      )}
      {editingProvider && (
        <AddCustomProviderModal
          onClose={() => setEditingProvider(null)}
          editing={editingProvider}
        />
      )}
    </div>
  );
}

function ProviderRow({
  provider,
  existingKey,
  providerKeys,
  onOpenDrawer,
  onDelete,
  onWithdraw,
  onEditCustom,
  saving,
}: {
  provider: ProviderInfo;
  existingKey?: UserApiKeyInfo;
  providerKeys: UserApiKeyInfo[];
  onOpenDrawer: () => void;
  onDelete: () => void;
  onWithdraw: () => void;
  onEditCustom?: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const iconInfo = PROVIDER_ICONS[provider.id] ?? {
    color: 'bg-gray-100 text-gray-700',
    icon: '',
  };
  const isBuiltin = provider.id in PROVIDER_ICONS;
  // provider 下可能多 KEY（label 区分），usageCount 累加
  const totalUsage = providerKeys.reduce((s, k) => s + k.usageCount, 0);
  const keyHint = existingKey?.keyHint ?? '—';

  return (
    <Tr className="hover:bg-gray-50">
      {/* Name —— 单行：图标 + 名称(截断),slug 收进 tooltip */}
      <Td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconInfo.color}`}
          >
            {iconInfo.icon ? (
              <img
                src={iconInfo.icon}
                alt={provider.name}
                className="h-5 w-5"
              />
            ) : (
              <Key className="h-4 w-4" />
            )}
          </div>
          <TruncatedCell
            className="max-w-[200px] font-medium text-gray-900"
            tooltip={`${provider.name} · ${provider.id}`}
          >
            {provider.name}
          </TruncatedCell>
        </div>
      </Td>
      {/* Category —— StatusBadge tone 统一配色 */}
      <Td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <StatusBadge
            tone={isBuiltin ? 'info' : 'neutral'}
            label={isBuiltin ? 'AI Model' : 'Custom Provider'}
          />
          {providerKeys.length > 1 && (
            <StatusBadge tone="warning" label={`${providerKeys.length} keys`} />
          )}
        </div>
      </Td>
      {/* Value —— 掩码 keyHint,过长截断 + 原生 tooltip */}
      <Td className="px-4 py-2.5">
        <code
          className="font-mono inline-block max-w-[180px] truncate rounded bg-gray-100 px-2 py-1 align-middle text-sm text-gray-700"
          title={keyHint}
        >
          {keyHint}
        </code>
      </Td>
      {/* Status */}
      <Td className="px-4 py-2.5">
        {existingKey ? (
          existingKey.mode === 'donated' ? (
            // donated（捐赠）是项目专属语义,StatusBadge 无 pink tone,保留专色但对齐形状
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-700 ring-1 ring-pink-200">
              <Heart className="h-3 w-3" />
              {t('profile.apiKeys.statusDonated')}
            </span>
          ) : (
            <StatusBadge
              tone="success"
              icon={Lock}
              label={t('profile.apiKeys.statusPersonal')}
            />
          )
        ) : (
          <StatusBadge
            tone="neutral"
            label={t('profile.apiKeys.statusNotConfigured')}
          />
        )}
      </Td>
      <Td className="px-4 py-2.5 text-sm text-gray-500">{totalUsage}</Td>
      <Td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {/* ★ 2026-05-27: 自建 Provider 提供 "编辑 Provider" 入口
              (修 endpoint/format/testModel/能力, 与 Key 管理分开) */}
          {!isBuiltin && onEditCustom && (
            <button
              onClick={onEditCustom}
              disabled={saving}
              className="rounded p-1.5 hover:bg-purple-50 disabled:opacity-50"
              title="编辑 Provider"
            >
              <Settings2 className="h-4 w-4 text-purple-600" />
            </button>
          )}
          {existingKey ? (
            <>
              <button
                onClick={onOpenDrawer}
                disabled={saving}
                className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-50"
                title="管理多 KEY"
              >
                <Edit className="h-4 w-4 text-gray-500" />
              </button>
              {existingKey.mode === 'donated' ? (
                <button
                  onClick={onWithdraw}
                  disabled={saving}
                  className="rounded p-1.5 hover:bg-orange-50 disabled:opacity-50"
                  title={t('profile.apiKeys.withdrawDonation')}
                >
                  <Heart className="h-4 w-4 text-orange-500" />
                </button>
              ) : null}
              <button
                onClick={onDelete}
                disabled={saving}
                className="rounded p-1.5 hover:bg-red-50 disabled:opacity-50"
                title={t('profile.apiKeys.delete')}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </button>
            </>
          ) : (
            <button
              onClick={onOpenDrawer}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              title={t('profile.apiKeys.configure')}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t('profile.apiKeys.configure')}
            </button>
          )}
        </div>
      </Td>
    </Tr>
  );
}

// ─── Add / Edit Custom Provider modal ─────────────
// ★ 2026-05-27 重构: 默认只露 Slug + 显示名 (用户实证: 之前所有字段并排显得很复杂);
//   endpoint / format / testModel / capabilities 折成"高级（可选）"。
//   支持 editing prop: 传入已有 provider 进入编辑模式 (PATCH /user/providers/:id);
//   不传则新建 (POST /user/providers)。

interface CustomProviderEditable {
  id: string;
  slug: string;
  name: string;
  endpoint?: string | null;
  apiFormat?: string | null;
  testModel?: string | null;
  capabilities?: string[] | null;
}

function AddCustomProviderModal({
  onClose,
  editing,
}: {
  onClose: () => void;
  editing?: CustomProviderEditable;
}) {
  const isEdit = !!editing;
  const [slug, setSlug] = useState(editing?.slug ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [endpoint, setEndpoint] = useState(editing?.endpoint ?? '');
  const [apiFormat, setApiFormat] = useState<
    'openai' | 'anthropic' | 'google' | 'cohere'
  >(
    ((editing?.apiFormat ?? 'openai') as
      | 'openai'
      | 'anthropic'
      | 'google'
      | 'cohere') || 'openai'
  );
  const [testModel, setTestModel] = useState(editing?.testModel ?? '');
  const [capabilities, setCapabilities] = useState<string[]>(
    editing?.capabilities ?? ['CHAT']
  );
  const [showAdvanced, setShowAdvanced] = useState(
    !!(editing?.endpoint || editing?.testModel)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCap = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const submit = async () => {
    setError(null);
    if (!isEdit && !/^[a-z0-9-]+$/.test(slug)) {
      setError('slug 仅允许小写字母、数字、短横线');
      return;
    }
    if (!name) {
      setError('显示名必填');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        slug,
        name,
        endpoint: endpoint || '',
        apiFormat,
        testModel: testModel || '',
        capabilities: capabilities.length > 0 ? capabilities : ['CHAT'],
      };
      if (isEdit && editing?.id) {
        await apiClient.patch(`/user/providers/${editing.id}`, payload);
      } else {
        await apiClient.post('/user/providers', payload);
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={isEdit ? `编辑 Provider · ${editing?.name}` : '添加自定义 Provider'}
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '保存中...' : '保存'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          只填 Slug + 显示名即可保存。API Endpoint / Format / 模型 ID 等参数{' '}
          <b>放到「AI 模型配置」</b>更合适，本表单仅创建 Provider 标签。
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Slug（kebab-case 唯一标识）
          </label>
          <input
            type="text"
            value={slug}
            disabled={isEdit}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. mistral / jina / together"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            显示名
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mistral AI"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          <span>{showAdvanced ? '▾' : '▸'}</span>
          高级（可选 · 用于探测）
        </button>

        {showAdvanced && (
          <div className="space-y-3 rounded border border-gray-200 bg-gray-50 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                API Endpoint
              </label>
              <input
                type="url"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://api.example.com/v1 (可在 AI 模型配置里覆盖)"
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                API Format
              </label>
              <select
                value={apiFormat}
                onChange={(e) =>
                  setApiFormat(e.target.value as typeof apiFormat)
                }
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="openai">openai (默认，多数兼容)</option>
                <option value="anthropic">anthropic</option>
                <option value="google">google</option>
                <option value="cohere">cohere</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                探测/测试用模型 ID（可选）
              </label>
              <input
                type="text"
                value={testModel}
                onChange={(e) => setTestModel(e.target.value)}
                placeholder="e.g. mistral-small-latest"
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                支持能力
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  'CHAT',
                  'CHAT_FAST',
                  'CODE',
                  'MULTIMODAL',
                  'EMBEDDING',
                  'RERANK',
                  'IMAGE_GENERATION',
                ].map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => toggleCap(cap)}
                    className={`rounded px-2 py-1 text-xs ${
                      capabilities.includes(cap)
                        ? 'border border-blue-300 bg-blue-100 text-blue-700'
                        : 'border border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    {cap}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
