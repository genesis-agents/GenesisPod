'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Edit,
  Key,
  KeyRound,
  Power,
  Trash2,
  Users,
} from 'lucide-react';
import {
  type AssignmentView,
  type DistributableKeyView,
  formatCents,
  useDistributableKeyDetail,
  useDistributableKeys,
} from '@/hooks/features/useByokAdmin';
import { Modal } from '@/components/ui/dialogs/Modal';

interface Props {
  showAddModal: boolean;
  setShowAddModal: (v: boolean) => void;
}

export function DistributableKeysManager({
  showAddModal,
  setShowAddModal,
}: Props) {
  const { keys, loading, error, create, update, deactivate, mutating } =
    useDistributableKeys();

  const [editing, setEditing] = useState<DistributableKeyView | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">加载中...</div>;
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-red-600">
        <AlertCircle className="h-4 w-4" />
        {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {keys.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          尚未添加可分发 Key。点击右上角「添加 Key」来录入第一个。
        </div>
      )}

      {keys.map((k) => (
        <KeyCard
          key={k.id}
          data={k}
          onEdit={() => setEditing(k)}
          onDeactivate={() => {
            if (
              confirm(`确定停用 ${k.label} 吗？用户将无法继续使用相关分配。`)
            ) {
              void deactivate(k.id);
            }
          }}
          onOpenDetail={() => setDetailId(k.id)}
        />
      ))}

      {(showAddModal || editing) && (
        <KeyEditorModal
          initial={editing}
          saving={mutating}
          onClose={() => {
            setShowAddModal(false);
            setEditing(null);
          }}
          onSubmit={async (payload) => {
            const ok = editing
              ? await update(editing.id, payload)
              : !!(await create({
                  provider: payload.provider!,
                  label: payload.label!,
                  apiKey: payload.apiKey!,
                  apiEndpoint: payload.apiEndpoint ?? undefined,
                  monthlyQuotaCents: payload.monthlyQuotaCents ?? undefined,
                  expiresAt: payload.expiresAt ?? undefined,
                }));
            if (ok) {
              setShowAddModal(false);
              setEditing(null);
            }
          }}
        />
      )}

      {detailId && (
        <KeyDetailModal id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

// ─── Key Card ────────────────────────────────────────────────────────────────

function KeyCard({
  data,
  onEdit,
  onDeactivate,
  onOpenDetail,
}: {
  data: DistributableKeyView;
  onEdit: () => void;
  onDeactivate: () => void;
  onOpenDetail: () => void;
}) {
  const utilization =
    data.monthlyQuotaCents && data.monthlyQuotaCents > 0
      ? Math.round((data.currentSpendCents / data.monthlyQuotaCents) * 100)
      : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <Key className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{data.label}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase tracking-wide text-gray-600">
                {data.provider}
              </span>
              {data.isActive ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle className="h-3 w-3" />
                  激活
                </span>
              ) : (
                <span className="text-xs text-gray-400">已停用</span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Key: {data.keyHint ?? '****'} · {data.activeAssignmentCount}{' '}
              个活跃分配
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenDetail}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Users className="h-3.5 w-3.5" /> 分配
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Edit className="h-3.5 w-3.5" /> 编辑
          </button>
          {data.isActive && (
            <button
              onClick={onDeactivate}
              className="flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              <Power className="h-3.5 w-3.5" /> 停用
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
        <Stat label="月度配额" value={formatCents(data.monthlyQuotaCents)} />
        <Stat label="已用" value={formatCents(data.currentSpendCents)} />
        <Stat
          label="利用率"
          value={utilization !== null ? `${utilization}%` : '—'}
        />
        <Stat
          label="到期"
          value={
            data.expiresAt
              ? new Date(data.expiresAt).toLocaleDateString()
              : '无'
          }
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 p-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-0.5 font-medium text-gray-900">{value}</div>
    </div>
  );
}

// ─── Editor Modal ────────────────────────────────────────────────────────────

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'xai', label: 'xAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: 'Qwen' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'groq', label: 'Groq' },
];

function KeyEditorModal({
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  initial: DistributableKeyView | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (
    payload: Partial<DistributableKeyView> & { apiKey?: string }
  ) => Promise<void>;
}) {
  const [provider, setProvider] = useState(initial?.provider ?? 'openai');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState(initial?.apiEndpoint ?? '');
  const [monthlyQuota, setMonthlyQuota] = useState(
    initial?.monthlyQuotaCents !== null &&
      initial?.monthlyQuotaCents !== undefined
      ? String(initial.monthlyQuotaCents / 100)
      : ''
  );
  const [expiresAt, setExpiresAt] = useState(
    initial?.expiresAt ? initial.expiresAt.slice(0, 10) : ''
  );
  const [showKey, setShowKey] = useState(false);

  const isEdit = !!initial;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? '编辑分发 Key' : '添加分发 Key'}
      subtitle={
        isEdit
          ? '留空 API Key 表示保持原值不变'
          : '录入后会加密存储，密文与明文分离'
      }
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            disabled={saving || !label || (!isEdit && !apiKey)}
            onClick={() =>
              void onSubmit({
                provider,
                label,
                apiKey: apiKey || undefined,
                apiEndpoint: apiEndpoint || undefined,
                monthlyQuotaCents: monthlyQuota
                  ? Math.round(parseFloat(monthlyQuota) * 100)
                  : undefined,
                expiresAt: expiresAt || undefined,
              })
            }
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : isEdit ? '保存' : '添加'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Provider">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={isEdit}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
          >
            {PROVIDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="标签">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例如 OpenAI 采购-2026Q2"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field
          label={isEdit ? 'API Key（留空保持原值）' : 'API Key'}
          required={!isEdit}
        >
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEdit ? (initial?.keyHint ?? '****') : 'sk-...'}
              className="font-mono flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="rounded-md border border-gray-200 px-3 text-sm text-gray-600"
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
        </Field>

        <Field label="自定义 API Endpoint（可选）">
          <input
            type="url"
            value={apiEndpoint}
            onChange={(e) => setApiEndpoint(e.target.value)}
            placeholder="默认使用 Provider 官方 endpoint"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="月度配额（USD，空=无限）">
            <input
              type="number"
              step="0.01"
              min="0"
              value={monthlyQuota}
              onChange={(e) => setMonthlyQuota(e.target.value)}
              placeholder="500.00"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="过期日期（可选）">
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// ─── Detail & Assign Modal ───────────────────────────────────────────────────

function KeyDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { key, assignments, loading } = useDistributableKeyDetail(id);
  const utilization = useMemo(() => {
    if (!key?.monthlyQuotaCents || key.monthlyQuotaCents <= 0) return null;
    return Math.round((key.currentSpendCents / key.monthlyQuotaCents) * 100);
  }, [key]);

  return (
    <Modal
      open
      onClose={onClose}
      size="2xl"
      title={key ? `分配详情 · ${key.label}` : '加载中...'}
      subtitle={
        key
          ? `Provider: ${key.provider} · Key: ${key.keyHint ?? '****'} · 利用率 ${utilization ?? 0}%`
          : ''
      }
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            关闭
          </button>
          <Link
            href="/admin/access/users"
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <KeyRound className="h-4 w-4" />
            前往用户管理授权
          </Link>
        </div>
      }
    >
      {/*
        本视图为 Key 池只读运维/审计。授权动作的入口语义中心是"用户"——
        从用户列表行内 ACTIONS 列分配模型权益（feedback_admin_workflow_must_match_intuition）。
      */}
      <div className="mb-3 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <KeyRound className="h-4 w-4 shrink-0" />
        <span>
          <span className="font-medium">分配权益请去</span>{' '}
          <Link
            href="/admin/access/users"
            className="underline hover:text-blue-700"
          >
            用户管理
          </Link>{' '}
          — 用户行内授权按钮支持选模型多选 + 单次/周期有效期。
        </span>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">加载中...</div>
      ) : (
        <div className="space-y-3">
          {assignments.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
              尚未分配给任何用户
            </div>
          ) : (
            assignments.map((a) => <AssignmentRow key={a.id} assignment={a} />)
          )}
        </div>
      )}
    </Modal>
  );
}

function AssignmentRow({ assignment }: { assignment: AssignmentView }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3 text-sm">
      <div>
        <div className="font-mono text-xs text-gray-700">
          user: {assignment.userId}
        </div>
        <div className="text-xs text-gray-500">
          配额 {formatCents(assignment.userQuotaCents)} · 已用{' '}
          {formatCents(assignment.userSpendCents)}
          {assignment.expiresAt && (
            <> · 到期 {new Date(assignment.expiresAt).toLocaleDateString()}</>
          )}
        </div>
      </div>
      <StatusBadge status={assignment.status} />
    </div>
  );
}

function StatusBadge({ status }: { status: AssignmentView['status'] }) {
  const color = {
    ACTIVE: 'bg-emerald-50 text-emerald-700',
    SUSPENDED: 'bg-amber-50 text-amber-700',
    EXPIRED: 'bg-gray-50 text-gray-600',
    REVOKED: 'bg-red-50 text-red-700',
  }[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${color}`}>
      {status}
    </span>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
