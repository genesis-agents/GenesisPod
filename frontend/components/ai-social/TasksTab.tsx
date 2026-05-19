'use client';

/**
 * TasksTab — 意图驱动重设计 v1 列表（PR-V5）
 *
 * 替代旧 ContentsTab（写内容 + 平台连接），改为：
 *   - 顶部 [+ 新建任务] → 弹出 NewTaskDialog
 *   - 行点击 → 跳转 /ai-social/mission/{taskId}
 *   - 每行显示 "Agent Team 状态" 列 + 按 status 显示操作按钮
 *
 * 数据源：useSocialTasks（GET /ai-social/tasks 轮询 5s）
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  Trash2,
  Eye,
  Send,
  RotateCw,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Inbox,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  useSocialTasks,
  cancelTaskAndRefresh,
} from '@/hooks/domain/useSocialTasks';
import type {
  SocialContentTask,
  SocialContentTaskStatus,
} from '@/services/ai-social/task-types';
import { NewTaskDialog } from './NewTaskDialog';
import { logger } from '@/lib/utils/logger';

// Status pill style + label fallback
const STATUS_STYLES: Record<
  SocialContentTaskStatus,
  { bg: string; text: string; label: string; icon: typeof Loader2 }
> = {
  PENDING: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    label: '待启动',
    icon: Inbox,
  },
  GENERATING: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    label: '生成中',
    icon: Loader2,
  },
  DRAFT_READY: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    label: '草稿就绪',
    icon: CheckCircle2,
  },
  PUBLISHING: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    label: '发布中',
    icon: Loader2,
  },
  PUBLISHED: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    label: '已发布',
    icon: CheckCircle2,
  },
  PARTIAL_PUBLISHED: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    label: '部分发布',
    icon: AlertTriangle,
  },
  FAILED: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    label: '失败',
    icon: XCircle,
  },
  CANCELLED: {
    bg: 'bg-gray-100',
    text: 'text-gray-500',
    label: '已取消',
    icon: XCircle,
  },
};

function StatusPill({ status }: { status: SocialContentTaskStatus }) {
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  const spinning =
    status === 'GENERATING' || status === 'PUBLISHING' ? 'animate-spin' : '';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      <Icon className={`h-3 w-3 ${spinning}`} />
      {style.label}
    </span>
  );
}

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return d.toLocaleDateString();
}

function TaskRow({
  task,
  onClick,
  onCancel,
}: {
  task: SocialContentTask;
  onClick: () => void;
  onCancel: () => void;
}) {
  const canCancel = task.status === 'PENDING' || task.status === 'GENERATING';
  const canRetry = task.status === 'FAILED' || task.status === 'PARTIAL_PUBLISHED';
  const externalUrls = (task.versions ?? [])
    .filter((v) => v.externalUrl)
    .map((v) => ({ platform: v.platform, url: v.externalUrl! }));

  // Title from first version, or fallback to task id slice
  const title =
    task.versions?.[0]?.title ?? `任务 ${task.id.slice(0, 8)}`;
  const sourceCount = task.sources?.length ?? 0;
  const urlCount = task.externalUrls.length;
  const platformLabel = task.platforms
    .map((p) => (p === 'WECHAT_MP' ? '微信' : p === 'XIAOHONGSHU' ? '小红书' : p))
    .join(' · ');

  return (
    <tr
      className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-rose-50/40"
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{title}</div>
        <div className="text-xs text-gray-500">
          {formatRelative(task.createdAt)}
          {task.errorMessage && (
            <span className="ml-2 text-red-600">· {task.errorMessage.slice(0, 60)}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {sourceCount > 0 && `${sourceCount} 项`}
        {sourceCount > 0 && urlCount > 0 && ' + '}
        {urlCount > 0 && `${urlCount} URL`}
        {sourceCount === 0 && urlCount === 0 && '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{platformLabel}</td>
      <td className="px-4 py-3">
        <StatusPill status={task.status} />
      </td>
      <td
        className="px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClick}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="查看详情"
          >
            <Eye className="h-4 w-4" />
          </button>
          {task.status === 'DRAFT_READY' && (
            <button
              type="button"
              onClick={onClick}
              className="rounded p-1.5 text-rose-500 transition-colors hover:bg-rose-100"
              title="发布到草稿箱"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={onClick}
              className="rounded p-1.5 text-amber-500 transition-colors hover:bg-amber-100"
              title="重试"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          )}
          {externalUrls.length > 0 && (
            <a
              href={externalUrls[0].url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1.5 text-emerald-500 transition-colors hover:bg-emerald-100"
              title="外链"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600"
              title="取消"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function TasksTab() {
  const router = useRouter();
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<SocialContentTaskStatus | 'ALL'>('ALL');

  const { tasks, isLoading, error, refresh } = useSocialTasks({
    status: filter === 'ALL' ? undefined : filter,
    refreshIntervalMs: 5000,
  });

  // group / counters for filter chips
  const counters = useMemo(() => {
    const c: Partial<Record<SocialContentTaskStatus | 'ALL', number>> = {
      ALL: tasks.length,
    };
    for (const task of tasks) {
      c[task.status] = (c[task.status] ?? 0) + 1;
    }
    return c;
  }, [tasks]);

  const handleRowClick = (task: SocialContentTask) => {
    router.push(`/ai-social/mission/${task.id}`);
  };

  const handleCancel = (task: SocialContentTask) => {
    cancelTaskAndRefresh(task.id, refresh).catch((err: unknown) => {
      logger.warn('[TasksTab] cancel failed:', err);
    });
  };

  const handleCreated = (taskId: string) => {
    setDialogOpen(false);
    refresh();
    router.push(`/ai-social/mission/${taskId}`);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {(['ALL', 'PENDING', 'GENERATING', 'DRAFT_READY', 'PUBLISHED', 'FAILED'] as const).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded-full px-3 py-1 transition-colors ${
                  filter === s
                    ? 'bg-rose-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s === 'ALL' ? t('aiSocial.tasks.filter.all') : STATUS_STYLES[s].label}{' '}
                {counters[s] != null && (
                  <span className="ml-1 opacity-70">({counters[s]})</span>
                )}
              </button>
            ),
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refresh()}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50"
            title="刷新"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-rose-500/25 transition-all hover:shadow-lg hover:shadow-rose-500/30"
          >
            <Plus className="h-4 w-4" />
            {t('aiSocial.tasks.create')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {String(error instanceof Error ? error.message : error)}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3">标题 / 时间</th>
              <th className="px-4 py-3">来源</th>
              <th className="px-4 py-3">平台</th>
              <th className="px-4 py-3">Agent Team 状态</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  <Inbox className="mx-auto mb-2 h-8 w-8" />
                  <div className="text-sm">{t('aiSocial.tasks.empty')}</div>
                  <button
                    type="button"
                    onClick={() => setDialogOpen(true)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <Plus className="h-3 w-3" />
                    {t('aiSocial.tasks.create')}
                  </button>
                </td>
              </tr>
            )}
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onClick={() => handleRowClick(task)}
                onCancel={() => handleCancel(task)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <NewTaskDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
