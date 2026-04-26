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
                    window.alert(
                      `取消失败：${e instanceof Error ? e.message : String(e)}`
                    );
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

  // 去重 search results（按 url）
  const searchHits = (() => {
    const seen = new Set<string>();
    return subResults.filter((h) => {
      const k = h.url || h.title || '';
      if (!k) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  })();

  // 取所有 thoughts（按时间）
  const thoughts = trace
    .filter((t) => t.kind === 'thought' && t.text)
    .map((t) => t.text as string);

  // 取所有 reflections
  const reflections = trace
    .filter((t) => t.kind === 'reflection' && t.text)
    .map((t) => t.text as string);

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

          {/* TOOLS USED — 按工具聚合调用次数 / 累计 token / 错误数 */}
          {toolsUsed.length > 0 && (
            <section className="rounded-lg border border-gray-100 bg-white">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                  使用工具 · {toolsUsed.length} 个
                </p>
              </div>
              <ul className="space-y-1.5 p-2">
                {toolsUsed.map(([tool, v]) => (
                  <li
                    key={tool}
                    className="space-y-1 rounded-md px-2 py-1.5 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-800">
                        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
                          {tool}
                        </span>
                        <span className="text-gray-500">调用 ×{v.calls}</span>
                      </span>
                    </div>
                    {v.samples.length > 0 && (
                      <ul className="ml-2 space-y-0.5">
                        {v.samples.map((s, i) => (
                          <li
                            key={`${tool}-${i}`}
                            className="line-clamp-1 text-[10px] text-gray-500"
                            title={s}
                          >
                            <span className="text-gray-400">›</span>{' '}
                            <span className="font-mono">
                              {s.length > 64 ? s.slice(0, 64) + '…' : s}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* SEARCH HITS — 从所有 observation 抽出的 title/url 列表 */}
          {searchHits.length > 0 && (
            <section className="rounded-lg border border-gray-100 bg-white">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                  搜索/抓取结果 · {searchHits.length} 条
                </p>
              </div>
              <ul className="max-h-[480px] space-y-1.5 overflow-y-auto p-2">
                {searchHits.slice(0, 50).map((h, i) => {
                  const safe =
                    h.url && /^https?:\/\//i.test(h.url) ? h.url : null;
                  let host = '';
                  if (safe) {
                    try {
                      host = new URL(safe).hostname.replace(/^www\./, '');
                    } catch {
                      // ignore
                    }
                  }
                  return (
                    <li
                      key={`${h.url ?? h.title}-${i}`}
                      className="rounded-md border border-sky-100 bg-sky-50/40 px-2.5 py-2"
                    >
                      {safe ? (
                        <a
                          href={safe}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 text-[12px] font-semibold leading-snug text-sky-700 hover:underline"
                          title={h.title || safe}
                        >
                          {h.title || safe}
                        </a>
                      ) : (
                        <p className="line-clamp-2 text-[12px] font-semibold text-gray-800">
                          {h.title}
                        </p>
                      )}
                      {host && (
                        <p className="font-mono mt-0.5 text-[10px] text-sky-500">
                          {host}
                        </p>
                      )}
                      {(h.snippet || h.content) && (
                        <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-gray-700">
                          {h.snippet || h.content}
                        </p>
                      )}
                    </li>
                  );
                })}
                {searchHits.length > 50 && (
                  <li className="px-2 py-1 text-center text-[10px] text-gray-400">
                    还有 {searchHits.length - 50} 条已截断
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* THOUGHTS — Agent 的全部思考 */}
          {thoughts.length > 0 && (
            <section className="rounded-lg border border-amber-100 bg-amber-50/30">
              <div className="border-b border-amber-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                  Agent 思考 · {thoughts.length} 条
                </p>
              </div>
              <ol className="space-y-1.5 p-2">
                {thoughts.map((t, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-white px-2 py-1.5 text-[11px] leading-relaxed text-gray-800 ring-1 ring-amber-100"
                  >
                    <span className="font-mono mr-1 text-[10px] text-amber-600">
                      #{i + 1}
                    </span>
                    {t.length > 500 ? t.slice(0, 500) + '…' : t}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* REFLECTIONS — Reflexion loop 的反思 */}
          {reflections.length > 0 && (
            <section className="rounded-lg border border-purple-100 bg-purple-50/30">
              <div className="border-b border-purple-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">
                  反思 · {reflections.length} 轮
                </p>
              </div>
              <ol className="space-y-1.5 p-2">
                {reflections.map((t, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-white px-2 py-1.5 text-[11px] leading-relaxed text-gray-800 ring-1 ring-purple-100"
                  >
                    <span className="font-mono mr-1 text-[10px] text-purple-600">
                      第 {i + 1} 轮
                    </span>
                    {t.length > 500 ? t.slice(0, 500) + '…' : t}
                  </li>
                ))}
              </ol>
            </section>
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
            <details className="group rounded-lg border border-gray-100 bg-gray-50/30">
              <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-100">
                原始执行轨迹 · {trace.length} 条 ▾
              </summary>
              <ul className="space-y-1.5 p-2">
                {trace.slice(-50).map((t, i) => {
                  // 把 action / observation 的 input/output 转成可读 JSON snippet
                  const inputStr = (() => {
                    if (t.input == null) return null;
                    if (typeof t.input === 'string') return t.input;
                    try {
                      return JSON.stringify(t.input, null, 2);
                    } catch {
                      return String(t.input);
                    }
                  })();
                  const outputStr = (() => {
                    if (t.output == null) return null;
                    if (typeof t.output === 'string') return t.output;
                    try {
                      return JSON.stringify(t.output, null, 2);
                    } catch {
                      return String(t.output);
                    }
                  })();
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
                          {t.text.length > 600
                            ? t.text.slice(0, 600) + '…'
                            : t.text}
                        </p>
                      ) : null}
                      {inputStr && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
                            ▸ input
                          </summary>
                          <pre className="font-mono mt-1 max-h-48 overflow-auto rounded bg-white/60 p-1.5 text-[10px] text-gray-700">
                            {inputStr.length > 4000
                              ? inputStr.slice(0, 4000) + '\n…(已截断)'
                              : inputStr}
                          </pre>
                        </details>
                      )}
                      {outputStr && !t.error && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
                            ▸ output
                          </summary>
                          <pre className="font-mono mt-1 max-h-48 overflow-auto rounded bg-white/60 p-1.5 text-[10px] text-gray-700">
                            {outputStr.length > 4000
                              ? outputStr.slice(0, 4000) + '\n…(已截断)'
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
