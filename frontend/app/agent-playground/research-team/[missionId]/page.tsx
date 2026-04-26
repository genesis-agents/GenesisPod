'use client';

/**
 * Mission Detail Page — 完全照搬 Topic Insights TopicResearchLayout 视觉结构
 *
 * Header: ← back · 🎯 gradient icon · title + meta · status pill + actions
 * Main: 360px collapsible left team + flex-1 right tabbed content
 * Tabs: Live Collab / Report / Verify / Sources / Cost & Memory / Raw Events
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Coins,
  Database,
  FileText,
  Gavel,
  Layers,
  ListChecks,
  RefreshCw,
} from 'lucide-react';
import {
  AgentLiveGrid,
  CapabilityMeters,
  CostBreakdownPanel,
  LeaderChatModal,
  MemoryIndexPanel,
  PipelineTimeline,
  RawEventLog,
  ReportPanel,
  TaskListPanel,
  TeamRosterPanel,
  VerifyConsensusPanel,
} from '@/components/agent-playground';
import { useAgentPlaygroundStream } from '@/hooks/useAgentPlaygroundStream';
import { deriveView } from '@/lib/agent-playground/derive';
import {
  getMissionDetail,
  type MissionDetail,
} from '@/lib/api/agent-playground';

type TabKey = 'tasks' | 'collab' | 'report' | 'references' | 'cost';

const TABS: { key: TabKey; label: string; Icon: typeof Activity }[] = [
  { key: 'tasks', label: '任务列表', Icon: ListChecks },
  { key: 'collab', label: '协作动态', Icon: Activity },
  { key: 'report', label: '输出报告', Icon: FileText },
  { key: 'references', label: '参考文献', Icon: Layers },
  { key: 'cost', label: '算力消耗', Icon: Coins },
];

const ArrowLeftIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 19l-7-7m0 0l7-7m-7 7h18"
    />
  </svg>
);

export default function MissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const missionId = params?.missionId as string;
  const invalidId = !missionId || missionId === 'undefined';
  const { events, connState, error } = useAgentPlaygroundStream(
    invalidId ? null : missionId
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const [persisted, setPersisted] = useState<MissionDetail | null>(null);
  useEffect(() => {
    if (invalidId) return;
    let cancelled = false;
    getMissionDetail(missionId)
      .then((d) => {
        if (!cancelled) setPersisted(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [missionId, invalidId]);

  const view = useMemo(() => {
    const liveView = deriveView(events);
    if (events.length === 0 && persisted) {
      // Synthesize stages and agents skeleton from persisted snapshot so the
      // detail page is informative even after Railway recycles the in-memory
      // event buffer (replay only returns events still in buffer).
      const isCompleted = persisted.status === 'completed';
      const isFailed = persisted.status === 'failed';
      const dims = (persisted.dimensions ?? []) as {
        id?: string;
        name: string;
        rationale?: string;
      }[];

      const stages: typeof liveView.stages = [
        { id: 'leader', status: isCompleted || isFailed ? 'done' : 'pending' },
        {
          id: 'researchers',
          status: isCompleted ? 'done' : isFailed ? 'failed' : 'pending',
        },
        {
          id: 'analyst',
          status: isCompleted ? 'done' : isFailed ? 'failed' : 'pending',
        },
        {
          id: 'writer',
          status: isCompleted ? 'done' : isFailed ? 'failed' : 'pending',
        },
        {
          id: 'reviewer',
          status: isCompleted ? 'done' : isFailed ? 'failed' : 'pending',
        },
      ];

      const synthAgents: typeof liveView.agents = [];
      if (isCompleted || isFailed) {
        const phase = isCompleted ? 'completed' : 'failed';
        synthAgents.push({
          agentId: 'leader',
          role: 'leader',
          phase,
          trace: [],
        });
        for (let i = 0; i < dims.length; i++) {
          synthAgents.push({
            agentId: `researcher#${i + 1}`,
            role: 'researcher',
            phase,
            dimension: dims[i].name,
            trace: [],
          });
        }
        for (const r of ['analyst', 'writer', 'reviewer'] as const) {
          synthAgents.push({ agentId: r, role: r, phase, trace: [] });
        }
      }

      return {
        ...liveView,
        mission: {
          ...liveView.mission,
          topic: persisted.topic,
          depth: persisted.depth,
          language: persisted.language,
          startedAt: new Date(persisted.startedAt).getTime(),
          completedAt: persisted.completedAt
            ? new Date(persisted.completedAt).getTime()
            : undefined,
          failedAt:
            isFailed && persisted.completedAt
              ? new Date(persisted.completedAt).getTime()
              : undefined,
          failedMessage: persisted.errorMessage ?? undefined,
          themeSummary: persisted.themeSummary ?? undefined,
          dimensions: persisted.dimensions ?? undefined,
          finalScore: persisted.finalScore ?? undefined,
        },
        stages: stages.length > 0 ? stages : liveView.stages,
        agents: synthAgents.length > 0 ? synthAgents : liveView.agents,
        cost: {
          tokensUsed: persisted.tokensUsed ?? 0,
          costUsd: persisted.costUsd ?? 0,
          byStage: liveView.cost.byStage,
        },
        memory:
          persisted.trajectoryStored != null
            ? { chunks: persisted.trajectoryStored }
            : liveView.memory,
        verdicts: persisted.verdicts ?? liveView.verdicts,
        finalReport: persisted.reportFull ?? liveView.finalReport,
      };
    }
    return liveView;
  }, [events, persisted]);

  const finishedAt = view.mission.completedAt ?? view.mission.failedAt ?? null;
  const wallTimeMs = view.mission.startedAt
    ? (finishedAt ?? now) - view.mission.startedAt
    : 0;

  // 默认进入卡片始终落到任务列表（不自动跳转 report）
  const [activeTab, setActiveTab] = useState<TabKey>('tasks');

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [leaderChatOpen, setLeaderChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);

  const allSources = useMemo(() => {
    const set = new Set<string>();
    const r = view.finalReport;
    if (r?.sections) {
      for (const s of r.sections) {
        if (s.sources) for (const u of s.sources) set.add(u);
      }
    }
    if (r?.citations) for (const u of r.citations) set.add(u);
    return [...set];
  }, [view.finalReport]);

  const isRunning = !view.mission.completedAt && !view.mission.failedAt;

  if (invalidId) {
    return (
      <div className="h-full overflow-auto bg-gray-50">
        <div className="mx-auto max-w-2xl px-8 py-16 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h1 className="text-2xl font-bold text-gray-900">找不到该 Mission</h1>
          <button
            type="button"
            onClick={() => router.push('/agent-playground')}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl"
          >
            <RefreshCw className="h-4 w-4" />
            返回 Mission 列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header — 完全照搬 TopicResearchLayout */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/agent-playground')}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="返回 Mission 列表"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
              <svg
                className="h-5 w-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-gray-900">
                {view.mission.topic ?? '研究 Mission'}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                {view.mission.depth && <span>{view.mission.depth}</span>}
                {view.mission.language && (
                  <>
                    <span>·</span>
                    <span>{view.mission.language}</span>
                  </>
                )}
                <span>·</span>
                <span className="font-mono text-[10px]">{missionId}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isRunning ? (
            <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              <span className="text-sm font-medium text-blue-700">
                研究中 · {Math.floor(wallTimeMs / 1000)}s
              </span>
            </div>
          ) : view.mission.failedAt ? (
            <div className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-sm font-medium text-red-700">已失败</span>
            </div>
          ) : view.mission.completedAt ? (
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium text-emerald-700">
                已完成
              </span>
            </div>
          ) : null}
          {/* Connection state — small tertiary indicator */}
          {connState !== 'live' && connState !== 'connecting' && (
            <span
              title={`WebSocket: ${connState}`}
              className="inline-flex h-2 w-2 rounded-full bg-amber-400"
            />
          )}
          {/* Mission settings */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="Mission 设置"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Main — flex split exactly like TopicResearchLayout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - 360px, collapsible to 48px (w-12) */}
        <div
          className={`flex-shrink-0 border-r border-gray-200 bg-white transition-all duration-300 ${
            leftCollapsed ? 'w-12' : 'w-[360px]'
          }`}
        >
          {leftCollapsed ? (
            <div className="flex h-full flex-col items-center py-4">
              <button
                type="button"
                onClick={() => setLeftCollapsed(false)}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                title="Expand team panel"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="mt-4 flex flex-col items-center gap-2">
                {isRunning && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                )}
                <span
                  className="text-xs uppercase tracking-wide text-gray-500"
                  style={{ writingMode: 'vertical-rl' }}
                >
                  Team
                </span>
              </div>
            </div>
          ) : (
            <TeamRosterPanel
              agents={view.agents}
              stages={view.stages}
              finalScore={view.mission.finalScore}
              topic={view.mission.topic}
              onCollapse={() => setLeftCollapsed(true)}
              onLeaderClick={() => setLeaderChatOpen(true)}
            />
          )}
        </div>

        {/* Right Panel - tabbed content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Status banners */}
          {(error && connState !== 'live') || view.mission.failedMessage ? (
            <div className="space-y-2 border-b border-gray-200 bg-white px-4 py-2">
              {error && connState !== 'live' && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>WebSocket 不可用 · 已退化为 4s 轮询 /replay</p>
                </div>
              )}
              {view.mission.failedMessage && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    <span className="font-medium">Mission 失败：</span>{' '}
                    {view.mission.failedMessage}
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {/* Tabs — TI style: border-b primary underline; horizontal scroll on overflow */}
          <div className="flex min-w-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
            <div className="scrollbar-thin flex min-w-0 flex-1 overflow-x-auto">
              {TABS.map((tab) => {
                const Icon = tab.Icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? 'border-violet-500 text-violet-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="shrink-0">
              <CompactMeters view={view} wallTimeMs={wallTimeMs} />
            </div>
          </div>

          {/* Tab body */}
          <div className="flex-1 overflow-auto px-6 py-5">
            {activeTab === 'tasks' && (
              <TaskListPanel
                mission={view.mission}
                stages={view.stages}
                agents={view.agents}
                selectedKey={selectedTaskKey}
                onSelect={(row) => setSelectedTaskKey(row?.key ?? null)}
              />
            )}

            {activeTab === 'collab' && (
              <div className="space-y-4">
                <PipelineTimeline stages={view.stages} />
                <AgentLiveGrid agents={view.agents} />
                <RawEventLog events={events} />
              </div>
            )}

            {activeTab === 'report' && (
              <div className="space-y-4">
                <ReportPanel
                  finalReport={view.finalReport}
                  reports={view.reports}
                  finalScore={view.mission.finalScore}
                />
                {view.verdicts.length > 0 && (
                  <VerifyConsensusPanel verdicts={view.verdicts} />
                )}
              </div>
            )}

            {activeTab === 'references' && <SourcesTab sources={allSources} />}

            {activeTab === 'cost' && (
              <div className="space-y-4">
                <CapabilityMeters view={view} wallTimeMs={wallTimeMs} />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <CostBreakdownPanel cost={view.cost} />
                  <MemoryIndexPanel memory={view.memory} />
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Trajectory 与向量记忆
                    </h3>
                  </div>
                  <p className="text-xs text-gray-600">
                    Mission 完成后，Writer envelope +
                    事件流会自动向量化进入用户记忆 namespace，未来同类 mission
                    可语义召回这些 chunks。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Leader chat modal — triggered by clicking Leader node */}
      <LeaderChatModal
        missionId={missionId}
        topic={view.mission.topic}
        open={leaderChatOpen}
        onClose={() => setLeaderChatOpen(false)}
      />

      {/* Task detail drawer */}
      <TaskDetailDrawer
        agents={view.agents}
        dimensions={view.mission.dimensions}
        taskKey={selectedTaskKey}
        onClose={() => setSelectedTaskKey(null)}
      />

      {/* Settings modal */}
      <MissionSettingsModal
        mission={view.mission}
        wallTimeMs={wallTimeMs}
        cost={view.cost}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

function TaskDetailDrawer({
  agents,
  dimensions,
  taskKey,
  onClose,
}: {
  agents: ReturnType<typeof deriveView>['agents'];
  dimensions: MissionDetail['dimensions'] | null | undefined;
  taskKey: string | null;
  onClose: () => void;
}) {
  if (!taskKey) return null;

  // 找到对应任务的执行者（agent）
  let owner: ReturnType<typeof deriveView>['agents'][number] | undefined;
  let title = '';
  let subtitle = '';
  let rationale = '';
  if (taskKey === 'leader') {
    owner = agents.find((a) => a.role === 'leader');
    title = '拆分研究维度';
    subtitle = 'Leader 规划';
  } else if (taskKey.startsWith('researcher-')) {
    const dimKey = taskKey.replace('researcher-', '');
    const d = (dimensions ?? []).find((x) => (x.id ?? x.name) === dimKey);
    owner = agents.find(
      (a) => a.role === 'researcher' && a.dimension === d?.name
    );
    title = `维度研究：${d?.name ?? ''}`;
    subtitle = owner?.agentId ?? 'Dimension Researcher';
    rationale = d?.rationale ?? '';
  } else if (
    taskKey === 'analyst' ||
    taskKey === 'writer' ||
    taskKey === 'reviewer'
  ) {
    owner = agents.find((a) => a.role === taskKey);
    title =
      taskKey === 'analyst'
        ? '整合多维度研究'
        : taskKey === 'writer'
          ? '撰写研究报告'
          : '质量评审与共识';
    subtitle =
      taskKey === 'analyst'
        ? 'Analyst 反思校验'
        : taskKey === 'writer'
          ? 'Writer 自愈循环'
          : 'Reviewer 多 Judge 投票';
  }

  const phase = owner?.phase ?? 'pending';
  const trace = owner?.trace ?? [];
  const wallSec =
    owner?.wallTimeMs != null
      ? `${(owner.wallTimeMs / 1000).toFixed(1)}s`
      : owner?.startedAt
        ? '运行中…'
        : '—';

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
              任务详情
            </p>
            <h3 className="mt-0.5 truncate text-base font-semibold text-gray-900">
              {title}
            </h3>
            <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">
                状态
              </p>
              <p
                className={`mt-0.5 text-sm font-semibold ${
                  phase === 'completed'
                    ? 'text-emerald-600'
                    : phase === 'failed'
                      ? 'text-red-600'
                      : phase === 'running'
                        ? 'text-blue-600'
                        : 'text-gray-500'
                }`}
              >
                {phase === 'completed'
                  ? '已完成'
                  : phase === 'failed'
                    ? '失败'
                    : phase === 'running'
                      ? '进行中'
                      : '待生成'}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">
                耗时
              </p>
              <p className="font-mono mt-0.5 text-sm text-gray-900">
                {wallSec}
              </p>
            </div>
          </div>

          {rationale && (
            <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                任务说明
              </p>
              <p className="text-[12px] leading-relaxed text-gray-800">
                {rationale}
              </p>
            </div>
          )}

          {/* 失败时优先抓出失败原因（最后一个 error trace 或最后一个带 error 的 observation） */}
          {phase === 'failed' &&
            (() => {
              const failureMsg = (() => {
                for (let i = trace.length - 1; i >= 0; i--) {
                  const t = trace[i];
                  if (t.kind === 'error' && t.error) return t.error;
                  if (t.kind === 'observation' && t.error) return t.error;
                }
                // 兜底：最后一条 observation 的输出截断
                for (let i = trace.length - 1; i >= 0; i--) {
                  const t = trace[i];
                  if (t.kind === 'observation' && t.output) {
                    const s =
                      typeof t.output === 'string'
                        ? t.output
                        : JSON.stringify(t.output);
                    return s.length > 400 ? s.slice(0, 400) + '…' : s;
                  }
                }
                return null;
              })();
              return (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-red-700">
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v3m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    失败原因
                  </p>
                  <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-red-800">
                    {failureMsg ??
                      '该 Agent 失败，但未捕获明确的错误信息。请在协作动态 / 事件时间线 tab 查看完整事件流。'}
                  </p>
                </div>
              );
            })()}

          {trace.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                执行轨迹 · {trace.length} 条
              </p>
              <ul className="space-y-1.5">
                {trace.slice(-30).map((t, i) => (
                  <li
                    key={`${t.ts}-${i}`}
                    className={`rounded-md px-2 py-1.5 text-[11px] leading-relaxed ${
                      t.kind === 'thought'
                        ? 'bg-amber-50 text-amber-900'
                        : t.kind === 'action'
                          ? 'bg-violet-50 text-violet-900'
                          : t.kind === 'observation'
                            ? t.error
                              ? 'bg-red-50 text-red-900'
                              : 'bg-sky-50 text-sky-900'
                            : t.kind === 'reflection'
                              ? 'bg-purple-50 text-purple-900'
                              : 'bg-red-50 text-red-900'
                    }`}
                  >
                    <span className="font-semibold">{t.kind}</span>
                    {t.toolId ? (
                      <span className="font-mono ml-1 text-[10px] opacity-75">
                        · {t.toolId}
                      </span>
                    ) : null}
                    {t.text ? (
                      <p className="mt-0.5 whitespace-pre-wrap break-words">
                        {t.text.length > 400
                          ? t.text.slice(0, 400) + '…'
                          : t.text}
                      </p>
                    ) : null}
                    {t.error ? (
                      <p className="mt-0.5 whitespace-pre-wrap break-words font-medium">
                        ⚠{' '}
                        {t.error.length > 400
                          ? t.error.slice(0, 400) + '…'
                          : t.error}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-lg bg-gray-50 px-3 py-3 text-center text-[11px] text-gray-500">
              暂无执行轨迹（mission 已完成、事件流已从内存释放）
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MissionSettingsModal({
  mission,
  wallTimeMs,
  cost,
  open,
  onClose,
}: {
  mission: ReturnType<typeof deriveView>['mission'];
  wallTimeMs: number;
  cost: ReturnType<typeof deriveView>['cost'];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Mission 设置</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <SettingRow label="深度" value={mission.depth ?? '—'} />
            <SettingRow label="语言" value={mission.language ?? '—'} />
            <SettingRow
              label="耗时"
              value={`${Math.floor(wallTimeMs / 1000)}s`}
            />
            <SettingRow
              label="累计 token"
              value={
                cost.tokensUsed >= 1000
                  ? `${(cost.tokensUsed / 1000).toFixed(1)}k`
                  : String(cost.tokensUsed)
              }
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
            <p className="font-semibold">配置编辑暂未开放</p>
            <p className="mt-0.5">
              当前 mission 的 depth / language
              等参数在创建时锁定。如需调整，请回到 Playground 列表新建 mission。
            </p>
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-100 bg-gray-50/50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="font-mono mt-0.5 truncate text-sm text-gray-900">{value}</p>
    </div>
  );
}

// Compact inline meters in the tab bar (cost / score / wall / memory)
function CompactMeters({
  view,
  wallTimeMs,
}: {
  view: ReturnType<typeof deriveView>;
  wallTimeMs: number;
}) {
  const fmtTokens = (n: number) =>
    n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;
  const fmtTime = (ms: number) =>
    ms < 60_000 ? `${Math.floor(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m`;

  return (
    <div className="hidden items-center gap-4 whitespace-nowrap text-xs text-gray-500 lg:flex">
      <span className="flex items-center gap-1">
        <Coins className="h-3.5 w-3.5 text-amber-500" />
        {fmtTokens(view.cost.tokensUsed)} tk
      </span>
      {view.mission.finalScore != null && (
        <span className="flex items-center gap-1">
          <Gavel className="h-3.5 w-3.5 text-violet-500" />
          {view.mission.finalScore} / 100
        </span>
      )}
      <span className="flex items-center gap-1">
        <Activity className="h-3.5 w-3.5 text-sky-500" />
        {fmtTime(wallTimeMs)}
      </span>
    </div>
  );
}

function SourcesTab({ sources }: { sources: string[] }) {
  // 把 URL 按域名聚类便于浏览
  const grouped = (() => {
    const map = new Map<string, string[]>();
    for (const u of sources) {
      let host = '其它';
      try {
        host = new URL(u).hostname.replace(/^www\./, '');
      } catch {
        // ignore non-URLs
      }
      const arr = map.get(host) ?? [];
      arr.push(u);
      map.set(host, arr);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  })();

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Layers className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-gray-900">参考文献</h3>
        <span className="ml-auto text-xs text-gray-500">
          {sources.length} 个唯一来源 · {grouped.length} 个域名
        </span>
      </div>
      {sources.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/40 px-4 py-8 text-center">
          <Layers className="mx-auto mb-2 h-7 w-7 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">暂无引用来源</p>
          <p className="mt-1 text-[11px] text-gray-500">
            Researcher / Writer 在报告中引用 URL 后会自动收集到这里
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([host, urls]) => (
            <div
              key={host}
              className="rounded-xl border border-gray-100 bg-gray-50/30"
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <span className="font-mono text-[11px] font-semibold text-gray-700">
                  {host}
                </span>
                <span className="text-[10px] text-gray-500">
                  {urls.length} 条
                </span>
              </div>
              <ul className="space-y-1 p-2">
                {urls.map((u, i) => {
                  const safe = /^https?:\/\//i.test(u) ? u : null;
                  return (
                    <li
                      key={`${u}-${i}`}
                      className="rounded-md px-2 py-1.5 hover:bg-violet-50/40"
                    >
                      {safe ? (
                        <a
                          href={safe}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 break-all text-[11px] text-violet-700 underline-offset-2 hover:underline"
                        >
                          {safe}
                        </a>
                      ) : (
                        <span
                          className="line-clamp-2 break-all text-[11px] text-gray-400"
                          title="non-http(s) source filtered"
                        >
                          {u}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
