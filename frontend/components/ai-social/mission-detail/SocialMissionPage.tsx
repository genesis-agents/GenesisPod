'use client';

/**
 * SocialMissionPage — AI Social 任务详情主容器（PR-V7）
 *
 * 布局：
 *   Header: [← 返回] [icon] 任务标题 + meta  [状态 pill] [发布到草稿箱] [取消/删除]
 *   Body:   左 360px 可折叠 TeamRosterPanel + 右 flex-1 tabbed content
 *   Tabs:   任务列表 / 协作动态 / 输出报告 / 参考文献 / 算力消耗 / 发布
 *
 * 复用 agent-playground 组件，不修改任何 playground 文件。
 * 如 prop 签名不兼容，用最小适配层（props 转换）而非改原组件。
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Coins,
  FileText,
  Layers,
  ListChecks,
  MoreHorizontal,
  Send,
  XCircle,
} from 'lucide-react';
import {
  ComputeUsagePanel,
  MissionFlowView,
  MissionTodoBoard,
  ReferencesPanel,
  TeamRosterPanel,
} from '@/components/agent-playground';
import { cn } from '@/lib/utils/common';
import { deriveView } from '@/lib/agent-playground/derive';
import { deriveTodoLedger } from '@/lib/agent-playground/todo-ledger';
import { useAgentPlaygroundStream } from '@/hooks/useAgentPlaygroundStream';
import { useSocialTask } from '@/hooks/domain/useSocialTasks';
import { cancelSocialTask } from '@/services/ai-social/task-api';
import { SocialPublishPanel } from './SocialPublishPanel';
import type { SocialContentTaskStatus } from '@/services/ai-social/task-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'tasks' | 'collab' | 'report' | 'references' | 'cost' | 'publish';

const TABS: { key: TabKey; label: string; Icon: typeof Activity }[] = [
  { key: 'tasks', label: '任务列表', Icon: ListChecks },
  { key: 'collab', label: '协作动态', Icon: Activity },
  { key: 'report', label: '输出报告', Icon: FileText },
  { key: 'references', label: '参考文献', Icon: Layers },
  { key: 'cost', label: '算力消耗', Icon: Coins },
  { key: 'publish', label: '发布', Icon: Send },
];

// ─── Status pill config ───────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  dotClass: string;
  pillClass: string;
}

const STATUS_CONFIG: Record<SocialContentTaskStatus, StatusConfig> = {
  PENDING: {
    label: '等待中',
    dotClass: 'bg-gray-400',
    pillClass: 'bg-gray-100 text-gray-700',
  },
  GENERATING: {
    label: '生成中',
    dotClass: 'bg-blue-500 animate-pulse',
    pillClass: 'bg-blue-50 text-blue-700',
  },
  DRAFT_READY: {
    label: '草稿就绪',
    dotClass: 'bg-emerald-500',
    pillClass: 'bg-emerald-50 text-emerald-700',
  },
  PUBLISHING: {
    label: '发布中',
    dotClass: 'bg-amber-500 animate-pulse',
    pillClass: 'bg-amber-50 text-amber-700',
  },
  PUBLISHED: {
    label: '已发布',
    dotClass: 'bg-emerald-500',
    pillClass: 'bg-emerald-50 text-emerald-700',
  },
  PARTIAL_PUBLISHED: {
    label: '部分发布',
    dotClass: 'bg-amber-500',
    pillClass: 'bg-amber-50 text-amber-700',
  },
  FAILED: {
    label: '失败',
    dotClass: 'bg-red-500',
    pillClass: 'bg-red-50 text-red-700',
  },
  CANCELLED: {
    label: '已取消',
    dotClass: 'bg-gray-400',
    pillClass: 'bg-gray-100 text-gray-600',
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface SocialMissionPageProps {
  taskId: string;
}

// ─── Report sub-tab (WeChat / 小红书) ─────────────────────────────────────────

function ReportTab({ task }: { task: NonNullable<ReturnType<typeof useSocialTask>['task']> }) {
  const platforms = task.platforms ?? [];
  const [activePlatform, setActivePlatform] = useState(platforms[0] ?? '');

  const PLATFORM_LABELS: Record<string, string> = {
    WECHAT_MP: '微信公众号',
    XIAOHONGSHU: '小红书',
  };

  const version = task.versions?.find((v) => v.platform === activePlatform);

  if (platforms.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        暂无平台版本
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Platform sub-tabs */}
      {platforms.length > 1 && (
        <div className="flex gap-1 border-b border-gray-100 px-4 py-2">
          {platforms.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setActivePlatform(p)}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
                activePlatform === p
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
              )}
            >
              {PLATFORM_LABELS[p] ?? p}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        {version ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">{version.title}</h2>
            {version.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {version.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="rounded-xl bg-gray-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-gray-700">
              {version.content || (
                <span className="text-gray-400">内容生成中…</span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-gray-400">
            {PLATFORM_LABELS[activePlatform] ?? activePlatform} 版本生成中…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SocialMissionPage({ taskId }: SocialMissionPageProps) {
  const router = useRouter();
  const { task, isLoading, refresh } = useSocialTask(taskId, {
    refreshIntervalMs: 3000,
  });

  const missionId = task?.missionId ?? null;

  // Stream — only subscribes when missionId is available
  const { events } = useAgentPlaygroundStream(missionId);

  // Derive playground view from stream events
  const view = useMemo(() => deriveView(events), [events]);

  const todoLedger = useMemo(
    () =>
      deriveTodoLedger({
        events,
        mission: view.mission,
        agents: view.agents,
        verdicts: view.verdicts,
        dimensionPipelines: view.dimensionPipelines,
      }),
    [events, view.mission, view.agents, view.verdicts, view.dimensionPipelines],
  );

  const [activeTab, setActiveTab] = useState<TabKey>('tasks');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Header — task title
  const taskTitle = useMemo(() => {
    if (!task) return '加载中…';
    const firstVersion = task.versions?.[0];
    return (
      firstVersion?.title ||
      task.prompt?.slice(0, 60) ||
      `任务 ${taskId.slice(0, 8)}`
    );
  }, [task, taskId]);

  const statusConfig = task?.status
    ? STATUS_CONFIG[task.status]
    : STATUS_CONFIG['PENDING'];

  const canCancel =
    task?.status === 'PENDING' || task?.status === 'GENERATING';
  const canDelete =
    task?.status === 'PUBLISHED' ||
    task?.status === 'FAILED' ||
    task?.status === 'CANCELLED';

  const handleCancel = async () => {
    if (!task || cancelling) return;
    setCancelling(true);
    try {
      await cancelSocialTask(task.id);
      refresh();
    } catch {
      // ignore — refresh will show updated state
    } finally {
      setCancelling(false);
      setMenuOpen(false);
    }
  };

  if (!taskId) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <p className="text-lg font-medium text-gray-700">无效的任务 ID</p>
          <button
            type="button"
            onClick={() => router.push('/ai-social')}
            className="mt-4 text-sm text-rose-600 hover:underline"
          >
            返回 AI Social
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/ai-social')}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="返回 AI Social"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-md">
              <Send className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1
                className="max-w-[320px] truncate text-base font-bold text-gray-900 sm:max-w-[480px]"
                title={taskTitle}
              >
                {isLoading ? (
                  <span className="inline-block h-5 w-48 animate-pulse rounded bg-gray-200" />
                ) : (
                  taskTitle
                )}
              </h1>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-mono text-[10px]">
                  {taskId.slice(0, 8)}
                </span>
                {task?.platforms && task.platforms.length > 0 && (
                  <>
                    <span>·</span>
                    <span>
                      {task.platforms
                        .map((p) =>
                          p === 'WECHAT_MP'
                            ? '微信公众号'
                            : p === 'XIAOHONGSHU'
                              ? '小红书'
                              : p,
                        )
                        .join(' / ')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status pill */}
          {task && (
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1',
                statusConfig.pillClass,
              )}
            >
              <span
                className={cn('h-2 w-2 rounded-full', statusConfig.dotClass)}
              />
              <span className="text-xs font-medium">{statusConfig.label}</span>
            </div>
          )}

          {/* Publish shortcut button — only DRAFT_READY */}
          {task?.status === 'DRAFT_READY' && (
            <button
              type="button"
              onClick={() => setActiveTab('publish')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 px-3 py-2 text-sm font-medium text-white shadow-md hover:shadow-lg"
            >
              <Send className="h-4 w-4" />
              发布到草稿箱
            </button>
          )}

          {/* Context menu */}
          {task && (canCancel || canDelete) && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  {canCancel && (
                    <button
                      type="button"
                      disabled={cancelling}
                      onClick={() => void handleCancel()}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4 text-amber-500" />
                      取消任务
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        // Delete handler — not implemented in this PR
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <XCircle className="h-4 w-4" />
                      删除任务
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside
          className={cn(
            'relative flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white transition-all duration-200',
            leftCollapsed ? 'w-0 overflow-hidden' : 'w-[360px]',
          )}
        >
          {!leftCollapsed && missionId && (
            <div className="space-y-0 divide-y divide-gray-100">
              {/* Team roster */}
              <div className="p-4">
                <TeamRosterPanel
                  agents={view.agents}
                  stages={view.stages}
                  missionStatus={
                    view.mission.completedAt
                      ? 'completed'
                      : view.mission.failedAt
                        ? 'failed'
                        : view.mission.cancelledAt
                          ? 'cancelled'
                          : events.length > 0
                            ? 'running'
                            : 'idle'
                  }
                  dimensions={
                    (view.mission.dimensions as
                      | { name: string; rationale?: string }[]
                      | undefined) ?? undefined
                  }
                  onCollapse={() => setLeftCollapsed(true)}
                />
              </div>

              {/* Mission cost summary */}
              {(view.cost.tokensUsed > 0 || view.cost.costUsd > 0) && (
                <div className="p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    算力消耗
                  </p>
                  <div className="space-y-1 text-xs text-gray-600">
                    <div className="flex items-center justify-between">
                      <span>Tokens</span>
                      <span className="font-mono">
                        {view.cost.tokensUsed.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>费用</span>
                      <span className="font-mono">
                        ${view.cost.costUsd.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!leftCollapsed && !missionId && (
            <div className="p-4 text-center text-sm text-gray-400">
              <p>任务尚未关联 Mission</p>
              <p className="mt-1 text-xs">生成开始后团队信息将在此展示</p>
            </div>
          )}
        </aside>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setLeftCollapsed((v) => !v)}
          className="relative z-10 flex w-5 shrink-0 items-center justify-center border-r border-gray-200 bg-white hover:bg-gray-50"
          title={leftCollapsed ? '展开左侧' : '收起左侧'}
        >
          {leftCollapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {/* Right panel — tabs */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-4">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                  activeTab === key
                    ? 'border-rose-500 text-rose-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'tasks' && (
              <>
                {missionId ? (
                  <MissionTodoBoard
                    todos={todoLedger}
                    missionId={missionId}
                    agents={view.agents}
                    dimensionPipelines={view.dimensionPipelines}
                    missionTerminal={
                      !!(
                        view.mission.completedAt ||
                        view.mission.failedAt ||
                        view.mission.cancelledAt
                      )
                    }
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    任务执行后将在此展示进度
                  </div>
                )}
              </>
            )}

            {activeTab === 'collab' && (
              <>
                {missionId ? (
                  <MissionFlowView view={view} events={events} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    协作动态将在任务执行时实时展示
                  </div>
                )}
              </>
            )}

            {activeTab === 'report' && task && (
              <ReportTab task={task} />
            )}

            {activeTab === 'references' && (
              <ReferencesPanel
                fallbackSources={
                  task?.sources?.map((s) => s.sourceId) ?? []
                }
              />
            )}

            {activeTab === 'cost' && missionId && (
              <ComputeUsagePanel
                cost={view.cost}
                agents={view.agents}
                todos={todoLedger}
                dimensionPipelines={view.dimensionPipelines}
              />
            )}

            {activeTab === 'cost' && !missionId && (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                算力消耗将在任务执行后展示
              </div>
            )}

            {activeTab === 'publish' && task && (
              <SocialPublishPanel task={task} onAction={refresh} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
