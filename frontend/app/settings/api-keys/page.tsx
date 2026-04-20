'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Key,
  KeySquare,
  Plus,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { UserApiKeysTab } from '@/components/profile/UserApiKeysTab';
import {
  type MyKeyRequest,
  type UserAssignmentView,
  useMyKeyAssignments,
  useMyKeyRequests,
} from '@/hooks/features/useByokUser';

type TabKey = 'mine' | 'assigned' | 'requests';

export default function ApiKeysPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('mine');

  if (!isLoading && !user) {
    router.push('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900">API Keys</h1>
        <p className="mt-1 text-sm text-gray-500">
          配置你自己的 Provider Key（BYOK）或查看管理员分配给你的 Key。
        </p>

        <div className="mt-6 flex gap-2 border-b border-gray-200">
          <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
            <Key className="h-4 w-4" /> 我的 Key
          </TabButton>
          <TabButton
            active={tab === 'assigned'}
            onClick={() => setTab('assigned')}
          >
            <KeySquare className="h-4 w-4" /> 管理员分配
          </TabButton>
          <TabButton
            active={tab === 'requests'}
            onClick={() => setTab('requests')}
          >
            <Clock className="h-4 w-4" /> 我的申请
          </TabButton>
        </div>

        <div className="mt-6">
          {tab === 'mine' && <UserApiKeysTab />}
          {tab === 'assigned' && <AssignedKeysTab />}
          {tab === 'requests' && <KeyRequestsTab />}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
        active
          ? 'border-blue-600 font-medium text-blue-700'
          : 'border-transparent text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Assigned Keys Tab ───────────────────────────────────────────────────────

function AssignedKeysTab() {
  const { assignments, loading } = useMyKeyAssignments();

  if (loading) return <div className="text-sm text-gray-500">加载中...</div>;

  if (assignments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <div className="text-sm text-gray-500">
          管理员目前还没有给你分配任何 Key。
        </div>
        <Link
          href="/settings/api-keys/request"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          申请 Key
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {assignments.map((a) => (
        <AssignmentCard key={a.id} data={a} />
      ))}
    </div>
  );
}

function AssignmentCard({ data }: { data: UserAssignmentView }) {
  const usagePercent =
    data.userQuotaCents && data.userQuotaCents > 0
      ? Math.round((data.userSpendCents / data.userQuotaCents) * 100)
      : null;
  const used = formatUsd(data.userSpendCents);
  const total =
    data.userQuotaCents === null ? '无限' : formatUsd(data.userQuotaCents);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600">
              {data.provider}
            </span>
            <span className="text-sm font-medium text-gray-900">
              {data.keyLabel}
            </span>
            <StatusBadge status={data.status} />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            已用 {used} / {total}
            {data.expiresAt &&
              ` · 到期 ${new Date(data.expiresAt).toLocaleDateString()}`}
          </div>
        </div>
        {usagePercent !== null && (
          <div className="text-right">
            <div className="text-lg font-semibold text-gray-900">
              {usagePercent}%
            </div>
            <div className="text-xs text-gray-500">使用率</div>
          </div>
        )}
      </div>
      {usagePercent !== null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full ${
              usagePercent >= 90 ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(100, usagePercent)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: UserAssignmentView['status'] }) {
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

// ─── Requests Tab ────────────────────────────────────────────────────────────

function KeyRequestsTab() {
  const { requests, loading, cancel } = useMyKeyRequests();

  if (loading) return <div className="text-sm text-gray-500">加载中...</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href="/settings/api-keys/request"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          新建申请
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center text-sm text-gray-500">
          尚无申请记录
        </div>
      ) : (
        requests.map((r) => (
          <RequestCard key={r.id} data={r} onCancel={() => cancel(r.id)} />
        ))
      )}
    </div>
  );
}

function RequestCard({
  data,
  onCancel,
}: {
  data: MyKeyRequest;
  onCancel: () => Promise<boolean>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600">
              {data.provider}
            </span>
            <RequestStatusBadge status={data.status} />
          </div>
          {data.reason && (
            <div className="text-sm text-gray-700">{data.reason}</div>
          )}
          <div className="text-xs text-gray-500">
            提交于 {new Date(data.createdAt).toLocaleString()}
            {data.handledAt &&
              ` · 处理于 ${new Date(data.handledAt).toLocaleString()}`}
          </div>
          {data.rejectionReason && (
            <div className="text-xs text-red-600">
              拒绝理由：{data.rejectionReason}
            </div>
          )}
        </div>
        {data.status === 'PENDING' && (
          <button
            onClick={() => {
              if (confirm('确定撤销该申请吗？')) void onCancel();
            }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            撤销
          </button>
        )}
      </div>
    </div>
  );
}

function RequestStatusBadge({ status }: { status: MyKeyRequest['status'] }) {
  const config = {
    PENDING: {
      color: 'bg-amber-50 text-amber-700',
      icon: Clock,
      label: '审核中',
    },
    APPROVED: {
      color: 'bg-emerald-50 text-emerald-700',
      icon: CheckCircle2,
      label: '已批准',
    },
    REJECTED: {
      color: 'bg-red-50 text-red-700',
      icon: XCircle,
      label: '已拒绝',
    },
    CANCELLED: {
      color: 'bg-gray-50 text-gray-600',
      icon: XCircle,
      label: '已撤销',
    },
  }[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${config.color}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function formatUsd(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}
