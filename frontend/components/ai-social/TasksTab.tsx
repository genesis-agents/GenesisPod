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
  Send,
  RotateCw,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Inbox,
  BookMarked,
  Compass,
  FlaskConical,
  PenLine,
  FileText,
  Lightbulb,
  Bot,
  Link2,
  ChevronRight,
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

// 后端 7 个 data source 的 sourceType → 友好显示
const SOURCE_TYPE_META: Record<
  string,
  { label: string; Icon: typeof BookMarked }
> = {
  AI_LIBRARY: { label: '我的知识库', Icon: BookMarked },
  AI_EXPLORE: { label: 'AI 探索', Icon: Compass },
  AI_RESEARCH: { label: 'AI 研究', Icon: FlaskConical },
  AI_WRITING: { label: 'AI 写作', Icon: PenLine },
  AI_OFFICE: { label: 'AI Office', Icon: FileText },
  AI_TOPIC_INSIGHTS: { label: '专题洞察', Icon: Lightbulb },
  AI_PLAYGROUND: { label: 'Agent 实验场', Icon: Bot },
};

function getSourceMeta(sourceType: string) {
  return SOURCE_TYPE_META[sourceType] ?? { label: sourceType, Icon: FileText };
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
  const canRetry =
    task.status === 'FAILED' || task.status === 'PARTIAL_PUBLISHED';
  const externalUrls = (task.versions ?? [])
    .filter((v) => v.externalUrl)
    .map((v) => ({ platform: v.platform, url: v.externalUrl! }));

  // 标题优先级：AI 生成标题 > 用户 prompt 截断 > "任务+id"
  const generatedTitle = task.versions?.[0]?.title?.trim();
  const promptTitle = task.prompt?.trim().slice(0, 60);
  const title = generatedTitle || promptTitle || `任务 ${task.id.slice(0, 8)}`;
  const titleStyle = generatedTitle
    ? 'font-semibold text-gray-900'
    : promptTitle
      ? 'font-medium text-gray-800'
      : 'font-mono text-sm text-gray-500';

  // 来源摘要：首个 sourceType 友好名 + "+N"；外链单独标
  const sources = task.sources ?? [];
  const urlCount = task.externalUrls.length;
  const firstSource = sources[0];
  const firstSourceMeta = firstSource
    ? getSourceMeta(firstSource.sourceType)
    : null;
  const extraSourceCount = sources.length > 1 ? sources.length - 1 : 0;

  const platformLabel = task.platforms
    .map((p) =>
      p === 'WECHAT_MP' ? '微信公众号' : p === 'XIAOHONGSHU' ? '小红书' : p
    )
    .join(' · ');

  return (
    <tr
      className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-rose-50/40"
      onClick={onClick}
    >
      <td className="px-4 py-3.5">
        <div className={`line-clamp-1 ${titleStyle}`} title={title}>
          {title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
          <span>{formatRelative(task.createdAt)}</span>
          {task.missionId && (
            <span className="font-mono text-[10px] text-gray-400">
              · {task.missionId.slice(0, 8)}
            </span>
          )}
        </div>
        {task.errorMessage && (
          <div
            className="mt-1 line-clamp-1 text-xs text-red-600"
            title={task.errorMessage}
          >
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {task.errorMessage}
          </div>
        )}
      </td>
      <td className="px-4 py-3.5">
        {firstSourceMeta ? (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
              <firstSourceMeta.Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="line-clamp-1 text-sm text-gray-700">
                {firstSourceMeta.label}
              </div>
              {(extraSourceCount > 0 || urlCount > 0) && (
                <div className="text-[11px] text-gray-400">
                  {extraSourceCount > 0 && `+${extraSourceCount} 项`}
                  {extraSourceCount > 0 && urlCount > 0 && ' · '}
                  {urlCount > 0 && `${urlCount} 外链`}
                </div>
              )}
            </div>
          </div>
        ) : urlCount > 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Link2 className="h-3.5 w-3.5 text-gray-500" />
            {urlCount} 外链
          </div>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-sm text-gray-700">{platformLabel}</td>
      <td className="px-4 py-3.5">
        <StatusPill status={task.status} />
      </td>
      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {/* 状态相关的快捷操作 */}
          {task.status === 'DRAFT_READY' && (
            <button
              type="button"
              onClick={onClick}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-600"
              title="发布到草稿箱"
            >
              <Send className="h-3.5 w-3.5" />
              发布
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={onClick}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
              title="进入详情重试"
            >
              <RotateCw className="h-3.5 w-3.5" />
              重试
            </button>
          )}
          {externalUrls.length > 0 && (
            <a
              href={externalUrls[0].url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg p-1.5 text-emerald-500 transition-colors hover:bg-emerald-100"
              title="打开发布链接"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600"
              title="取消任务"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {/* 默认 hover 露出 → 进详情指示 */}
          <ChevronRight className="ml-1 h-4 w-4 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
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

  const handleCreated = (_taskId: string) => {
    // ★ R1 P1-1 fix (2026-05-18): 方案 §3.3 用户原话 U5 — "用户操作完事，
    //   列表行进入'生成中'，用户走人"。不立即跳详情页；列表 SWR 自动 revalidate
    //   出新行 status=PENDING/GENERATING，用户自己点行才进 mission 详情。
    setDialogOpen(false);
    refresh();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {(
            [
              'ALL',
              'PENDING',
              'GENERATING',
              'DRAFT_READY',
              'PUBLISHED',
              'FAILED',
            ] as const
          ).map((s) => (
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
              {s === 'ALL'
                ? t('aiSocial.tasks.filter.all')
                : STATUS_STYLES[s].label}{' '}
              {counters[s] != null && (
                <span className="ml-1 opacity-70">({counters[s]})</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refresh()}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50"
            title="刷新"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
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
              <th className="w-[40%] px-4 py-3">内容</th>
              <th className="w-[20%] px-4 py-3">来源</th>
              <th className="w-[15%] px-4 py-3">平台</th>
              <th className="w-[12%] px-4 py-3">状态</th>
              <th className="w-[13%] px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && tasks.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </td>
              </tr>
            )}
            {!isLoading && tasks.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-gray-400"
                >
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
