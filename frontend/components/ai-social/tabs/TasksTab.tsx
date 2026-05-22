'use client';

/**
 * TasksTab — AI 社媒主页列表（卡片网格）
 *
 * 2026-05-21 重构：废弃 spreadsheet 表格（内容/来源/平台/状态/操作 5 列"硬凑"，
 * 与全站不一致），改用 canonical `AssetCard` 网格 + `Tabs(pill)` 筛选 + `StatusBadge`
 * + `CreateCard` + 页面级 `LoadingState`/`EmptyState`，对齐 Research/Writing/Library/
 * Playground 全站主页形态（mission 兄弟 Agent Playground 也是卡片网格）。
 *
 * 数据源：useSocialTasks（GET /ai-social/tasks 轮询 5s）；点卡片 → /ai-social/mission/{id}
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
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
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  AssetCard,
  type AssetCardBadge,
  type AssetCardAction,
} from '@/components/ui/cards/asset-card';
import { CreateCard } from '@/components/ui/cards/CreateCard';
import { StatusBadge, type BadgeTone } from '@/components/ui/badges';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { LoadingState } from '@/components/ui/states';
import { useTranslation } from '@/lib/i18n';
import {
  useSocialTasks,
  cancelTaskAndRefresh,
} from '@/hooks/domain/useSocialTasks';
import type {
  SocialContentTask,
  SocialContentTaskStatus,
} from '@/services/ai-social/task-types';
import { NewTaskDialog } from '../dialogs/NewTaskDialog';
import { logger } from '@/lib/utils/logger';

// 任务状态 → canonical StatusBadge 的 tone / 图标 / 文案
const STATUS_META: Record<
  SocialContentTaskStatus,
  { tone: BadgeTone; icon: LucideIcon; label: string; pulse?: boolean }
> = {
  PENDING: { tone: 'neutral', icon: Inbox, label: '待启动' },
  GENERATING: { tone: 'running', icon: Loader2, label: '生成中', pulse: true },
  DRAFT_READY: { tone: 'success', icon: CheckCircle2, label: '草稿就绪' },
  PUBLISHING: { tone: 'warning', icon: Loader2, label: '发布中', pulse: true },
  PUBLISHED: { tone: 'success', icon: CheckCircle2, label: '已发布' },
  PARTIAL_PUBLISHED: {
    tone: 'warning',
    icon: AlertTriangle,
    label: '部分发布',
  },
  FAILED: { tone: 'danger', icon: XCircle, label: '失败' },
  CANCELLED: { tone: 'neutral', icon: XCircle, label: '已取消' },
};

// 后端 data source 的 sourceType → 友好显示
const SOURCE_TYPE_META: Record<string, { label: string; Icon: LucideIcon }> = {
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

// 卡片图标渐变（按 id hash 取色，与全站 getProjectGradient 同款，避免整页 rose 单色）
const CARD_GRADIENTS = [
  'from-rose-500 to-pink-600',
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-teal-600',
  'from-fuchsia-500 to-pink-600',
  'from-indigo-500 to-blue-600',
  'from-sky-500 to-indigo-600',
];
function getCardGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return CARD_GRADIENTS[Math.abs(hash) % CARD_GRADIENTS.length];
}

function platformLabelOf(task: SocialContentTask): string {
  return task.platforms
    .map((p) =>
      p === 'WECHAT_MP' || p === 'WECHAT_ARTICLE'
        ? '微信公众号'
        : p === 'XIAOHONGSHU' || p === 'XIAOHONGSHU_NOTE'
          ? '小红书'
          : p
    )
    .join(' · ');
}

function taskTitleOf(task: SocialContentTask): string {
  const autoTitle = task.title?.trim();
  const generatedTitle = task.versions?.[0]?.title?.trim();
  const promptTitle = task.prompt?.trim().slice(0, 60);
  return (
    autoTitle ||
    generatedTitle ||
    promptTitle ||
    (task.status === 'GENERATING' || task.status === 'PENDING'
      ? '生成中…'
      : task.status === 'FAILED'
        ? '未生成（任务失败）'
        : task.status === 'CANCELLED'
          ? '已取消'
          : '未命名任务')
  );
}

const FILTER_KEYS = [
  'ALL',
  'PENDING',
  'GENERATING',
  'DRAFT_READY',
  'PUBLISHED',
  'FAILED',
] as const;

export default function TasksTab() {
  const router = useRouter();
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<SocialContentTaskStatus | 'ALL'>('ALL');

  const { tasks, isLoading, error, refresh } = useSocialTasks({
    status: filter === 'ALL' ? undefined : filter,
    refreshIntervalMs: 5000,
  });

  const counters = useMemo(() => {
    const c: Partial<Record<SocialContentTaskStatus | 'ALL', number>> = {
      ALL: tasks.length,
    };
    for (const task of tasks) c[task.status] = (c[task.status] ?? 0) + 1;
    return c;
  }, [tasks]);

  // 计数仅在「全部」视图准确（筛选时 tasks 只含该状态，其余 tab 计数会失实 → 不显示）
  const filterItems = FILTER_KEYS.map((s) => ({
    key: s,
    label: s === 'ALL' ? t('aiSocial.tasks.filter.all') : STATUS_META[s].label,
    count: filter === 'ALL' ? (counters[s] ?? 0) : undefined,
  }));

  const handleCancel = (task: SocialContentTask) => {
    void cancelTaskAndRefresh(task.id, refresh).catch((err: unknown) => {
      logger.warn('[TasksTab] cancel failed:', err);
    });
  };

  const renderCard = (task: SocialContentTask) => {
    const meta = STATUS_META[task.status];
    const sources = task.sources ?? [];
    const firstSource = sources[0];
    const urlCount = task.externalUrls.length;

    const badges: AssetCardBadge[] = [];
    if (firstSource) {
      const sm = getSourceMeta(firstSource.sourceType);
      const extra = sources.length > 1 ? ` +${sources.length - 1}` : '';
      badges.push({
        key: 'source',
        label: `${sm.label}${extra}`,
        icon: <sm.Icon className="h-3 w-3" />,
      });
    }
    if (urlCount > 0) {
      badges.push({
        key: 'url',
        label: `${urlCount} 外链`,
        icon: <Link2 className="h-3 w-3" />,
      });
    }
    badges.push({
      key: 'platform',
      label: platformLabelOf(task),
      className: 'bg-rose-50 text-rose-600',
    });

    const extraActions: AssetCardAction[] = [];
    const externalUrl = (task.versions ?? []).find(
      (v) => v.externalUrl
    )?.externalUrl;
    if (externalUrl) {
      extraActions.push({
        key: 'open',
        title: '打开发布链接',
        tone: 'success',
        icon: <ExternalLink className="h-4 w-4" />,
        onClick: () => window.open(externalUrl, '_blank', 'noopener'),
      });
    }
    if (task.status === 'DRAFT_READY') {
      extraActions.push({
        key: 'publish',
        title: '发布到草稿箱',
        tone: 'info',
        icon: <Send className="h-4 w-4" />,
        onClick: () => router.push(`/ai-social/mission/${task.id}`),
      });
    }
    if (task.status === 'FAILED' || task.status === 'PARTIAL_PUBLISHED') {
      extraActions.push({
        key: 'retry',
        title: '进入详情重试',
        tone: 'warning',
        icon: <RotateCw className="h-4 w-4" />,
        onClick: () => router.push(`/ai-social/mission/${task.id}`),
      });
    }
    // 删除/取消（运营型操作，不走 isOwner 标准管理槽 —— 任务无"编辑"语义）
    const canCancel = task.status === 'PENDING' || task.status === 'GENERATING';
    extraActions.push({
      key: 'delete',
      title: canCancel ? '取消任务（保留记录）' : '删除任务',
      tone: 'danger',
      icon: <Trash2 className="h-4 w-4" />,
      onClick: () => handleCancel(task),
    });

    return (
      <AssetCard
        key={task.id}
        title={taskTitleOf(task)}
        icon={<FileText className="h-6 w-6 text-white" />}
        gradient={getCardGradient(task.id)}
        badges={badges}
        extraActions={extraActions}
        onClick={() => router.push(`/ai-social/mission/${task.id}`)}
        customSection={
          <div className="space-y-1.5">
            <StatusBadge
              tone={meta.tone}
              label={meta.label}
              icon={meta.icon}
              pulse={meta.pulse}
            />
            {task.errorMessage && (
              <p
                className="line-clamp-2 text-xs text-red-600"
                title={task.errorMessage}
              >
                {task.errorMessage}
              </p>
            )}
          </div>
        }
        timestamp={task.createdAt}
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar：canonical Tabs(pill) 筛选 + 刷新 + 新建 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          variant="pill"
          size="sm"
          value={filter}
          onChange={(k) => setFilter(k as SocialContentTaskStatus | 'ALL')}
          items={filterItems}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50"
            title="刷新"
            aria-label="刷新"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
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

      {isLoading && tasks.length === 0 ? (
        <LoadingState text={t('aiSocial.loading')} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-12 w-12" />}
          title={t('aiSocial.tasks.empty')}
          action={{
            label: t('aiSocial.tasks.create'),
            onClick: () => setDialogOpen(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tasks.map(renderCard)}
          <CreateCard
            title={t('aiSocial.tasks.create')}
            onClick={() => setDialogOpen(true)}
          />
        </div>
      )}

      <NewTaskDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false);
          refresh();
        }}
      />
    </div>
  );
}
