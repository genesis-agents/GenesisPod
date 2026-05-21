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
  Coins,
  Crown,
  FileText,
  Image as ImageIcon,
  Layers,
  ListChecks,
  PenTool,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import {
  ComputeUsagePanel,
  MissionFlowView,
  ReferencesPanel,
} from '@/components/agent-playground';
import {
  MissionDetailFrame,
  MissionActionGroup,
  MissionTaskList,
  RoleCard,
  type MissionActionButtonSpec,
} from '@/components/common/mission-detail';
import { SideDrawer } from '@/components/common/drawers/SideDrawer';
import {
  TeamTopologyCanvas,
  type TeamTopologyNode,
  type TeamTopologyConnection,
  type TeamNodeStatus,
} from '@/components/common/team-topology';
import { cn } from '@/lib/utils/common';
import { deriveView } from '@/lib/features/agent-playground/derive';
import { deriveTodoLedger } from '@/lib/features/agent-playground/todo-ledger';
import {
  deriveSocialView,
  type SocialStageStatus,
  type SocialStageView,
  type SocialMissionView,
} from '@/lib/features/ai-social/derive-social';
import { Modal } from '@/components/ui/dialogs/Modal';
import DOMPurify from 'isomorphic-dompurify';
import { useSocialMissionStream } from '@/hooks/features/useSocialMissionStream';
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
import { Tabs } from '@/components/ui/tabs';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'tasks' | 'collab' | 'report' | 'references' | 'cost';

const TABS: { key: TabKey; label: string; Icon: typeof Activity }[] = [
  { key: 'tasks', label: '任务列表', Icon: ListChecks },
  { key: 'collab', label: '协作动态', Icon: Activity },
  { key: 'report', label: '输出报告', Icon: FileText },
  { key: 'references', label: '参考文献', Icon: Layers },
  { key: 'cost', label: '算力消耗', Icon: Coins },
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

/** social 阶段状态 → 样式（任务列表 / roster 共用；animate-pulse 合规，非 spin） */
const SOCIAL_STAGE_STATUS: Record<
  SocialStageStatus,
  { label: string; dot: string; text: string }
> = {
  pending: { label: '待执行', dot: 'bg-gray-300', text: 'text-gray-400' },
  running: {
    label: '进行中',
    dot: 'bg-blue-500 animate-pulse',
    text: 'text-blue-600',
  },
  done: { label: '已完成', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  failed: { label: '失败', dot: 'bg-red-500', text: 'text-red-600' },
};

/** social 团队拓扑布局（playground 同款 canvas，业务定角色：Leader + 流水线工种） */
const SOCIAL_TEAM: {
  role: string;
  name: string;
  icon: LucideIcon;
  colorKey: string;
  row: number;
}[] = [
  { role: 'Leader', name: 'Leader', icon: Crown, colorKey: 'purple', row: 0 },
  { role: 'Steward', name: '预算管家', icon: Coins, colorKey: 'amber', row: 1 },
  { role: 'PlatformProbe', name: '平台探测', icon: Search, colorKey: 'blue', row: 1 }, // prettier-ignore
  { role: 'ContentTransformer', name: '内容转换', icon: Wand2, colorKey: 'indigo', row: 1 }, // prettier-ignore
  {
    role: 'CoverArtist',
    name: '封面',
    icon: ImageIcon,
    colorKey: 'pink',
    row: 1,
  },
  { role: 'Composer', name: '撰稿', icon: PenTool, colorKey: 'green', row: 1 },
  { role: 'PolishReviewer', name: '润色', icon: Sparkles, colorKey: 'rose', row: 2 }, // prettier-ignore
  { role: 'PublishExecutor', name: '发布', icon: Send, colorKey: 'emerald', row: 2 }, // prettier-ignore
  { role: 'PublishVerifier', name: '验证', icon: ShieldCheck, colorKey: 'blue', row: 2 }, // prettier-ignore
];

const SOCIAL_ROLE_NODE_STATUS: Record<string, TeamNodeStatus> = {
  idle: 'idle',
  working: 'working',
  done: 'completed',
  failed: 'failed',
};

/** social view → team-topology canvas（nodes/rows/connections），Leader 居顶 fan-out */
function buildSocialTopology(view: SocialMissionView): {
  nodes: TeamTopologyNode[];
  rows: string[][];
  connections: TeamTopologyConnection[];
} {
  const statusByRole = new Map(view.roles.map((r) => [r.role, r.status]));
  const nodes: TeamTopologyNode[] = SOCIAL_TEAM.map((m) => ({
    id: m.role,
    name: m.name,
    role: m.role,
    icon: m.icon,
    colorKey: m.colorKey,
    isLeader: m.role === 'Leader',
    status:
      SOCIAL_ROLE_NODE_STATUS[statusByRole.get(m.role) ?? 'idle'] ?? 'idle',
    statusLabel: statusByRole.get(m.role) === 'working' ? '进行中' : undefined,
  }));
  const rows: string[][] = [0, 1, 2].map((r) =>
    SOCIAL_TEAM.filter((m) => m.row === r).map((m) => m.role)
  );
  const connections: TeamTopologyConnection[] = SOCIAL_TEAM.filter(
    (m) => m.role !== 'Leader'
  ).map((m) => ({ from: 'Leader', to: m.role }));
  return { nodes, rows, connections };
}

function ReportTab({
  task,
  onPublished,
}: {
  task: NonNullable<ReturnType<typeof useSocialTask>['task']>;
  onPublished?: () => void;
}) {
  const platforms = task.platforms ?? [];
  const [activePlatform, setActivePlatform] = useState(platforms[0] ?? '');

  const PLATFORM_LABELS: Record<string, string> = {
    WECHAT_MP: '微信公众号',
    XIAOHONGSHU: '小红书',
  };

  const [publishOpen, setPublishOpen] = useState(false);
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
      {/* header：平台子 tab（左）+ 发布按钮（右，参考 playground 导出位置）*/}
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2">
        <div className="min-w-0">
          {platforms.length > 1 && (
            <Tabs
              variant="pill"
              size="sm"
              value={activePlatform}
              onChange={setActivePlatform}
              items={platforms.map((p) => ({
                key: p,
                label: PLATFORM_LABELS[p] ?? p,
              }))}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => setPublishOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-700"
        >
          <Send className="h-4 w-4" />
          发布
        </button>
      </div>
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
            {version.content ? (
              <div
                className="prose prose-sm max-w-none rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(version.content),
                }}
              />
            ) : (
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-400">
                内容生成中…
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-gray-400">
            {PLATFORM_LABELS[activePlatform] ?? activePlatform} 版本生成中…
          </div>
        )}
      </div>

      {/* 发布弹层（原「发布」tab 内容收进此按钮，参考 playground 导出）*/}
      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="发布到草稿箱"
        size="lg"
      >
        <SocialPublishPanel task={task} onAction={() => onPublished?.()} />
      </Modal>
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
  const { events } = useSocialMissionStream(missionId);

  // Derive playground view from stream events
  const view = useMemo(() => deriveView(events), [events]);

  // social 自己的派生（13 阶段 + 角色 + 进度），喂左栏 roster + 任务列表（打样 P3/P4）
  const socialView = useMemo(() => deriveSocialView(events), [events]);

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
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const selectedStage =
    socialView.stages.find((s) => s.stepId === selectedStageId) ?? null;
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Header — task title
  const taskTitle = useMemo(() => {
    if (!task) return '加载中…';
    const firstVersion = task.versions?.[0];
    return (
      firstVersion?.title ||
      task.title ||
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
      title: '到「输出报告」查看内容并发布',
      onClick: () => setActiveTab('report'),
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
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        SOCIAL TEAM
                      </p>
                      <button
                        type="button"
                        onClick={() => setLeftCollapsed(true)}
                        className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        title="收起"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    </div>
                    {socialView.roles.length > 0 ? (
                      <TeamTopologyCanvas
                        {...buildSocialTopology(socialView)}
                        heightClass="h-[220px]"
                      />
                    ) : (
                      <p className="text-xs text-gray-400">
                        团队将在任务启动后展示
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
                      <span>进度</span>
                      <span className="font-mono">
                        {socialView.progress.done}/{socialView.progress.total}
                      </span>
                    </div>
                    {socialView.roles.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          关键角色
                        </p>
                        {socialView.roles.map((r) => {
                          const meta = SOCIAL_TEAM.find(
                            (m) => m.role === r.role
                          );
                          return (
                            <RoleCard
                              key={r.role}
                              label={r.label}
                              icon={meta?.icon ?? Sparkles}
                              status={
                                r.status === 'working'
                                  ? 'running'
                                  : r.status === 'done'
                                    ? 'completed'
                                    : r.status === 'failed'
                                      ? 'failed'
                                      : 'idle'
                              }
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
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
            <>
              <MissionTaskList<SocialStageView>
                items={socialView.stages}
                getRowKey={(s) => s.stepId}
                selectedKey={selectedStageId}
                onRowClick={(s) => setSelectedStageId(s.stepId)}
                emptyTitle="等待任务启动"
                emptyDescription="任务刚被创建，协作管线正在初始化。各阶段会实时出现在此处。"
                columns={[
                  {
                    key: 'idx',
                    label: '#',
                    className: 'w-12 text-gray-400',
                    render: (_s, i) => i + 1,
                  },
                  {
                    key: 'stage',
                    label: '阶段',
                    render: (s) => (
                      <span className="font-medium text-gray-900">
                        {s.label}
                      </span>
                    ),
                  },
                  {
                    key: 'role',
                    label: '角色',
                    className: 'text-gray-500',
                    render: (s) => s.role ?? '—',
                  },
                  {
                    key: 'status',
                    label: '状态',
                    className: 'w-24',
                    render: (s) => {
                      const sc = SOCIAL_STAGE_STATUS[s.status];
                      return (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-xs font-medium',
                            sc.text
                          )}
                        >
                          <span
                            className={cn('h-1.5 w-1.5 rounded-full', sc.dot)}
                          />
                          {sc.label}
                        </span>
                      );
                    },
                  },
                ]}
              />
              <SideDrawer
                open={selectedStage !== null}
                onClose={() => setSelectedStageId(null)}
                title={selectedStage?.label ?? '任务明细'}
              >
                {selectedStage && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-16 shrink-0 text-gray-500">角色</span>
                      <span className="font-medium text-gray-900">
                        {selectedStage.role ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-16 shrink-0 text-gray-500">状态</span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 font-medium',
                          SOCIAL_STAGE_STATUS[selectedStage.status].text
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            SOCIAL_STAGE_STATUS[selectedStage.status].dot
                          )}
                        />
                        {SOCIAL_STAGE_STATUS[selectedStage.status].label}
                      </span>
                    </div>
                    {selectedStage.error && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {selectedStage.error}
                      </div>
                    )}
                  </div>
                )}
              </SideDrawer>
            </>
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

      {activeTab === 'report' && task && (
        <ReportTab task={task} onPublished={refresh} />
      )}

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
    </MissionDetailFrame>
  );
}
