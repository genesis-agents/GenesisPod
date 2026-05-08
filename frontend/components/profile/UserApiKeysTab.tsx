'use client';

import { useMemo, useState } from 'react';
import {
  Clock,
  Edit,
  Heart,
  Key,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  useUserApiKeys,
  type ProviderInfo,
  type UserApiKeyInfo,
} from '@/hooks/features/useUserApiKeys';
import {
  useMyKeyAssignments,
  useMyKeyRequests,
  type MyKeyRequest,
  type UserAssignmentView,
} from '@/hooks/features/useByokUser';
import { apiClient } from '@/lib/api/client';
import { Modal } from '@/components/ui/dialogs/Modal';
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

  const {
    requests: myRequests,
    submit: submitKeyRequest,
    cancel: cancelKeyRequest,
  } = useMyKeyRequests();
  const pendingRequest = useMemo(
    () => myRequests.find((r) => r.status === 'PENDING') ?? null,
    [myRequests]
  );

  const { assignments, loading: assignmentsLoading } = useMyKeyAssignments();
  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'ACTIVE'),
    [assignments]
  );
  const inactiveAssignments = useMemo(
    () => assignments.filter((a) => a.status !== 'ACTIVE'),
    [assignments]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [drawerProvider, setDrawerProvider] = useState<ProviderInfo | null>(
    null
  );
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [cancellingRequest, setCancellingRequest] = useState(false);

  const handleCancelPending = async () => {
    if (!pendingRequest) return;
    if (!confirm('确定撤销当前待审批的申请吗？撤销后可重新提交。')) return;
    setCancellingRequest(true);
    try {
      await cancelKeyRequest(pendingRequest.id);
    } finally {
      setCancellingRequest(false);
    }
  };

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
      !confirm(
        `确定删除「${provider.name}」的 API Key？此操作不可恢复（保留多 KEY 时请用「Manage Keys」）。`
      )
    ) {
      return;
    }
    await deleteKey(provider.id);
  };

  const handleWithdraw = async (provider: ProviderInfo) => {
    if (!confirm(`撤回「${provider.name}」的捐赠 KEY？将转回个人模式。`))
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
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">
          系统授权: <strong>{activeAssignments.length}</strong>
          {inactiveAssignments.length > 0 && (
            <span className="ml-1 text-xs text-gray-400">
              ({inactiveAssignments.length} 已失效)
            </span>
          )}
        </span>
      </div>

      <SystemGrantedAssignmentsSection
        active={activeAssignments}
        inactive={inactiveAssignments}
        loading={assignmentsLoading}
      />

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
          onClick={() => setShowRequestModal(true)}
          disabled={!!pendingRequest}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          title={
            pendingRequest
              ? '你已有 1 条待审批的申请，请先撤销或等待管理员处理'
              : '向管理员申请系统 API Key'
          }
        >
          <Send className="h-4 w-4" />
          申请系统 API Key
        </button>
        <button
          onClick={() => setShowAddCustomModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          添加自定义 Provider
        </button>
      </div>

      {pendingRequest && (
        <PendingRequestBanner
          request={pendingRequest}
          onCancel={handleCancelPending}
          cancelling={cancellingRequest}
        />
      )}

      {/* 表格（结构和列宽与 admin SecretsManager 完全一致） */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Value
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Usage Count
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredProviders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {searchTerm ||
                  categoryFilter !== 'ALL' ||
                  statusFilter !== 'ALL'
                    ? '无匹配 Provider'
                    : '暂无 Provider'}
                </td>
              </tr>
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
                  saving={saving}
                />
              ))
            )}
          </tbody>
        </table>
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

      {showRequestModal && (
        <RequestKeyModal
          onClose={() => setShowRequestModal(false)}
          submit={submitKeyRequest}
        />
      )}
    </div>
  );
}

// ─── 待审批申请状态横幅 ─────────────────────────────────────────────────────
//
// 2026-05-08：后端策略改为「每用户全局只能有 1 条 PENDING」(see
// key-requests.service.ts:87-95)。前端必须在用户点击「申请系统 API Key」
// **之前**就把这条 PENDING 暴露出来，并提供撤销入口，否则用户会反复撞 409。
function PendingRequestBanner({
  request,
  onCancel,
  cancelling,
}: {
  request: MyKeyRequest;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const usageLabel: Record<
    NonNullable<MyKeyRequest['estimatedUsage']>,
    string
  > = {
    LIGHT: '轻度 < $5',
    MEDIUM: '中度 $5-20',
    HEAVY: '重度 > $20',
  };
  const submittedAt = new Date(request.createdAt).toLocaleString();

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Clock className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
            待审批
          </span>
          <span className="text-sm font-medium text-amber-900">
            你有 1 条待管理员处理的 API Key 申请
          </span>
        </div>
        <div className="mt-2 space-y-1 text-xs text-amber-800">
          <div>提交时间：{submittedAt}</div>
          {request.estimatedUsage && (
            <div>预计用量：{usageLabel[request.estimatedUsage]}</div>
          )}
          {request.reason && (
            <div className="truncate" title={request.reason}>
              使用目的：{request.reason}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-amber-700">
          提交新申请前，请等待管理员处理或先撤销当前申请。
        </p>
      </div>
      <button
        onClick={onCancel}
        disabled={cancelling}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cancelling ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <X className="h-3.5 w-3.5" />
        )}
        {cancelling ? '撤销中...' : '撤销申请'}
      </button>
    </div>
  );
}

// ─── 系统授权（KeyAssignment）展示区 ─────────────────────────────────────
//
// 后端：KeyAssignment 是 admin 把某个 AIModel 授权给具体用户。表 = key_assignments，
// 接口 GET /user/key-assignments 返回 UserAssignmentView[]（含 modelDisplayName、
// userQuotaCents、userSpendCents、expiresAt、status...）。useAIModels 会把 ASSIGNED
// 的 provider 自动并入业务模型下拉，但用户在哪儿"看见自己被授权了什么"——之前没有
// 任何 UI 渲染过 useMyKeyAssignments，是一个明显的能力黑洞。这块就是补这块洞。
//
// 状态颜色/语义：ACTIVE 绿、SUSPENDED/EXPIRED/REVOKED/STALE 灰红淡化（不可用 + 解释）
function SystemGrantedAssignmentsSection({
  active,
  inactive,
  loading,
}: {
  active: UserAssignmentView[];
  inactive: UserAssignmentView[];
  loading: boolean;
}) {
  if (loading && active.length === 0 && inactive.length === 0) {
    return null;
  }
  if (active.length === 0 && inactive.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/30">
      <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2.5">
        <Shield className="h-4 w-4 text-emerald-700" />
        <span className="text-sm font-semibold text-emerald-900">
          系统授权的模型
        </span>
        <span className="text-xs text-emerald-700">
          管理员已为你授权的 AI 模型，可直接在「AI Ask / Topic Insights /
          Research」等业务里使用，无需自己配 Key
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-emerald-50/60">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-emerald-900">
                Model
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-emerald-900">
                Provider
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-emerald-900">
                Quota
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-emerald-900">
                Validity
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-emerald-900">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100">
            {[...active, ...inactive].map((a) => (
              <AssignmentRow key={a.id} assignment={a} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssignmentRow({ assignment: a }: { assignment: UserAssignmentView }) {
  const usedDollars = (a.userSpendCents / 100).toFixed(2);
  const quotaDollars =
    a.userQuotaCents !== null ? (a.userQuotaCents / 100).toFixed(2) : null;
  const quotaPct =
    a.userQuotaCents && a.userQuotaCents > 0
      ? Math.min(100, Math.round((a.userSpendCents / a.userQuotaCents) * 100))
      : null;

  const expired = a.expiresAt
    ? new Date(a.expiresAt).getTime() < Date.now()
    : false;
  const isInactive = a.status !== 'ACTIVE';

  const statusBadge = (() => {
    switch (a.status) {
      case 'ACTIVE':
        return {
          label: 'Active',
          className: 'bg-emerald-100 text-emerald-800',
          icon: <Lock className="h-3 w-3" />,
        };
      case 'SUSPENDED':
        return {
          label: 'Suspended',
          className: 'bg-amber-100 text-amber-800',
          icon: <Clock className="h-3 w-3" />,
        };
      case 'EXPIRED':
        return {
          label: 'Expired',
          className: 'bg-gray-100 text-gray-700',
          icon: <Clock className="h-3 w-3" />,
        };
      case 'REVOKED':
        return {
          label: 'Revoked',
          className: 'bg-red-100 text-red-700',
          icon: <X className="h-3 w-3" />,
        };
      case 'STALE':
        // 关联 AIModel 已被 admin disabled —— 提示用户重新申请
        return {
          label: 'Stale (model disabled)',
          className: 'bg-orange-100 text-orange-800',
          icon: <X className="h-3 w-3" />,
        };
    }
  })();

  return (
    <tr className={isInactive ? 'opacity-60' : ''}>
      {/* Model */}
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{a.modelDisplayName}</div>
        <code className="font-mono text-xs text-gray-500">{a.modelId}</code>
        {!a.modelEnabled && (
          <div className="mt-0.5 text-xs text-orange-600">
            ⚠ 模型已被管理员停用
          </div>
        )}
      </td>
      {/* Provider */}
      <td className="px-4 py-3">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
          {a.provider}
        </span>
      </td>
      {/* Quota */}
      <td className="px-4 py-3">
        {quotaDollars ? (
          <div>
            <div className="text-sm">
              <span className="font-medium text-gray-900">${usedDollars}</span>
              <span className="text-gray-500"> / ${quotaDollars}</span>
            </div>
            {quotaPct !== null && (
              <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full ${
                    quotaPct >= 90
                      ? 'bg-red-500'
                      : quotaPct >= 70
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="text-sm font-medium text-gray-900">
              ${usedDollars}
            </div>
            <div className="text-xs text-gray-500">unlimited</div>
          </div>
        )}
      </td>
      {/* Validity */}
      <td className="px-4 py-3">
        <div className="text-xs text-gray-700">
          {a.validityType === 'ONE_TIME' && '一次性'}
          {a.validityType === 'PERMANENT' && '永久'}
          {a.validityType === 'RECURRING' &&
            `周期${a.recurrenceUnit ? `（${a.recurrenceInterval ?? 1} ${a.recurrenceUnit}）` : ''}`}
        </div>
        {a.expiresAt && (
          <div
            className={`text-xs ${expired ? 'text-red-600' : 'text-gray-500'}`}
          >
            {expired ? '已过期: ' : '到期: '}
            {new Date(a.expiresAt).toLocaleDateString()}
          </div>
        )}
        {a.nextRenewalAt && a.status === 'ACTIVE' && (
          <div className="text-xs text-emerald-600">
            下次续期: {new Date(a.nextRenewalAt).toLocaleDateString()}
          </div>
        )}
      </td>
      {/* Status */}
      <td className="px-4 py-3 text-center">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}
        >
          {statusBadge.icon}
          {statusBadge.label}
        </span>
        {a.revokedReason && (
          <div className="mt-1 text-xs text-gray-500" title={a.revokedReason}>
            原因: {a.revokedReason.slice(0, 24)}
            {a.revokedReason.length > 24 ? '...' : ''}
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── 申请系统 API Key Modal（内嵌，不跳页） ─────────────────────────────────
//
// 2026-05-08：用户**不**指定 provider/model。理由：admin 未必有该 provider
// 可用模型，强选 provider 反而把申请卡死；同时 provider 列表是动态的
// （admin 在 /admin/ai/models 随时启停 AIModel），前端 hardcode 难以同步。
// admin 在审批界面根据当前可用 AIModel 自由决定授权。
function RequestKeyModal({
  onClose,
  submit,
}: {
  onClose: () => void;
  submit: ReturnType<typeof useMyKeyRequests>['submit'];
}) {
  const [reason, setReason] = useState('');
  const [estimated, setEstimated] = useState<'LIGHT' | 'MEDIUM' | 'HEAVY'>(
    'MEDIUM'
  );
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="申请系统 API Key"
      subtitle="提交后管理员将根据当前可用模型为你授权，通常 24 小时内处理"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            disabled={submitting || !reason.trim()}
            onClick={async () => {
              setSubmitting(true);
              const r = await submit({
                reason: reason.trim() || undefined,
                estimatedUsage: estimated,
                note: note.trim() || undefined,
              });
              setSubmitting(false);
              if (r) onClose();
            }}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {submitting ? '提交中...' : '提交申请'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            使用目的 *
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：毕业设计需要使用 GPT-4o 做文献综述"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            预计月度用量 *
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { v: 'LIGHT', label: '轻度 < $5' },
                { v: 'MEDIUM', label: '中度 $5-20' },
                { v: 'HEAVY', label: '重度 > $20' },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                  estimated === o.v
                    ? 'border-blue-500 bg-blue-50 font-medium text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  checked={estimated === o.v}
                  onChange={() => setEstimated(o.v)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            备注（可选）
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
    </Modal>
  );
}

function ProviderRow({
  provider,
  existingKey,
  providerKeys,
  onOpenDrawer,
  onDelete,
  onWithdraw,
  saving,
}: {
  provider: ProviderInfo;
  existingKey?: UserApiKeyInfo;
  providerKeys: UserApiKeyInfo[];
  onOpenDrawer: () => void;
  onDelete: () => void;
  onWithdraw: () => void;
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
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${iconInfo.color}`}
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
          <div className="min-w-0">
            <div className="font-medium text-gray-900">{provider.name}</div>
            <div className="font-mono truncate text-xs text-gray-500">
              {provider.id}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            isBuiltin
              ? 'bg-blue-100 text-blue-800'
              : 'bg-purple-100 text-purple-800'
          }`}
        >
          {isBuiltin ? 'AI Model' : 'Custom Provider'}
        </span>
        {providerKeys.length > 1 && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {providerKeys.length} keys
          </span>
        )}
      </td>
      <td className="px-4 py-4">
        <code className="font-mono rounded bg-gray-100 px-2 py-1 text-sm text-gray-700">
          {keyHint}
        </code>
      </td>
      <td className="px-4 py-4">
        {existingKey ? (
          existingKey.mode === 'donated' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-1 text-xs font-medium text-pink-800">
              <Heart className="h-3 w-3" />
              {t('profile.apiKeys.statusDonated')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
              <Lock className="h-3 w-3" />
              {t('profile.apiKeys.statusPersonal')}
            </span>
          )
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
            {t('profile.apiKeys.statusNotConfigured')}
          </span>
        )}
      </td>
      <td className="px-4 py-4 text-sm text-gray-500">{totalUsage}</td>
      <td className="px-4 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
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
      </td>
    </tr>
  );
}

// ─── Add Custom Provider modal（保留原有 OpenAI 兼容自助接入流） ─────────────

function AddCustomProviderModal({ onClose }: { onClose: () => void }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiFormat, setApiFormat] = useState<
    'openai' | 'anthropic' | 'google' | 'cohere'
  >('openai');
  const [testModel, setTestModel] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>(['CHAT']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCap = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const submit = async () => {
    setError(null);
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError('slug 仅允许小写字母、数字、短横线');
      return;
    }
    if (!name || !endpoint || !testModel) {
      setError('name / endpoint / testModel 必填');
      return;
    }
    if (capabilities.length === 0) {
      setError('至少勾选一个能力');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/user/providers', {
        slug,
        name,
        endpoint,
        apiFormat,
        testModel,
        capabilities,
      });
      window.location.reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '保存失败，请检查 endpoint 是否合法'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">添加自定义 Provider</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Slug（kebab-case 唯一标识）
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. mistral / jina / together"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
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
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              API Endpoint
            </label>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              API Format
            </label>
            <select
              value={apiFormat}
              onChange={(e) => setApiFormat(e.target.value as typeof apiFormat)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="openai">openai (默认，多数兼容)</option>
              <option value="anthropic">anthropic</option>
              <option value="google">google</option>
              <option value="cohere">cohere</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              探测/测试用模型 ID
            </label>
            <input
              type="text"
              value={testModel}
              onChange={(e) => setTestModel(e.target.value)}
              placeholder="e.g. mistral-small-latest"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
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
                      : 'border border-gray-200 bg-gray-100 text-gray-600'
                  }`}
                >
                  {cap}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
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
        </div>
      </div>
    </div>
  );
}
