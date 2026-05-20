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
  Coins,
  FileText,
  Layers,
  ListChecks,
  Send,
} from 'lucide-react';
import {
  ComputeUsagePanel,
  MissionFlowView,
  MissionTodoBoard,
  ReferencesPanel,
  TeamRosterPanel,
} from '@/components/agent-playground';
import {
  MissionDetailFrame,
  MissionActionGroup,
  type MissionActionButtonSpec,
} from '@/components/common/mission-detail';
import { cn } from '@/lib/utils/common';
import { deriveView } from '@/lib/features/agent-playground/derive';
import { deriveTodoLedger } from '@/lib/features/agent-playground/todo-ledger';
import { useAgentPlaygroundStream } from '@/hooks/features/useAgentPlaygroundStream';
import { useSocialTask } from '@/hooks/domain/useSocialTasks';
import {
  cancelSocialTask,
  retrySocialTask,
} from '@/services/ai-social/task-api';
import { RefreshCw } from 'lucide-react';
import { SocialPublishPanel } from './SocialPublishPanel';
import { deriveSocialStages } from '@/lib/features/ai-social/derive-social-stages';
import type { SocialContentTaskStatus } from '@/services/ai-social/task-types';
import { LoadingSkeleton } from '@/components/ui/states/LoadingState';

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

function ReportTab({
  task,
}: {
  task: NonNullable<ReturnType<typeof useSocialTask>['task']>;
}) {
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
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
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
            <div className="whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
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
    [events, view.mission, view.agents, view.verdicts, view.dimensionPipelines]
  );

  const [activeTab, setActiveTab] = useState<TabKey>('tasks');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

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

  const canCancel = task?.status === 'PENDING' || task?.status === 'GENERATING';

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
    }
  };

  const handleRetry = async () => {
    if (!task || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await retrySocialTask(task.id);
      refresh();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
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

  // ── 左 panel 底部按钮组（playground 标杆：按状态决定显示哪些） ──
  const actionButtons: MissionActionButtonSpec[] = [];
  if (task?.status === 'FAILED') {
    actionButtons.push({
      variant: 'primary',
      emoji: '↻',
      label: retrying ? '重新启动中…' : '重试任务',
      title: '重新启动 mission（保留原 sources / platforms）',
      disabled: retrying,
      onClick: () => void handleRetry(),
    });
  }
  if (task?.status === 'DRAFT_READY') {
    actionButtons.push({
      variant: 'primary',
      emoji: '📤',
      label: '发布到草稿箱',
      title: '发布到平台草稿箱',
      onClick: () => setActiveTab('publish'),
    });
  }
  if (canCancel) {
    actionButtons.push({
      variant: 'danger',
      emoji: '⏹',
      label: '取消',
      title: '取消运行中的任务',
      disabled: cancelling,
      onClick: () => void handleCancel(),
    });
  }

  return (
    <MissionDetailFrame
      onBack={() => router.push('/ai-social')}
      backTitle="返回 AI Social"
      brandGradient="from-rose-500 to-pink-600"
      HeaderIcon={Send}
      title={
        isLoading ? <LoadingSkeleton lines={1} className="w-48" /> : taskTitle
      }
      subtitle={
        <>
          <span className="font-mono text-[10px]">{taskId.slice(0, 8)}</span>
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
                        : p
                  )
                  .join(' / ')}
              </span>
            </>
          )}
        </>
      }
      statusPill={
        task ? (
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1',
              statusConfig.pillClass
            )}
          >
            <span
              className={cn('h-2 w-2 rounded-full', statusConfig.dotClass)}
            />
            <span className="text-xs font-medium">{statusConfig.label}</span>
          </div>
        ) : null
      }
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabActiveColor="border-rose-500 text-rose-600"
      leftCollapsed={leftCollapsed}
      onLeftCollapseToggle={() => setLeftCollapsed((v) => !v)}
      leftPanel={
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto">
            {missionId ? (
              <div className="space-y-0 divide-y divide-gray-100">
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
            ) : (
              <div className="p-4 text-center text-sm text-gray-400">
                <p>任务尚未关联 Mission</p>
                <p className="mt-1 text-xs">生成开始后团队信息将在此展示</p>
              </div>
            )}
          </div>
          {/* Action buttons - sticky 底部（playground 标杆位置） */}
          {actionButtons.length > 0 && (
            <div className="border-t border-gray-100 p-4">
              <MissionActionGroup buttons={actionButtons} />
            </div>
          )}
        </div>
      }
    >
      {/* === Tab content === */}
      {activeTab === 'tasks' && (
        <>
          {task?.status === 'FAILED' ? (
            <div className="flex h-full items-start justify-center overflow-auto p-8">
              <div className="w-full max-w-2xl rounded-2xl border border-red-200 bg-white shadow-sm">
                <div className="border-b border-red-100 bg-gradient-to-r from-red-50 to-rose-50 px-6 py-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-red-900">
                        任务执行失败
                      </h3>
                      <p className="mt-0.5 text-sm text-red-700">
                        AI Teams 在生成过程中遇到错误，未能输出内容。
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 px-6 py-5">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      错误原因
                    </p>
                    <div className="font-mono break-words rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700">
                      {task.errorMessage ?? '未提供具体错误信息'}
                    </div>
                  </div>
                  {retryError && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      重试失败：{retryError}
                    </div>
                  )}
                  <p className="pt-1 text-xs text-gray-500">
                    操作按钮请点左侧团队面板底部「重试任务」
                  </p>
                </div>
              </div>
            </div>
          ) : missionId ? (
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
            <div className="flex h-full items-center justify-center p-8">
              <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-pink-100">
                  <ListChecks className="h-7 w-7 text-rose-500" />
                </div>
                <h3 className="text-base font-semibold text-gray-900">
                  等 Leader 拆完进度
                </h3>
                <p className="mt-1.5 text-sm text-gray-500">
                  任务刚被创建，AI Teams
                  正在初始化协作管线。拆解完成后，进度会以 Todo
                  卡片实时出现在此处。
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'collab' && (
        <>
          {missionId ? (
            <MissionFlowView
              view={view}
              events={events}
              stepperStages={deriveSocialStages(events)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              协作动态将在任务执行时实时展示
            </div>
          )}
        </>
      )}

      {activeTab === 'report' && task && <ReportTab task={task} />}

      {activeTab === 'references' && (
        <ReferencesPanel
          fallbackSources={task?.sources?.map((s) => s.sourceId) ?? []}
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
    </MissionDetailFrame>
  );
}
