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
  ResearchTeamModal,
  TaskListPanel,
  TeamRosterPanel,
  VerifyConsensusPanel,
} from '@/components/agent-playground';
import { useAgentPlaygroundStream } from '@/hooks/useAgentPlaygroundStream';
import {
  deriveView,
  type DimensionPipelineState,
} from '@/lib/agent-playground/derive';
import {
  cancelMission,
  getMissionDetail,
  rerunMission,
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
  const [researchTeamOpen, setResearchTeamOpen] = useState(false);
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
              dimensions={view.mission.dimensions}
              missionStatus={
                view.mission.failedAt
                  ? 'failed'
                  : view.mission.completedAt
                    ? 'completed'
                    : view.mission.startedAt
                      ? 'running'
                      : 'idle'
              }
              onCollapse={() => setLeftCollapsed(true)}
              onLeaderClick={() => setLeaderChatOpen(true)}
              onResearchTeamClick={() => setResearchTeamOpen(true)}
              onRerun={() => {
                void (async () => {
                  try {
                    const { missionId: newId } = await rerunMission(missionId);
                    router.push(`/agent-playground/research-team/${newId}`);
                  } catch (e) {
                    window.alert(
                      `启动失败：${e instanceof Error ? e.message : String(e)}`
                    );
                  }
                })();
              }}
              onUpdate={() => {
                const qs = new URLSearchParams({
                  topic: view.mission.topic ?? '',
                  depth: view.mission.depth ?? 'standard',
                  language: view.mission.language ?? 'zh-CN',
                }).toString();
                router.push(`/agent-playground/research-team?${qs}`);
              }}
              onCancel={() => {
                if (!window.confirm('确认取消该 mission？')) return;
                void (async () => {
                  try {
                    await cancelMission(missionId);
                    window.location.reload();
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    // 通用 race：mission 已经在请求送达前完成 / 失败
                    if (
                      /not running|status is/i.test(msg) ||
                      /400/i.test(msg)
                    ) {
                      window.alert(
                        'Mission 已经结束（或刚刚完成 / 失败），无需取消。页面将刷新展示最新状态。'
                      );
                      window.location.reload();
                    } else {
                      window.alert(`取消失败：${msg}`);
                    }
                  }
                })();
              }}
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

      {/* Research Team micro-pipeline modal — triggered by clicking Research Team group node */}
      <ResearchTeamModal
        open={researchTeamOpen}
        onClose={() => setResearchTeamOpen(false)}
        dimensions={view.mission.dimensions ?? []}
        agents={view.agents}
        pipelines={view.dimensionPipelines}
        onAgentClick={(taskKey) => {
          setResearchTeamOpen(false);
          setSelectedTaskKey(taskKey);
        }}
      />

      {/* Task detail drawer */}
      <TaskDetailDrawer
        agents={view.agents}
        dimensions={view.mission.dimensions}
        dimensionPipelines={view.dimensionPipelines}
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

/** 渲染 action input：识别 parallel_tool_call 子调用，URL 显示为可点击标题 + host badge */
function renderActionInputReadable(
  input: unknown,
  fallbackJson: string | null,
  urlTitleMap?: Map<string, string>
): React.ReactNode {
  if (input == null) return null;

  const safeHost = (u: string): string | null => {
    if (!/^https?:\/\//i.test(u)) return null;
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  };

  const renderOneCall = (
    tool: string,
    inp: Record<string, unknown>,
    key: string | number
  ): React.ReactNode => {
    const url =
      typeof inp.url === 'string' && /^https?:\/\//i.test(inp.url)
        ? inp.url
        : null;
    const query =
      (typeof inp.query === 'string' && inp.query) ||
      (typeof inp.q === 'string' && inp.q) ||
      null;

    if (url) {
      const host = safeHost(url);
      const title = urlTitleMap?.get(url);
      return (
        <li
          key={key}
          className="rounded-md bg-white/70 px-2 py-1.5 ring-1 ring-violet-100"
        >
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono shrink-0 rounded bg-violet-200/60 px-1.5 text-[10px] font-medium text-violet-800">
              {tool}
            </span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 break-words text-[11px] font-medium leading-snug text-sky-700 hover:underline"
              title={title || url}
            >
              {title || url}
            </a>
          </div>
          {(host || (title && title !== url)) && (
            <div className="mt-0.5 flex items-center gap-2 pl-[3.25rem] text-[9px] text-gray-500">
              {host && (
                <span className="font-mono inline-flex items-center text-sky-500">
                  🌐 {host}
                </span>
              )}
              {title && title !== url && (
                <span className="font-mono break-all text-gray-400">
                  {url.length > 80 ? url.slice(0, 80) + '…' : url}
                </span>
              )}
            </div>
          )}
        </li>
      );
    }

    if (query) {
      return (
        <li
          key={key}
          className="flex items-baseline gap-1.5 rounded bg-white/70 px-2 py-1 text-[11px] ring-1 ring-violet-100"
        >
          <span className="font-mono shrink-0 rounded bg-violet-200/60 px-1.5 text-[10px] font-medium text-violet-800">
            {tool}
          </span>
          <span className="break-words text-gray-700">"{query}"</span>
        </li>
      );
    }

    // 其他参数 → JSON 紧凑展示
    return (
      <li
        key={key}
        className="flex items-baseline gap-1.5 rounded bg-white/70 px-2 py-1 text-[11px] ring-1 ring-violet-100"
      >
        <span className="font-mono shrink-0 rounded bg-violet-200/60 px-1.5 text-[10px] font-medium text-violet-800">
          {tool}
        </span>
        <span className="font-mono break-words text-[10px] text-gray-600">
          {JSON.stringify(inp)}
        </span>
      </li>
    );
  };

  // parallel_tool_call: input 是 calls 数组（已在 derive 中归并）
  const calls = Array.isArray(input) ? input : null;
  if (calls && calls.length > 0 && calls[0] && typeof calls[0] === 'object') {
    return (
      <ul className="mt-1.5 space-y-1">
        {calls.map((c, ci) => {
          const o = c as Record<string, unknown>;
          const tool =
            (typeof o.toolId === 'string' && o.toolId) ||
            (typeof o.tool === 'string' && o.tool) ||
            'tool';
          const inp = (o.input ?? {}) as Record<string, unknown>;
          return renderOneCall(tool, inp, ci);
        })}
      </ul>
    );
  }
  // 单个 tool input
  if (typeof input === 'object') {
    return (
      <ul className="mt-1.5 space-y-1">
        {renderOneCall('input', input as Record<string, unknown>, 0)}
      </ul>
    );
  }
  // fall back
  if (!fallbackJson) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
        ▸ input (raw)
      </summary>
      <pre className="font-mono mt-1 max-h-32 overflow-auto rounded bg-white/60 p-1.5 text-[10px] text-gray-700">
        {fallbackJson.length > 2000
          ? fallbackJson.slice(0, 2000) + '\n…'
          : fallbackJson}
      </pre>
    </details>
  );
}

/** 渲染 observation output：识别 search/scrape 结果数组 → 卡片化 title+url+snippet */
function renderObservationOutputReadable(
  output: unknown,
  fallbackJson: string | null
): React.ReactNode {
  if (output == null) return null;
  // ── 提取嵌套结果，处理多层 escape \\\" → \" → " 和截断 fallback ──
  type Hit = {
    title?: string;
    url?: string;
    host?: string;
    snippet?: string;
    content?: string;
    publishedDate?: string;
    score?: number;
    domain?: string;
  };
  const hits: Hit[] = [];

  const extractHost = (u: string | undefined): string | undefined => {
    if (!u || !/^https?:\/\//i.test(u)) return undefined;
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  };

  const tryParseSafely = (s: string): unknown | null => {
    let t = s
      .trim()
      .replace(/…$/, '')
      .replace(/\.\.\.$/, '');
    for (let pass = 0; pass < 4; pass++) {
      try {
        return JSON.parse(t);
      } catch {
        if (t.includes('\\"')) {
          t = t.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          continue;
        }
        return null;
      }
    }
    return null;
  };

  const regexExtractFromString = (s: string): void => {
    let t = s;
    for (let i = 0; i < 3; i++) {
      if (!t.includes('\\"')) break;
      t = t.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    const titleRe = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const urlRe = /"url"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const dateRe = /"publishedDate"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const scoreRe = /"score"\s*:\s*([\d.]+)/g;
    const domainRe = /"domain"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const titles = [...t.matchAll(titleRe)].map((m) => m[1]);
    const urls = [...t.matchAll(urlRe)].map((m) => m[1]);
    const dates = [...t.matchAll(dateRe)].map((m) => m[1]);
    const scores = [...t.matchAll(scoreRe)].map((m) => Number(m[1]));
    const domains = [...t.matchAll(domainRe)].map((m) => m[1]);
    const n = Math.max(titles.length, urls.length);
    for (let i = 0; i < n; i++) {
      if (titles[i] || urls[i]) {
        hits.push({
          title: titles[i],
          url: urls[i],
          host: extractHost(urls[i]),
          domain: domains[i],
          publishedDate: dates[i],
          score: Number.isFinite(scores[i]) ? scores[i] : undefined,
        });
      }
    }
  };

  const visit = (node: unknown, depth = 0): void => {
    if (depth > 10 || node == null) return;
    if (typeof node === 'string') {
      const parsed = tryParseSafely(node);
      if (parsed != null) {
        visit(parsed, depth + 1);
      } else if (
        node.includes('"title"') ||
        node.includes('"url"') ||
        node.includes('\\"title\\"') ||
        node.includes('\\"url\\"')
      ) {
        regexExtractFromString(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const it of node) visit(it, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (typeof o.title === 'string' || typeof o.url === 'string') {
      const url = typeof o.url === 'string' ? o.url : undefined;
      hits.push({
        title: typeof o.title === 'string' ? o.title : undefined,
        url,
        host: extractHost(url),
        domain: typeof o.domain === 'string' ? o.domain : undefined,
        publishedDate:
          typeof o.publishedDate === 'string'
            ? o.publishedDate
            : typeof o.date === 'string'
              ? o.date
              : undefined,
        score: typeof o.score === 'number' ? o.score : undefined,
        snippet:
          typeof o.snippet === 'string'
            ? o.snippet
            : typeof o.description === 'string'
              ? o.description
              : undefined,
        content:
          typeof o.content === 'string' && o.content.length > 0
            ? o.content
            : undefined,
      });
    }
    for (const k of [
      'preview',
      'output',
      'results',
      'items',
      'hits',
      'data',
      'subResults',
    ]) {
      if (o[k] !== undefined) visit(o[k], depth + 1);
    }
  };
  visit(output);

  if (hits.length === 0) {
    if (!fallbackJson) return null;
    return (
      <details className="mt-1">
        <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
          ▸ output (raw)
        </summary>
        <pre className="font-mono mt-1 max-h-32 overflow-auto rounded bg-white/60 p-1.5 text-[10px] text-gray-700">
          {fallbackJson.length > 2000
            ? fallbackJson.slice(0, 2000) + '\n…'
            : fallbackJson}
        </pre>
      </details>
    );
  }

  // dedupe by url|title
  const seen = new Set<string>();
  const unique = hits.filter((h) => {
    const k = h.url || h.title || '';
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 聚合 host 域名 / 日期范围用于摘要 banner
  const hostCounts = new Map<string, number>();
  const dates: string[] = [];
  for (const h of unique) {
    const host = h.host || h.domain;
    if (host) hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
    if (h.publishedDate) dates.push(h.publishedDate);
  }
  const topHosts = [...hostCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  // 解析日期，找最新和平均天数
  const parsedDates = dates
    .map((d) => {
      const t = Date.parse(d);
      return Number.isFinite(t) ? t : null;
    })
    .filter((t): t is number => t != null);
  const latest =
    parsedDates.length > 0 ? new Date(Math.max(...parsedDates)) : null;
  const avgDaysAgo =
    parsedDates.length > 0
      ? Math.round(
          parsedDates.reduce((sum, t) => sum + (Date.now() - t) / 86400000, 0) /
            parsedDates.length
        )
      : null;

  return (
    <div className="mt-2 space-y-1.5">
      {/* 摘要 banner — TI 同款 */}
      <div className="rounded-md bg-sky-50/80 px-2 py-1.5 ring-1 ring-sky-100">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px]">
          <span className="font-semibold text-sky-800">
            🔍 找到 {unique.length} 条
          </span>
          {topHosts.length > 0 && (
            <span className="text-gray-500">· {topHosts.length} 个域名</span>
          )}
          {avgDaysAgo != null && (
            <span className="text-gray-500">· 平均 {avgDaysAgo} 天前</span>
          )}
          {latest && (
            <span className="text-gray-500">
              · 最新 {latest.toISOString().slice(0, 10)}
            </span>
          )}
        </div>
        {topHosts.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {topHosts.map(([h, n]) => (
              <span
                key={h}
                className="font-mono inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[9px] text-sky-700 ring-1 ring-sky-200"
              >
                {h}
                <span className="text-sky-400">{n}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Result cards — TI 风格紧凑卡片，含 host/date/score badge */}
      <ul className="space-y-1">
        {unique.map((h, i) => {
          const safe = h.url && /^https?:\/\//i.test(h.url) ? h.url : null;
          const host = h.host || h.domain;
          const snippet = h.snippet || h.content;
          return (
            <li
              key={`${h.url ?? h.title}-${i}`}
              className="rounded-md bg-white px-2 py-1.5 ring-1 ring-gray-100 hover:ring-sky-200"
            >
              <div className="flex items-baseline gap-2">
                {safe ? (
                  <a
                    href={safe}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 break-words text-[11px] font-semibold leading-snug text-sky-700 hover:underline"
                    title={h.title || safe}
                  >
                    {h.title || safe}
                  </a>
                ) : (
                  <p className="flex-1 break-words text-[11px] font-semibold text-gray-800">
                    {h.title}
                  </p>
                )}
                {h.score != null && (
                  <span className="font-mono shrink-0 rounded bg-emerald-50 px-1 text-[9px] font-medium text-emerald-700">
                    {h.score.toFixed(0)}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[9px]">
                {host && (
                  <span className="font-mono inline-flex items-center text-sky-500">
                    🌐 {host}
                  </span>
                )}
                {h.publishedDate && (
                  <span className="font-mono text-gray-400">
                    📅 {h.publishedDate}
                  </span>
                )}
              </div>
              {snippet && (
                <p className="mt-1 text-[10px] leading-relaxed text-gray-600">
                  {snippet.length > 280 ? snippet.slice(0, 280) + '…' : snippet}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 最终产出格式化 — 按 owner.role 检测 output shape 渲染卡片。
 * 替代 raw JSON dump，给人看的展示。
 */
function renderFinalOutput(
  role: string | null,
  output: Record<string, unknown>
): React.ReactNode {
  // ── Leader: { themeSummary, dimensions[] } ──
  if (
    role === 'leader' ||
    (Array.isArray(output.dimensions) &&
      typeof output.themeSummary === 'string')
  ) {
    const themeSummary = output.themeSummary as string | undefined;
    const dimensions =
      (output.dimensions as
        | { id?: string; name?: string; rationale?: string }[]
        | undefined) ?? [];
    return (
      <section className="rounded-lg border border-violet-100 bg-violet-50/30">
        <div className="border-b border-violet-100 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            最终产出 · 研究规划
          </p>
        </div>
        <div className="space-y-2 p-3">
          {themeSummary && (
            <div className="rounded-md bg-white px-3 py-2 ring-1 ring-violet-100">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                主题概要
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-800">
                {themeSummary}
              </p>
            </div>
          )}
          {dimensions.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                研究维度 · {dimensions.length} 个
              </p>
              <ul className="space-y-1.5">
                {dimensions.map((d, i) => (
                  <li
                    key={d.id ?? i}
                    className="rounded-md bg-white px-3 py-2 ring-1 ring-violet-100"
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-[10px] text-violet-500">
                        {d.id ?? `dim-${i + 1}`}
                      </span>
                      <span className="text-[12px] font-semibold text-gray-900">
                        {d.name ?? '(unnamed)'}
                      </span>
                    </div>
                    {d.rationale && (
                      <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                        {d.rationale}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Researcher: { dimension, findings[], summary } ──
  if (
    role === 'researcher' ||
    (Array.isArray(output.findings) && typeof output.summary === 'string')
  ) {
    const findings =
      (output.findings as
        | { claim?: string; evidence?: string; source?: string }[]
        | undefined) ?? [];
    const summary = output.summary as string | undefined;
    return (
      <section className="rounded-lg border border-sky-100 bg-sky-50/30">
        <div className="border-b border-sky-100 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
            最终产出 · 维度研究
          </p>
        </div>
        <div className="space-y-2 p-3">
          {summary && (
            <div className="rounded-md bg-white px-3 py-2 ring-1 ring-sky-100">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">
                综合摘要
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-800">
                {summary}
              </p>
            </div>
          )}
          {findings.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600">
                关键发现 · {findings.length} 条
              </p>
              <ul className="space-y-1.5">
                {findings.map((f, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-white px-3 py-2 ring-1 ring-sky-100"
                  >
                    <p className="text-[12px] font-medium leading-relaxed text-gray-900">
                      {f.claim ?? '(no claim)'}
                    </p>
                    {f.evidence && (
                      <p className="mt-1 text-[11px] italic text-gray-600">
                        ▸ {f.evidence}
                      </p>
                    )}
                    {f.source && (
                      <p className="font-mono mt-1 text-[10px] text-sky-500">
                        {/^https?:\/\//i.test(f.source) ? (
                          <a
                            href={f.source}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {(() => {
                              try {
                                return new URL(f.source).hostname.replace(
                                  /^www\./,
                                  ''
                                );
                              } catch {
                                return f.source;
                              }
                            })()}
                          </a>
                        ) : (
                          f.source
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Analyst: { themeSummary, insights[], contradictions[] } ──
  if (
    role === 'analyst' ||
    (Array.isArray(output.insights) && typeof output.themeSummary === 'string')
  ) {
    const insights =
      (output.insights as
        | {
            headline?: string;
            narrative?: string;
            supportingDimensions?: string[];
            confidence?: number;
          }[]
        | undefined) ?? [];
    const contradictions =
      (output.contradictions as
        | { claim?: string; resolution?: string }[]
        | undefined) ?? [];
    return (
      <section className="rounded-lg border border-amber-100 bg-amber-50/30">
        <div className="border-b border-amber-100 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            最终产出 · 整合分析
          </p>
        </div>
        <div className="space-y-2 p-3">
          {typeof output.themeSummary === 'string' && (
            <div className="rounded-md bg-white px-3 py-2 ring-1 ring-amber-100">
              <p className="text-[12px] leading-relaxed text-gray-800">
                {output.themeSummary}
              </p>
            </div>
          )}
          {insights.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                核心洞察 · {insights.length} 条
              </p>
              <ul className="space-y-1.5">
                {insights.map((ins, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-white px-3 py-2 ring-1 ring-amber-100"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="flex-1 text-[12px] font-semibold text-gray-900">
                        {ins.headline ?? '(no headline)'}
                      </p>
                      {ins.confidence != null && (
                        <span className="font-mono shrink-0 rounded bg-amber-100 px-1.5 text-[10px] text-amber-700">
                          {Math.round((ins.confidence ?? 0) * 100)}% 置信
                        </span>
                      )}
                    </div>
                    {ins.narrative && (
                      <p className="mt-1 text-[11px] leading-relaxed text-gray-700">
                        {ins.narrative}
                      </p>
                    )}
                    {ins.supportingDimensions &&
                      ins.supportingDimensions.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {ins.supportingDimensions.map((d) => (
                            <span
                              key={d}
                              className="font-mono inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-700 ring-1 ring-amber-200"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {contradictions.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                ⚠ 矛盾点 · {contradictions.length} 条
              </p>
              <ul className="space-y-1.5">
                {contradictions.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-white px-3 py-2 ring-1 ring-red-100"
                  >
                    <p className="text-[11px] font-medium text-gray-900">
                      {c.claim}
                    </p>
                    {c.resolution && (
                      <p className="mt-1 text-[10px] italic text-gray-600">
                        → {c.resolution}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Writer: ResearchReport { title, summary, sections[], conclusion } ──
  if (
    role === 'writer' ||
    (typeof output.title === 'string' && Array.isArray(output.sections))
  ) {
    const sections =
      (output.sections as
        | { heading?: string; markdown?: string; body?: string }[]
        | undefined) ?? [];
    return (
      <section className="rounded-lg border border-rose-100 bg-rose-50/30">
        <div className="border-b border-rose-100 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
            最终产出 · 研究报告
          </p>
        </div>
        <div className="space-y-2 p-3">
          {typeof output.title === 'string' && (
            <h4 className="text-base font-bold text-gray-900">
              {output.title}
            </h4>
          )}
          {typeof output.summary === 'string' && (
            <div className="rounded-md bg-white px-3 py-2 ring-1 ring-rose-100">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                摘要
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-800">
                {output.summary}
              </p>
            </div>
          )}
          {sections.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                章节 · {sections.length}
              </p>
              <ul className="space-y-1.5">
                {sections.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-white px-3 py-2 ring-1 ring-rose-100"
                  >
                    <p className="text-[12px] font-semibold text-gray-900">
                      {s.heading ?? `#${i + 1}`}
                    </p>
                    {(s.markdown || s.body) && (
                      <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-gray-600">
                        {(s.markdown ?? s.body ?? '').slice(0, 280)}
                        {(s.markdown ?? s.body ?? '').length > 280 ? '…' : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {typeof output.conclusion === 'string' && (
            <div className="rounded-md bg-white px-3 py-2 ring-1 ring-rose-100">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                结论
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-800">
                {output.conclusion}
              </p>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Reviewer: { score, decision, verdicts[] } ──
  if (
    role === 'reviewer' ||
    (Array.isArray(output.verdicts) && typeof output.score === 'number')
  ) {
    const verdicts =
      (output.verdicts as
        | {
            verifierId?: string;
            score?: number;
            critique?: string;
          }[]
        | undefined) ?? [];
    return (
      <section className="rounded-lg border border-emerald-100 bg-emerald-50/30">
        <div className="border-b border-emerald-100 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            最终产出 · Judge 共识
          </p>
        </div>
        <div className="space-y-2 p-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-700">
              {output.score as number}
            </span>
            <span className="text-[11px] text-gray-500">/ 100</span>
            {typeof output.decision === 'string' && (
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  output.decision === 'pass'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {output.decision}
              </span>
            )}
          </div>
          {verdicts.length > 0 && (
            <ul className="space-y-1.5">
              {verdicts.map((v, i) => (
                <li
                  key={i}
                  className="rounded-md bg-white px-3 py-2 ring-1 ring-emerald-100"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-gray-800">
                      {v.verifierId ?? `judge-${i + 1}`}
                    </span>
                    {v.score != null && (
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          v.score >= 80
                            ? 'text-emerald-600'
                            : v.score >= 60
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {v.score}
                      </span>
                    )}
                  </div>
                  {v.critique && (
                    <p className="mt-1 text-[11px] italic text-gray-600">
                      {v.critique}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }

  // 未识别 shape → 不渲染（避免重复显示 raw JSON）
  return null;
}

function TaskDetailDrawer({
  agents,
  dimensions,
  dimensionPipelines,
  taskKey,
  onClose,
}: {
  agents: ReturnType<typeof deriveView>['agents'];
  dimensions: MissionDetail['dimensions'] | null | undefined;
  dimensionPipelines: ReturnType<typeof deriveView>['dimensionPipelines'];
  taskKey: string | null;
  onClose: () => void;
}) {
  if (!taskKey) return null;

  // 找到对应任务的执行者（agent）+ TI-style pipeline 状态
  let owner: ReturnType<typeof deriveView>['agents'][number] | undefined;
  let title = '';
  let subtitle = '';
  let rationale = '';
  let pipeline: DimensionPipelineState | undefined = undefined;
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
    if (d?.name) pipeline = dimensionPipelines.get(d.name);
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

  // ── 衍生：解包 parallel_tool_call，提取真实子工具 + 查询参数 + 结果 ──
  type ToolCall = {
    toolId: string;
    query?: string;
    url?: string;
    rawInput?: unknown;
  };
  type SubResult = {
    toolId?: string;
    title?: string;
    url?: string;
    snippet?: string;
    content?: string;
    error?: string;
  };

  const toolCalls: ToolCall[] = [];
  const subResults: SubResult[] = [];

  for (const t of trace) {
    // ── action ──
    if (t.kind === 'action' && t.toolId) {
      if (t.toolId === 'parallel_tool_call' && Array.isArray(t.input)) {
        for (const sub of t.input as unknown[]) {
          if (sub && typeof sub === 'object') {
            const o = sub as Record<string, unknown>;
            const subTool =
              typeof o.toolId === 'string'
                ? o.toolId
                : typeof o.tool === 'string'
                  ? o.tool
                  : 'unknown';
            const inp = (o.input ?? {}) as Record<string, unknown>;
            toolCalls.push({
              toolId: subTool,
              query: typeof inp.query === 'string' ? inp.query : undefined,
              url: typeof inp.url === 'string' ? inp.url : undefined,
              rawInput: inp,
            });
          }
        }
      } else {
        const inp = (t.input ?? {}) as Record<string, unknown>;
        toolCalls.push({
          toolId: t.toolId,
          query: typeof inp.query === 'string' ? inp.query : undefined,
          url: typeof inp.url === 'string' ? inp.url : undefined,
          rawInput: inp,
        });
      }
    }

    // ── observation ── 解包 preview 数组提取所有子结果
    if (t.kind === 'observation' && !t.error) {
      const out = t.output;
      // 直接 string 含 JSON
      let parsed: unknown = out;
      if (typeof out === 'string') {
        try {
          parsed = JSON.parse(out.trim().replace(/…$/, ''));
        } catch {
          // 解析失败 → 退化用 regex
          const titleRe = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
          const urlRe = /"url"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
          const titles = [...out.matchAll(titleRe)].map((m) => m[1]);
          const urls = [...out.matchAll(urlRe)].map((m) => m[1]);
          const n = Math.max(titles.length, urls.length);
          for (let i = 0; i < n; i++) {
            if (titles[i] || urls[i]) {
              subResults.push({ title: titles[i], url: urls[i] });
            }
          }
          continue;
        }
      }
      // parsed 形态:
      //   1) { _truncated, preview: [{ output: { results: [{...}] } }, ...] }
      //   2) { results: [...] } / { items: [...] } / { hits: [...] } / { output: [...] }
      //   3) array of {title,url}
      const flatten = (node: unknown): void => {
        if (!node) return;
        // 字符串：尝试 JSON.parse 后递归（preview 字段常是 stringified JSON）
        if (typeof node === 'string') {
          const trimmed = node
            .trim()
            .replace(/…$/, '')
            .replace(/\.\.\.$/, '');
          if (
            (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
            (trimmed.endsWith('}') || trimmed.endsWith(']'))
          ) {
            try {
              flatten(JSON.parse(trimmed));
              return;
            } catch {
              // truncated JSON → regex fallback
              const titleRe = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
              const urlRe = /"url"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
              const contentRe = /"content"\s*:\s*"((?:[^"\\]|\\.){0,400})"/g;
              const titles = [...trimmed.matchAll(titleRe)].map((m) => m[1]);
              const urls = [...trimmed.matchAll(urlRe)].map((m) => m[1]);
              const contents = [...trimmed.matchAll(contentRe)].map(
                (m) => m[1]
              );
              const n = Math.max(titles.length, urls.length);
              for (let i = 0; i < n; i++) {
                if (titles[i] || urls[i]) {
                  subResults.push({
                    title: titles[i],
                    url: urls[i],
                    snippet: contents[i],
                  });
                }
              }
            }
          }
          return;
        }
        if (Array.isArray(node)) {
          for (const item of node) flatten(item);
          return;
        }
        if (typeof node !== 'object') return;
        const o = node as Record<string, unknown>;
        // 找 search-result 形 { title, url, snippet|content }
        if (typeof o.title === 'string' || typeof o.url === 'string') {
          subResults.push({
            title: typeof o.title === 'string' ? o.title : undefined,
            url: typeof o.url === 'string' ? o.url : undefined,
            snippet:
              typeof o.snippet === 'string'
                ? o.snippet
                : typeof o.description === 'string'
                  ? o.description
                  : undefined,
            content:
              typeof o.content === 'string' && o.content.length > 0
                ? o.content.slice(0, 600)
                : undefined,
          });
        }
        // 递归子集合（含 string 形 preview）
        for (const k of [
          'preview',
          'output',
          'results',
          'items',
          'hits',
          'data',
          'subResults',
        ]) {
          if (o[k] !== undefined) flatten(o[k]);
        }
      };
      flatten(parsed);
    }
  }

  // 工具使用统计：按 toolId 聚合 calls + 每个调用的 query/url（前 3 个示例）
  const toolsUsed = (() => {
    const map = new Map<string, { calls: number; samples: string[] }>();
    for (const c of toolCalls) {
      const cur = map.get(c.toolId) ?? { calls: 0, samples: [] };
      cur.calls += 1;
      const sample = c.query ?? c.url;
      if (sample && cur.samples.length < 3 && !cur.samples.includes(sample)) {
        cur.samples.push(sample);
      }
      map.set(c.toolId, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].calls - a[1].calls);
  })();

  const totalTokens = trace.reduce(
    (s, t) => s + (t.kind === 'observation' ? (t.tokensUsed ?? 0) : 0),
    0
  );

  // url → title 映射，给 action input 渲染用（让 web-scraper URL 显示真实标题）
  const urlTitleMap = (() => {
    const m = new Map<string, string>();
    for (const r of subResults) {
      if (r.url && r.title && !m.has(r.url)) {
        m.set(r.url, r.title);
      }
    }
    return m;
  })();

  // 最终产出：扫描末尾的 finalize observation 找结构化 output
  const finalOutput = (() => {
    for (let i = trace.length - 1; i >= 0; i--) {
      const t = trace[i];
      if (
        t.kind === 'observation' &&
        !t.error &&
        t.toolId === 'finalize' &&
        t.output != null &&
        typeof t.output === 'object'
      ) {
        // ReAct loop 的 finalize 通常包一层 { output: ... }
        const o = t.output as Record<string, unknown>;
        if ('output' in o && o.output != null && typeof o.output === 'object') {
          return o.output as Record<string, unknown>;
        }
        return o;
      }
    }
    return null;
  })();

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl"
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

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* 4 个统计指标 */}
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-gray-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                状态
              </p>
              <p
                className={`mt-0.5 text-xs font-semibold ${
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
            <div className="rounded-lg bg-gray-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                耗时
              </p>
              <p className="font-mono mt-0.5 text-xs font-semibold text-gray-900">
                {wallSec}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                Token
              </p>
              <p className="font-mono mt-0.5 text-xs font-semibold text-gray-900">
                {totalTokens >= 1000
                  ? `${(totalTokens / 1000).toFixed(1)}k`
                  : totalTokens || '—'}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                工具调用
              </p>
              <p className="font-mono mt-0.5 text-xs font-semibold text-gray-900">
                {toolsUsed.reduce((s, [, v]) => s + v.calls, 0) || '—'}
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

          {/* 6-STAGE MICRO PIPELINE 顶栏 — 仅 researcher 任务 */}
          {taskKey?.startsWith('researcher-') &&
            (() => {
              const stagesDef: {
                key:
                  | 'researcher'
                  | 'outline'
                  | 'chapter-write'
                  | 'chapter-review'
                  | 'integrator'
                  | 'judge';
                label: string;
              }[] = [
                { key: 'researcher', label: '采集' },
                { key: 'outline', label: '大纲' },
                { key: 'chapter-write', label: '撰写' },
                { key: 'chapter-review', label: '审核' },
                { key: 'integrator', label: '整合' },
                { key: 'judge', label: '评分' },
              ];
              const status = (
                k: (typeof stagesDef)[number]['key']
              ): 'idle' | 'running' | 'done' | 'failed' => {
                if (k === 'researcher') {
                  if (!owner) return 'idle';
                  if (owner.phase === 'completed') return 'done';
                  if (owner.phase === 'failed') return 'failed';
                  if (owner.phase === 'running') return 'running';
                  return 'idle';
                }
                if (!pipeline) return 'idle';
                if (k === 'outline') {
                  return pipeline.chapters.length > 0 ? 'done' : 'idle';
                }
                if (k === 'chapter-write') {
                  if (pipeline.chapters.length === 0) return 'idle';
                  if (pipeline.chapters.every((c) => c.status === 'passed'))
                    return 'done';
                  if (pipeline.chapters.some((c) => c.status === 'failed'))
                    return 'failed';
                  if (
                    pipeline.chapters.some(
                      (c) =>
                        c.status === 'writing' ||
                        c.status === 'reviewing' ||
                        c.status === 'revising'
                    )
                  )
                    return 'running';
                  return 'idle';
                }
                if (k === 'chapter-review') {
                  if (pipeline.chapters.length === 0) return 'idle';
                  if (pipeline.chapters.every((c) => c.status === 'passed'))
                    return 'done';
                  if (
                    pipeline.chapters.some(
                      (c) => c.status === 'reviewing' || c.status === 'revising'
                    )
                  )
                    return 'running';
                  return 'idle';
                }
                if (k === 'integrator') {
                  if (pipeline.totalWordCount != null) return 'done';
                  if (pipeline.chapters.every((c) => c.status === 'passed'))
                    return 'running';
                  return 'idle';
                }
                if (k === 'judge') {
                  if (pipeline.grade) return 'done';
                  if (pipeline.totalWordCount != null) return 'running';
                  return 'idle';
                }
                return 'idle';
              };
              return (
                <section className="rounded-lg border border-sky-100 bg-gradient-to-br from-sky-50/50 to-blue-50/30">
                  <div className="border-b border-sky-100 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      Micro Pipeline
                    </p>
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto px-3 py-3">
                    {stagesDef.map((s, si) => {
                      const st = status(s.key);
                      return (
                        <div
                          key={s.key}
                          className="flex shrink-0 items-center gap-1"
                        >
                          <div
                            className={`flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 ring-1 ${
                              st === 'idle'
                                ? 'bg-gray-50 text-gray-400 ring-gray-200'
                                : st === 'running'
                                  ? 'bg-blue-100 text-blue-700 ring-blue-300'
                                  : st === 'done'
                                    ? 'bg-emerald-100 text-emerald-700 ring-emerald-300'
                                    : 'bg-red-100 text-red-700 ring-red-300'
                            }`}
                          >
                            <span className="text-[11px] font-medium">
                              {s.label}
                            </span>
                            <span className="text-[9px]">
                              {st === 'done'
                                ? '✓ 已完成'
                                : st === 'running'
                                  ? '⟳ 进行中'
                                  : st === 'failed'
                                    ? '✗ 失败'
                                    : '○ 待启动'}
                            </span>
                          </div>
                          {si < stagesDef.length - 1 && (
                            <span className="font-mono text-[12px] text-gray-300">
                              →
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

          {/* TI-style PER-DIMENSION CHAPTER PIPELINE 状态 */}
          {pipeline && pipeline.chapters.length > 0 && (
            <section className="rounded-lg border border-emerald-100 bg-emerald-50/30">
              <div className="border-b border-emerald-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  章节进度 · {pipeline.chapters.length} 章
                  {pipeline.totalWordCount
                    ? ` · 共 ${pipeline.totalWordCount} 字`
                    : ''}
                </p>
              </div>
              <ul className="space-y-1.5 p-2">
                {pipeline.chapters.map((c) => (
                  <li
                    key={c.index}
                    className="rounded-md bg-white px-2.5 py-2 text-[11px] ring-1 ring-emerald-100"
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-[10px] text-emerald-600">
                        #{c.index}
                      </span>
                      <span className="flex-1 font-medium text-gray-800">
                        {c.heading}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          c.status === 'passed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : c.status === 'writing'
                              ? 'bg-blue-100 text-blue-700'
                              : c.status === 'reviewing'
                                ? 'bg-amber-100 text-amber-700'
                                : c.status === 'revising'
                                  ? 'bg-orange-100 text-orange-700'
                                  : c.status === 'failed'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {c.status === 'passed'
                          ? '已通过'
                          : c.status === 'writing'
                            ? '撰写中'
                            : c.status === 'reviewing'
                              ? '评审中'
                              : c.status === 'revising'
                                ? `重写第 ${c.attempts} 轮`
                                : c.status === 'failed'
                                  ? '失败'
                                  : '待启动'}
                      </span>
                    </div>
                    {c.thesis && (
                      <p className="mt-0.5 text-[10px] leading-relaxed text-gray-600">
                        {c.thesis}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                      {c.wordCount != null && c.wordCount > 0 && (
                        <span>{c.wordCount} 字</span>
                      )}
                      {c.score != null && (
                        <span
                          className={`font-mono font-semibold ${
                            c.score >= 80
                              ? 'text-emerald-600'
                              : c.score >= 60
                                ? 'text-amber-600'
                                : 'text-red-600'
                          }`}
                        >
                          {c.score}/100
                        </span>
                      )}
                      {c.attempts > 1 && (
                        <span className="text-orange-600">
                          已重写 {c.attempts - 1} 次
                        </span>
                      )}
                    </div>
                    {c.critique && (
                      <p className="mt-1 line-clamp-2 text-[10px] italic text-gray-500">
                        ▸ {c.critique}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 5-AXIS QUALITY GRADE — TI 同款 */}
          {pipeline?.grade && (
            <section className="rounded-lg border border-violet-100 bg-gradient-to-br from-violet-50/40 to-purple-50/30">
              <div className="flex items-center justify-between border-b border-violet-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                  维度质量评分
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    pipeline.grade.grade === 'excellent'
                      ? 'bg-emerald-100 text-emerald-700'
                      : pipeline.grade.grade === 'good'
                        ? 'bg-blue-100 text-blue-700'
                        : pipeline.grade.grade === 'fair'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                  }`}
                >
                  {pipeline.grade.grade === 'excellent'
                    ? '优秀'
                    : pipeline.grade.grade === 'good'
                      ? '良好'
                      : pipeline.grade.grade === 'fair'
                        ? '一般'
                        : '不及格'}
                </span>
              </div>
              <div className="px-3 py-3">
                <div className="mb-3 flex items-baseline gap-2">
                  <span
                    className={`text-3xl font-bold ${
                      pipeline.grade.overall >= 85
                        ? 'text-emerald-600'
                        : pipeline.grade.overall >= 70
                          ? 'text-blue-600'
                          : pipeline.grade.overall >= 55
                            ? 'text-amber-600'
                            : 'text-red-600'
                    }`}
                  >
                    {pipeline.grade.overall}
                  </span>
                  <span className="text-[11px] text-gray-500">/100</span>
                </div>
                <ul className="space-y-1.5">
                  {(
                    [
                      ['breadth', '广度'],
                      ['depth', '深度'],
                      ['evidence', '证据'],
                      ['coherence', '连贯性'],
                      ['freshness', '时效性'],
                    ] as const
                  ).map(([k, label]) => {
                    const a = pipeline.grade!.axes[k];
                    if (!a) return null;
                    return (
                      <li key={k}>
                        <div className="flex items-baseline justify-between text-[11px]">
                          <span className="text-gray-700">{label}</span>
                          <span
                            className={`font-mono font-semibold ${
                              a.score >= 80
                                ? 'text-emerald-600'
                                : a.score >= 60
                                  ? 'text-amber-600'
                                  : 'text-red-600'
                            }`}
                          >
                            {a.score}
                          </span>
                        </div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full ${
                              a.score >= 80
                                ? 'bg-emerald-400'
                                : a.score >= 60
                                  ? 'bg-amber-400'
                                  : 'bg-red-400'
                            }`}
                            style={{ width: `${a.score}%` }}
                          />
                        </div>
                        {a.comment && (
                          <p className="mt-0.5 text-[10px] leading-relaxed text-gray-500">
                            {a.comment}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {pipeline.grade.summary && (
                  <p className="mt-3 rounded bg-white/70 px-2 py-1.5 text-[11px] leading-relaxed text-gray-700 ring-1 ring-violet-100">
                    {pipeline.grade.summary}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* 最终产出 — 按 owner.role 检测 output shape 卡片化 */}
          {finalOutput && renderFinalOutput(owner?.role ?? null, finalOutput)}

          {/* TOOLS USED — 按工具聚合调用次数 / 累计 token / 错误数 */}
          {toolsUsed.length > 0 && (
            <section className="rounded-lg border border-gray-100 bg-white">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                  使用工具 · {toolsUsed.length} 个
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2">
                {toolsUsed.map(([tool, v]) => (
                  <span
                    key={tool}
                    className="font-mono inline-flex items-center gap-1.5 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200"
                    title={`${tool} · 调用 ${v.calls} 次`}
                  >
                    {tool}
                    <span className="rounded-full bg-violet-200/70 px-1.5 text-[9px] text-violet-800">
                      ×{v.calls}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* 执行过程 — 业务流时间线：思考 → 工具调用 → 结果 → 反思 → … */}
          {(() => {
            const flowItems = trace.filter(
              (t) =>
                t.kind === 'thought' ||
                t.kind === 'action' ||
                t.kind === 'observation' ||
                t.kind === 'reflection'
            );
            if (flowItems.length === 0) return null;
            return (
              <section className="rounded-lg border border-gray-100 bg-white">
                <div className="border-b border-gray-100 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                    执行过程 · 思考 → 调用工具 → 结果 → 反思
                  </p>
                </div>
                <ol className="relative space-y-2 p-3">
                  {flowItems.map((t, i) => {
                    const tone =
                      t.kind === 'thought'
                        ? {
                            ring: 'ring-amber-200',
                            bg: 'bg-amber-50/60',
                            label: '思考',
                            chip: 'bg-amber-100 text-amber-700',
                          }
                        : t.kind === 'action'
                          ? {
                              ring: 'ring-violet-200',
                              bg: 'bg-violet-50/60',
                              label: '调用工具',
                              chip: 'bg-violet-100 text-violet-700',
                            }
                          : t.kind === 'observation'
                            ? t.error
                              ? {
                                  ring: 'ring-red-200',
                                  bg: 'bg-red-50/60',
                                  label: '结果(失败)',
                                  chip: 'bg-red-100 text-red-700',
                                }
                              : {
                                  ring: 'ring-sky-200',
                                  bg: 'bg-sky-50/60',
                                  label: '结果',
                                  chip: 'bg-sky-100 text-sky-700',
                                }
                            : {
                                ring: 'ring-purple-200',
                                bg: 'bg-purple-50/60',
                                label: '反思',
                                chip: 'bg-purple-100 text-purple-700',
                              };
                    return (
                      <li
                        key={`${t.ts}-${i}`}
                        className={`rounded-lg px-3 py-2 ring-1 ${tone.ring} ${tone.bg}`}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.chip}`}
                          >
                            {tone.label}
                          </span>
                          {t.toolId && (
                            <span className="font-mono rounded bg-white/60 px-1.5 py-0.5 text-[10px] text-gray-700">
                              {t.toolId}
                            </span>
                          )}
                          {t.latencyMs != null && (
                            <span className="font-mono text-[10px] text-gray-500">
                              {t.latencyMs}ms
                            </span>
                          )}
                          {t.tokensUsed != null && t.tokensUsed > 0 && (
                            <span className="font-mono text-[10px] text-gray-500">
                              +{t.tokensUsed}tk
                            </span>
                          )}
                        </div>
                        {/* 思考 / 反思：直接展示文本 */}
                        {(t.kind === 'thought' || t.kind === 'reflection') &&
                          t.text && (
                            <p className="text-[12px] leading-relaxed text-gray-800">
                              {t.text}
                            </p>
                          )}
                        {/* 调用工具：URL/query 列表 + 可点击 */}
                        {t.kind === 'action' &&
                          renderActionInputReadable(
                            t.input,
                            t.input != null
                              ? typeof t.input === 'string'
                                ? t.input
                                : JSON.stringify(t.input, null, 2)
                              : null,
                            urlTitleMap
                          )}
                        {/* 结果：search/scrape 卡片化，否则 fallback 紧凑 JSON 预览 */}
                        {t.kind === 'observation' &&
                          !t.error &&
                          renderObservationOutputReadable(
                            t.output,
                            t.output != null
                              ? typeof t.output === 'string'
                                ? t.output
                                : JSON.stringify(t.output, null, 2)
                              : null
                          )}
                        {t.kind === 'observation' && t.error && (
                          <p className="text-[12px] text-red-700">
                            ⚠ {t.error}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })()}

          {/* 失败时优先抓出失败原因 */}
          {phase === 'failed' &&
            (() => {
              const failureMsg = (() => {
                // 1) 优先：orchestrator 写入的 lifecycle.error（已用 extractFailureMessage 提取）
                if (owner?.failureMessage) return owner.failureMessage;
                // 2) trace 里的 error 事件
                for (let i = trace.length - 1; i >= 0; i--) {
                  const t = trace[i];
                  if (t.kind === 'error' && t.error) return t.error;
                  if (t.kind === 'observation' && t.error) return t.error;
                }
                // 3) 兜底：最后一条 observation 的输出截断
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
            <details className="group rounded-lg border border-gray-100 bg-gray-50/30">
              <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-100">
                原始执行轨迹 · {trace.length} 条 ▾
              </summary>
              <ul className="space-y-1.5 p-2">
                {trace.map((t, i) => {
                  // 把 action / observation 的 input/output 转成 raw JSON 字符串
                  const dump = (v: unknown): string | null => {
                    if (v == null) return null;
                    if (typeof v === 'string') return v;
                    try {
                      return JSON.stringify(v, null, 2);
                    } catch {
                      return String(v);
                    }
                  };
                  const inputStr = dump(t.input);
                  const outputStr = dump(t.output);
                  return (
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
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-semibold">{t.kind}</span>
                        {t.toolId ? (
                          <span className="font-mono rounded bg-white/60 px-1.5 text-[10px]">
                            {t.toolId}
                          </span>
                        ) : null}
                        {t.latencyMs != null && (
                          <span className="font-mono text-[10px] opacity-60">
                            {t.latencyMs}ms
                          </span>
                        )}
                        {t.tokensUsed != null && t.tokensUsed > 0 && (
                          <span className="font-mono text-[10px] opacity-60">
                            +{t.tokensUsed}tk
                          </span>
                        )}
                      </div>
                      {t.text ? (
                        <p className="mt-1 whitespace-pre-wrap break-words">
                          {t.text}
                        </p>
                      ) : null}
                      {/* 原始 input/output JSON dump — friendly 视图已在执行过程 timeline */}
                      {inputStr && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
                            ▸ input
                          </summary>
                          <pre className="font-mono mt-1 max-h-64 overflow-auto rounded bg-white/60 p-1.5 text-[10px] text-gray-700">
                            {inputStr.length > 6000
                              ? inputStr.slice(0, 6000) + '\n…(已截断)'
                              : inputStr}
                          </pre>
                        </details>
                      )}
                      {outputStr && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
                            ▸ output
                          </summary>
                          <pre className="font-mono mt-1 max-h-64 overflow-auto rounded bg-white/60 p-1.5 text-[10px] text-gray-700">
                            {outputStr.length > 6000
                              ? outputStr.slice(0, 6000) + '\n…(已截断)'
                              : outputStr}
                          </pre>
                        </details>
                      )}
                      {t.error ? (
                        <p className="mt-1 whitespace-pre-wrap break-words font-medium">
                          ⚠{' '}
                          {t.error.length > 400
                            ? t.error.slice(0, 400) + '…'
                            : t.error}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : (
            <p className="rounded-lg bg-gray-50 px-3 py-3 text-center text-[11px] text-gray-500">
              {phase === 'running'
                ? 'Mission 正在后台执行 · 等待该 Agent 的 trace 事件流入…'
                : phase === 'pending'
                  ? '该 Agent 尚未启动'
                  : 'trace 事件流已从内存释放（Railway recycle 后历史 mission 仅保留持久化字段）'}
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
