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
  CapabilityMeters,
  ComputeUsagePanel,
  LeaderChatModal,
  MemoryIndexPanel,
  MissionFlowView,
  MissionTodoBoard,
  ReferencesPanel,
  ReportPanel,
  TeamMissionModal,
  TeamRosterPanel,
  TodoDetailDrawer,
  VerifyConsensusPanel,
} from '@/components/agent-playground';
import {
  deriveTodoLedger,
  type MissionTodo,
} from '@/lib/agent-playground/todo-ledger';
import { ArtifactReader } from '@/components/agent-playground/artifact';
import { LeadJournalPanel } from '@/components/agent-playground/LeadJournalPanel';
import { isReportArtifact } from '@/lib/agent-playground/report-artifact.types';
import { setCitationClickCallback } from '@/components/common/citations/citationNavigation';
import { useAgentPlaygroundStream } from '@/hooks/useAgentPlaygroundStream';
import { deriveView } from '@/lib/agent-playground/derive';
import {
  cancelMission,
  getMissionDetail,
  rerunMission,
  type MissionDetail,
} from '@/services/agent-playground/api';

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

  // ★ Bug fix: mission.startedAt 在 mission:started 事件没在 replay buffer 时
  //   会是 undefined（Railway recycle 后旧 mission 的常见情况）。优先用持久化 DB
  //   里的 started_at 兜底，避免顶部状态条永远显示 "研究中 · 0s"。
  const startedAtMs =
    view.mission.startedAt ??
    (persisted?.startedAt
      ? new Date(persisted.startedAt).getTime()
      : undefined);
  const finishedAt = view.mission.completedAt ?? view.mission.failedAt ?? null;
  const wallTimeMs = startedAtMs ? (finishedAt ?? now) - startedAtMs : 0;

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

  // Cross-panel citation navigation：点报告中 [N] 角标 → 切到「参考文献」并定位
  useEffect(() => {
    setCitationClickCallback((evidenceId) => {
      setActiveTab('references');
      // 等 References tab 渲染完成（一帧）再滚动 / 高亮目标条目
      requestAnimationFrame(() => {
        const target =
          document.getElementById(`ref-${evidenceId}`) ??
          document.querySelector(`[data-cite-uuid="${evidenceId}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('ring-2', 'ring-violet-400');
          setTimeout(() => {
            target.classList.remove('ring-2', 'ring-violet-400');
          }, 2000);
        }
      });
    });
    return () => setCitationClickCallback(null);
  }, []);

  // Leader-owned dynamic task ledger（每条 todo = 一个 Leader/Reviewer/Critic 决策点）
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
  const selectedTodo: MissionTodo | undefined = useMemo(
    () => todoLedger.find((t) => t.id === selectedTaskKey),
    [todoLedger, selectedTaskKey]
  );

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
                // ★ 取消按钮可用判定：只要不是终态（completed/failed/rejected/
                //   cancelled）就视为 running。这样初次加载 persisted 还没回来 +
                //   还没收到事件时也能取消（DB 已经创建了 running 行）。
                view.mission.failedAt ||
                persisted?.status === 'failed' ||
                persisted?.status === 'rejected'
                  ? 'failed'
                  : view.mission.completedAt ||
                      persisted?.status === 'completed'
                    ? 'completed'
                    : 'running'
              }
              onCollapse={() => setLeftCollapsed(true)}
              onLeaderClick={() => setLeaderChatOpen(true)}
              onResearchTeamClick={() => setResearchTeamOpen(true)}
              onRerun={() => {
                void (async () => {
                  try {
                    const { missionId: newId } = await rerunMission(missionId);
                    router.push(`/agent-playground/team/${newId}`);
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
                router.push(`/agent-playground/team?${qs}`);
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
              <MissionTodoBoard
                todos={todoLedger}
                themeSummary={view.mission.themeSummary}
                selectedKey={selectedTaskKey}
                onSelect={(id) => setSelectedTaskKey(id)}
                missionFailed={!!view.mission.failedAt}
                missionFailedMessage={view.mission.failedMessage}
                agents={view.agents}
                dimensionPipelines={view.dimensionPipelines}
              />
            )}

            {activeTab === 'collab' && (
              <MissionFlowView view={view} events={events} />
            )}

            {activeTab === 'report' && (
              <div className="space-y-4">
                {/* ★ Phase Lead-1+: Leader-Replanner-Lite 全程产物展示 */}
                {persisted && <LeadJournalPanel mission={persisted} />}
                {/* ★ Phase P0-6: ReportArtifact v2 三视图渲染（fallback 老 ReportPanel） */}
                {(() => {
                  const reportFull = persisted?.reportFull ?? view.finalReport;
                  if (
                    reportFull &&
                    typeof reportFull === 'object' &&
                    isReportArtifact(reportFull)
                  ) {
                    // ★ Phase P1-22: 用 mission.userProfile.viewMode 作为默认视图
                    const userProfile = (
                      persisted as {
                        userProfile?: { viewMode?: string };
                      } | null
                    )?.userProfile;
                    const defaultView =
                      userProfile?.viewMode === 'chapter' ||
                      userProfile?.viewMode === 'quick'
                        ? userProfile.viewMode
                        : 'continuous';
                    const reconciliationReport = (
                      persisted as { reconciliationReport?: unknown } | null
                    )?.reconciliationReport as
                      | {
                          factTable?: unknown[];
                          conflicts?: {
                            factIds: string[];
                            resolutionType:
                              | 'kept-both'
                              | 'preferred-one'
                              | 'flagged-unresolved';
                            rationale: string;
                          }[];
                          overlaps?: {
                            dimensionPair?: [string, string];
                            similarityScore?: number;
                            overlappingClaim?: string;
                            resolutionAction?: string;
                          }[];
                          gaps?: {
                            dimensionId?: string;
                            expectedAspects?: string[];
                            severity?: 'critical' | 'minor';
                          }[];
                          reconciliationReport?: string;
                          figureCandidates?: unknown[];
                          deduplicationStats?: {
                            duplicatesRemoved?: number;
                            termVariantsUnified?: number;
                            dataInconsistenciesFlagged?: number;
                          };
                          termGlossary?: {
                            canonical: string;
                            variants: string[];
                          }[];
                        }
                      | undefined;
                    // Phase P7-5: 从 events 抽 tools_recalled
                    const toolRecallEntries = events
                      .filter(
                        (ev) => ev.type === 'agent-playground.tools:recalled'
                      )
                      .map((ev) => {
                        const p = ev.payload as {
                          agentId?: string;
                          role?: string;
                          recalledIds?: string[];
                          categories?: string[];
                          source?: string;
                          preferIds?: string[];
                        };
                        return {
                          agentId: p.agentId ?? '',
                          role: p.role ?? '',
                          recalledIds: p.recalledIds ?? [],
                          categories: p.categories ?? [],
                          source: p.source ?? 'spec',
                          preferIds: p.preferIds ?? [],
                        };
                      })
                      .slice(0, 12);
                    return (
                      <ArtifactReader
                        artifact={reportFull}
                        missionId={missionId}
                        defaultView={defaultView}
                        reconciliationReport={reconciliationReport}
                        toolRecallEntries={toolRecallEntries}
                      />
                    );
                  }
                  return (
                    <ReportPanel
                      finalReport={view.finalReport}
                      reports={view.reports}
                      finalScore={view.mission.finalScore}
                    />
                  );
                })()}
                {view.verdicts.length > 0 && (
                  <VerifyConsensusPanel verdicts={view.verdicts} />
                )}
              </div>
            )}

            {activeTab === 'references' &&
              (() => {
                const reportFull = persisted?.reportFull ?? view.finalReport;
                const richCitations =
                  reportFull &&
                  typeof reportFull === 'object' &&
                  isReportArtifact(reportFull)
                    ? reportFull.citations
                    : undefined;
                return (
                  <ReferencesPanel
                    citations={richCitations}
                    fallbackSources={allSources}
                  />
                );
              })()}

            {activeTab === 'cost' && (
              <div className="space-y-4">
                <CapabilityMeters view={view} wallTimeMs={wallTimeMs} />
                <ComputeUsagePanel
                  cost={view.cost}
                  agents={view.agents}
                  todos={todoLedger}
                  dimensionPipelines={view.dimensionPipelines}
                />
                <MemoryIndexPanel memory={view.memory} />
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
        onDimensionsAppended={() => {
          // CREATE_TODO 成功 → 刷新 mission detail 把新 dimensions 拉进来
          // （SVG / MissionTodoBoard 自动重新渲染）
          getMissionDetail(missionId)
            .then((d) => setPersisted(d))
            .catch(() => {});
        }}
      />

      {/* Research Team micro-pipeline modal — triggered by clicking Research Team group node */}
      <TeamMissionModal
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

      {/* Todo detail drawer (新版：narrativeLog 时间线 + 4 层架构面包屑 + chapter pipeline) */}
      <TodoDetailDrawer
        todo={selectedTodo}
        agents={view.agents}
        dimensionPipelines={view.dimensionPipelines}
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
