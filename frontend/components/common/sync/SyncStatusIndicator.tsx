'use client';

import { RefreshCw, Check, AlertTriangle, Clock, Loader2 } from 'lucide-react';

export type SyncStatus =
  | 'synced'
  | 'syncing'
  | 'pending'
  | 'conflict'
  | 'error'
  | 'not_connected';

interface SyncStatusIndicatorProps {
  status: SyncStatus;
  lastSyncAt?: Date | string | null;
  pendingChanges?: {
    local?: number;
    remote?: number;
    conflicts?: number;
  };
  className?: string;
  showLabel?: boolean;
}

const statusConfig: Record<
  SyncStatus,
  {
    icon: typeof Check;
    color: string;
    bgColor: string;
    label: string;
  }
> = {
  synced: {
    icon: Check,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    label: 'Synced',
  },
  syncing: {
    icon: Loader2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Syncing...',
  },
  pending: {
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    label: 'Pending',
  },
  conflict: {
    icon: AlertTriangle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    label: 'Conflict',
  },
  error: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Error',
  },
  not_connected: {
    icon: RefreshCw,
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    label: 'Not Connected',
  },
};

export function SyncStatusIndicator({
  status,
  lastSyncAt,
  pendingChanges,
  className = '',
  showLabel = true,
}: SyncStatusIndicatorProps) {
  const config = statusConfig[status] || statusConfig.not_connected;
  const Icon = config.icon;

  const formatLastSync = (date: Date | string | null | undefined): string => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const hasPendingChanges =
    pendingChanges &&
    ((pendingChanges.local || 0) > 0 ||
      (pendingChanges.remote || 0) > 0 ||
      (pendingChanges.conflicts || 0) > 0);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`flex items-center gap-1.5 rounded-full px-2 py-1 ${config.bgColor}`}
      >
        <Icon
          className={`h-3.5 w-3.5 ${config.color} ${status === 'syncing' ? 'animate-spin' : ''}`}
        />
        {showLabel && (
          <span className={`text-xs font-medium ${config.color}`}>
            {config.label}
          </span>
        )}
      </div>

      {hasPendingChanges && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          {(pendingChanges.local || 0) > 0 && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
              {pendingChanges.local} local
            </span>
          )}
          {(pendingChanges.remote || 0) > 0 && (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">
              {pendingChanges.remote} remote
            </span>
          )}
          {(pendingChanges.conflicts || 0) > 0 && (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700">
              {pendingChanges.conflicts} conflicts
            </span>
          )}
        </div>
      )}

      {lastSyncAt && status !== 'syncing' && (
        <span className="text-xs text-gray-400">
          Last: {formatLastSync(lastSyncAt)}
        </span>
      )}
    </div>
  );
}
