'use client';

/**
 * Mission Detail Page — 完全照搬 Topic Insights TopicResearchLayout 视觉结构
 *
 * Header: ← back · 🎯 gradient icon · title + meta · status pill + actions
 * Main: 360px collapsible left team + flex-1 right tabbed content
 * Tabs: Live Collab / Report / Verify / Sources / Cost & Memory / Raw Events
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  X as XIcon,
} from 'lucide-react';
import {
  CapabilityMeters,
  ComputeUsagePanel,
  LeaderChatModal,
  MemoryIndexPanel,
  MissionFlowView,
  MissionTodoBoard,
  ReferencesPanel,
  TeamMissionModal,
  TeamRosterPanel,
  TodoDetailDrawer,
  VerifyConsensusPanel,
} from '@/components/agent-playground';
import {
  deriveTodoLedger,
  type MissionTodo,
} from '@/lib/agent-playground/todo-ledger';
import { cn } from '@/lib/utils/common';
import { KnowledgeBaseSelector } from '@/components/common/selectors';
import { ArtifactReader } from '@/components/agent-playground/artifact';
import { LeadJournalPanel } from '@/components/agent-playground/LeadJournalPanel';
import { QualityGapBanner } from '@/components/agent-playground/overhaul/QualityGapBanner';
import { isReportArtifact } from '@/lib/agent-playground/report-artifact.types';
import { ensureRenderableArtifact } from '@/lib/agent-playground/synthesize-artifact';
import { setCitationClickCallback } from '@/components/common/citations/citationNavigation';
import { useAgentPlaygroundStream } from '@/hooks/useAgentPlaygroundStream';
import { deriveView } from '@/lib/agent-playground/derive';
import {
  cancelMission,
  getMissionDetail,
  getReportVersion,
  listReportVersions,
  rerunMission,
  type MissionDetail,
  type ReportVersionListItem,
} from '@/services/agent-playground/api';
import type { ReportVersionMeta } from '@/components/agent-playground/artifact/ArtifactReader';

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
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    // ★ 2026-05-01: starting 占位（DB 行还没落地）时持续轮询直到拿到真 row。
    //   之前只 mount fetch 一次 → topic="" + status="starting" 永远卡住，
    //   header 显示"研究 Mission"兜底文案，stage 占位 todo 因 mission:started
    //   事件还没到也不显示。
    const fetchAndMaybePoll = () => {
      getMissionDetail(missionId)
        .then((d) => {
          if (cancelled) return;
          setPersisted(d);
          const m = d as unknown as { status?: string; topic?: string };
          if (m?.status === 'starting' || !m?.topic) {
            pollTimer = setTimeout(fetchAndMaybePoll, 1500);
          }
        })
        .catch(() => {
          if (cancelled) return;
          // 错误也轮询（mission ID 在 in-memory ownership 但 DB 还没建）
          pollTimer = setTimeout(fetchAndMaybePoll, 2000);
        });
    };
    fetchAndMaybePoll();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [missionId, invalidId]);

  // ★ 2026-04-30: mission:completed / mission:failed / mission:cancelled 事件触发 re-fetch
  //   彻底解决"persisted 只 mount fetch 一次永不更新"导致 reportFull = null 走 fallback 的 bug。
  //   S11 mission-persist 写库成功后才 emit mission:completed（修复了 S8 提前 emit），
  //   此时 reportFull 已落库，re-fetch 拿到 v2 ReportArtifact → ArtifactReader 路径生效。
  const lastTerminalRef = useRef<string | null>(null);
  useEffect(() => {
    if (invalidId) return;
    const terminal = events.find((ev) =>
      [
        'agent-playground.mission:completed',
        'agent-playground.mission:failed',
        'agent-playground.mission:cancelled',
        // ★ 2026-04-30 (B 路线): 局部重跑完成也要 re-fetch persisted —— stage 产物已 patch
        'agent-playground.mission:rerun-completed',
        // ★ 2026-05-06 #83: mission:postlude:completed 表示 S12 自我进化 fire-and-forget
        //   也跑完，此时 mission row tokens_used / cost_usd / report_full 已最终落库，
        //   再 re-fetch 一次确保前端拿到最终数字（不只是 S11 完成时刻的快照）。
        'agent-playground.mission:postlude:completed',
      ].includes(ev.type)
    );
    if (!terminal) return;
    const sig = `${terminal.type}:${terminal.timestamp ?? ''}`;
    if (lastTerminalRef.current === sig) return;
    lastTerminalRef.current = sig;
    let cancelled = false;
    // ★ 2026-05-06 #83: 延迟 800 → 立即 + 800 + 2500 三连拉，让用户切到"输出报告"
    //   tab 不需要等 800ms 才看到内容；如果第一次拉时 reportFull 还没写完（race），
    //   后续两次兜底。
    const fetchAndSet = () => {
      if (cancelled) return;
      getMissionDetail(missionId)
        .then((d) => {
          if (!cancelled) setPersisted(d);
        })
        .catch(() => {});
    };
    fetchAndSet();
    const t1 = setTimeout(fetchAndSet, 800);
    const t2 = setTimeout(fetchAndSet, 2500);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [events, missionId, invalidId]);

  const view = useMemo(() => {
    const liveView = deriveView(events);
    if (events.length === 0 && persisted) {
      // Synthesize stages and agents skeleton from persisted snapshot so the
      // detail page is informative even after Railway recycles the in-memory
      // event buffer (replay only returns events still in buffer).
      // quality-failed (Leader 拒签) 视为 completed 的一种 — 报告仍可阅读，
      // 用 finalScore < 60 区分；rejected 视为 failed。
      const isCompleted =
        persisted.status === 'completed' ||
        persisted.status === 'quality-failed';
      const isFailed =
        persisted.status === 'failed' || persisted.status === 'rejected';
      const isCancelled = persisted.status === 'cancelled';
      const dims = (persisted.dimensions ?? []) as {
        id?: string;
        name: string;
        rationale?: string;
      }[];

      const isTerminal = isCompleted || isFailed || isCancelled;
      const terminalStageStatus: 'done' | 'failed' | 'pending' = isCompleted
        ? 'done'
        : isFailed || isCancelled
          ? 'failed'
          : 'pending';
      const stages: typeof liveView.stages = [
        { id: 'leader', status: isTerminal ? 'done' : 'pending' },
        { id: 'researchers', status: terminalStageStatus },
        { id: 'analyst', status: terminalStageStatus },
        { id: 'writer', status: terminalStageStatus },
        { id: 'reviewer', status: terminalStageStatus },
      ];

      const synthAgents: typeof liveView.agents = [];
      if (isTerminal) {
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

      const terminalTs = persisted.completedAt
        ? new Date(persisted.completedAt).getTime()
        : undefined;
      return {
        ...liveView,
        mission: {
          ...liveView.mission,
          topic: persisted.topic,
          depth: persisted.depth,
          language: persisted.language,
          startedAt: new Date(persisted.startedAt).getTime(),
          completedAt: isCompleted ? terminalTs : undefined,
          failedAt: isFailed ? terminalTs : undefined,
          cancelledAt: isCancelled ? terminalTs : undefined,
          failedMessage:
            persisted.errorMessage ?? (isCancelled ? '用户取消' : undefined),
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
    // ★ 兜底：即使有 live events，也用持久化 status 覆盖终态（用户取消后仍能识别）
    if (persisted) {
      const mergedView =
        (persisted.tokensUsed ?? 0) > liveView.cost.tokensUsed ||
        (persisted.costUsd ?? 0) > liveView.cost.costUsd
          ? {
              ...liveView,
              cost: {
                tokensUsed: Math.max(
                  liveView.cost.tokensUsed,
                  persisted.tokensUsed ?? 0
                ),
                costUsd: Math.max(
                  liveView.cost.costUsd,
                  persisted.costUsd ?? 0
                ),
                byStage: liveView.cost.byStage,
              },
            }
          : liveView;
      const terminalTs = persisted.completedAt
        ? new Date(persisted.completedAt).getTime()
        : Date.now();
      if (persisted.status === 'cancelled' && !liveView.mission.cancelledAt) {
        return {
          ...mergedView,
          mission: {
            ...mergedView.mission,
            cancelledAt: terminalTs,
            failedMessage: mergedView.mission.failedMessage ?? 'User cancelled',
          },
        };
      }
      if (
        (persisted.status === 'failed' || persisted.status === 'rejected') &&
        !liveView.mission.failedAt
      ) {
        return {
          ...mergedView,
          mission: {
            ...mergedView.mission,
            failedAt: terminalTs,
            failedMessage:
              mergedView.mission.failedMessage ??
              persisted.errorMessage ??
              undefined,
          },
        };
      }
      if (
        (persisted.status === 'completed' ||
          persisted.status === 'quality-failed') &&
        !liveView.mission.completedAt
      ) {
        return {
          ...mergedView,
          mission: {
            ...mergedView.mission,
            completedAt: terminalTs,
            finalScore:
              mergedView.mission.finalScore ??
              persisted.finalScore ??
              undefined,
            // quality-failed ?? leader ???? surfaces ? UI banner
            failedMessage:
              persisted.status === 'quality-failed'
                ? (mergedView.mission.failedMessage ??
                  persisted.errorMessage ??
                  'Quality threshold not met, but the report is still readable')
                : mergedView.mission.failedMessage,
          },
        };
      }
      return mergedView;
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
  const finishedAt =
    view.mission.completedAt ??
    view.mission.failedAt ??
    view.mission.cancelledAt ??
    null;
  const wallTimeMs = startedAtMs ? (finishedAt ?? now) - startedAtMs : 0;

  // 默认进入卡片始终落到任务列表（不自动跳转 report）
  const [activeTab, setActiveTab] = useState<TabKey>('tasks');

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [leaderChatOpen, setLeaderChatOpen] = useState(false);
  const [researchTeamOpen, setResearchTeamOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  // ★ P1-UI-DISMISS-BANNER (2026-04-30): mission failed banner 支持手动关闭，
  //   按 missionId 分桶，避免不同 mission 共用同一个状态。
  const [dismissedFailedBanner, setDismissedFailedBanner] = useState<
    Record<string, boolean>
  >({});

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

  // ★ 2026-05-06: 报告版本化 —— 拉版本列表（mission 终态后才拉），切换时拉指定版本 reportFull
  const [reportVersions, setReportVersions] = useState<
    ReportVersionListItem[] | null
  >(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [versionOverride, setVersionOverride] = useState<unknown | null>(null);
  const [versionSwitching, setVersionSwitching] = useState(false);

  useEffect(() => {
    if (invalidId) return;
    if (!persisted) return;
    const isTerminal =
      persisted.status === 'completed' ||
      persisted.status === 'quality-failed' ||
      persisted.status === 'failed' ||
      persisted.status === 'rejected' ||
      persisted.status === 'cancelled';
    if (!isTerminal) return;
    let cancelled = false;
    listReportVersions(missionId)
      .then((items) => {
        if (cancelled) return;
        setReportVersions(items);
        // 默认选最高版本（list 已 DESC 排序）
        const head = items[0]?.version;
        if (head != null) {
          setSelectedVersion((prev) => prev ?? head);
        }
      })
      .catch(() => {
        if (!cancelled) setReportVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [missionId, invalidId, persisted]);

  const handleSelectVersion = useCallback(
    async (version: number) => {
      if (version === selectedVersion) return;
      setVersionSwitching(true);
      try {
        const detail = await getReportVersion(missionId, version);
        setVersionOverride(detail.reportFull);
        setSelectedVersion(version);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('load report version failed', e);
      } finally {
        setVersionSwitching(false);
      }
    },
    [missionId, selectedVersion]
  );

  const reportVersionMeta: ReportVersionMeta[] | undefined = useMemo(() => {
    if (!reportVersions || reportVersions.length === 0) return undefined;
    return reportVersions.map((r) => ({
      version: r.version,
      versionLabel: r.versionLabel,
      triggerType: r.triggerType,
      generatedAt: r.generatedAt,
      finalScore: r.finalScore,
      leaderSigned: r.leaderSigned,
    }));
  }, [reportVersions]);

  // ★ 2026-04-30 (#50 修复图片一闪一闪): setNow 每 500ms 触发 page re-render，
  //   之前报告 tab IIFE 里 ensureRenderableArtifact / toolRecallEntries 每次都新建
  //   引用 → ArtifactReader → ContinuousReader → ArtifactMarkdown 整树重渲 →
  //   react-markdown 重新解析 → <img> 重新挂载导致闪烁。
  //   把这些计算挪到 useMemo，依赖具体内容字段（不包括 now / wallTimeMs），
  //   即使 setNow tick 也不会重算 artifact，markdown DOM 稳定不抖。
  // versionOverride 优先于 persisted.reportFull（用户切了历史版本）
  const reportFullRef =
    versionOverride ?? persisted?.reportFull ?? view.finalReport;
  const reportArtifact = useMemo(() => {
    const isV2 =
      reportFullRef &&
      typeof reportFullRef === 'object' &&
      isReportArtifact(reportFullRef);
    if (isV2) return reportFullRef;
    const emptyMessage = view.mission.failedAt
      ? `Mission 失败：${view.mission.failedMessage ?? '未知错误'}\n\n（请重新启动一个新 mission）`
      : view.mission.cancelledAt
        ? '已被用户取消\n\n（数据未持久化）'
        : view.mission.completedAt
          ? '报告生成中…\n\n（可能 S11 持久化未完成，稍后刷新页面）'
          : '报告生成中…\n\n（mission 仍在跑 S1-S10，写作完成后会显示草稿；mission 完成后会显示完整三视图）';
    const fallbackTitle = view.mission.topic ?? '研究报告';
    return ensureRenderableArtifact(reportFullRef, fallbackTitle, emptyMessage);
  }, [
    reportFullRef,
    view.mission.failedAt,
    view.mission.cancelledAt,
    view.mission.completedAt,
    view.mission.failedMessage,
    view.mission.topic,
  ]);

  const reportDefaultView = useMemo(() => {
    const userProfile = (
      persisted as { userProfile?: { viewMode?: string } } | null
    )?.userProfile;
    return userProfile?.viewMode === 'chapter' ||
      userProfile?.viewMode === 'quick'
      ? userProfile.viewMode
      : ('continuous' as const);
  }, [persisted]);

  const reportReconciliationReport = useMemo(
    () =>
      (persisted as { reconciliationReport?: unknown } | null)
        ?.reconciliationReport,
    [persisted]
  );

  const reportToolRecallEntries = useMemo(() => {
    return events
      .filter((ev) => ev.type === 'agent-playground.tools:recalled')
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
  }, [events]);

  const isRunning =
    !view.mission.completedAt &&
    !view.mission.failedAt &&
    !view.mission.cancelledAt;

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
            <div className="min-w-0 flex-1">
              <h1
                className="truncate text-lg font-bold text-gray-900"
                title={view.mission.topic ?? '研究中…'}
              >
                {/* 兜底：把任意换行 / [Re-run focus] hint 块剥到首行，防 topic 撑爆 header 挤设置按钮 */}
                {(() => {
                  const raw = view.mission.topic ?? '';
                  const cleaned = raw.split(/\n|\[Re-run focus\]/i)[0].trim();
                  // 启动早期 starting 占位无 topic → 显示"研究中…"提示等待
                  if (!cleaned) {
                    const status = (view.mission as { status?: string }).status;
                    return status === 'starting' ? '研究中…' : '未命名研究';
                  }
                  return cleaned;
                })()}
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
          ) : view.mission.cancelledAt ? (
            <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-gray-500" />
              <span className="text-sm font-medium text-gray-700">已取消</span>
            </div>
          ) : view.mission.failedAt ? (
            <div className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-sm font-medium text-red-700">已失败</span>
            </div>
          ) : view.mission.completedAt &&
            persisted?.status === 'quality-failed' ? (
            <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span
                className="text-sm font-medium text-amber-700"
                title="Leader 拒签，但报告仍可阅读"
              >
                质量未达标
              </span>
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

      {/* PR-8 v1.6 D4: 硬合约 qualityGap banner（mission completed 但 contract 不达预期时显示） */}
      {persisted &&
        persisted.status === 'completed' &&
        Array.isArray(persisted.qualityGaps) &&
        persisted.qualityGaps.length > 0 && (
          <div className="border-b border-gray-200 bg-white px-4 py-3">
            <QualityGapBanner
              gaps={persisted.qualityGaps}
              missionId={missionId}
              onAccept={() => {
                /* 用户接受现状，未来可支持 dismissed 持久化；当前重新进入页面会再显示 */
              }}
            />
          </div>
        )}

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
                //   cancelled/quality-failed）就视为 running。这样初次加载 persisted
                //   还没回来 + 还没收到事件时也能取消（DB 已经创建了 running 行）。
                view.mission.cancelledAt || persisted?.status === 'cancelled'
                  ? 'cancelled'
                  : view.mission.failedAt ||
                      persisted?.status === 'failed' ||
                      persisted?.status === 'rejected'
                    ? 'failed'
                    : view.mission.completedAt ||
                        persisted?.status === 'completed' ||
                        persisted?.status === 'quality-failed'
                      ? 'completed'
                      : 'running'
              }
              onCollapse={() => setLeftCollapsed(true)}
              onLeaderClick={() => setLeaderChatOpen(true)}
              onResearchTeamClick={() => setResearchTeamOpen(true)}
              onRerun={() => {
                // "开始"按钮 = fresh：清 checkpoint，全新从头跑
                void (async () => {
                  try {
                    const { missionId: newId } = await rerunMission(
                      missionId,
                      'fresh'
                    );
                    router.push(`/agent-playground/team/${newId}`);
                  } catch (e) {
                    window.alert(
                      `启动失败：${e instanceof Error ? e.message : String(e)}`
                    );
                  }
                })();
              }}
              onUpdate={() => {
                // "更新"按钮 = incremental：clone checkpoint，跳过已完成 stage
                // 对齐 Topic Insight handleContinueResearch
                //   ('incremental' 模式：保留已完成任务，只跑未完成的维度)
                // 复用原 mission 全部 input 字段（不只 topic/depth/language 3 个）
                void (async () => {
                  try {
                    const { missionId: newId } = await rerunMission(
                      missionId,
                      'incremental'
                    );
                    router.push(`/agent-playground/team/${newId}`);
                  } catch (e) {
                    window.alert(
                      `更新失败：${e instanceof Error ? e.message : String(e)}`
                    );
                  }
                })();
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
          {(() => {
            const showWsError = !!(error && connState !== 'live');
            const failedDismissed = !!dismissedFailedBanner[missionId];
            const showFailedBanner =
              !!view.mission.failedMessage && !failedDismissed;
            if (!showWsError && !showFailedBanner) return null;
            return (
              <div className="space-y-2 border-b border-gray-200 bg-white px-4 py-2">
                {showWsError && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>WebSocket 不可用 · 已退化为 4s 轮询 /replay</p>
                  </div>
                )}
                {showFailedBanner &&
                  (persisted?.status === 'quality-failed' ? (
                    <div className="relative flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 pr-8 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          Leader 拒签 · 质量未达标但报告可阅读
                        </p>
                        <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed text-amber-900/90">
                          {view.mission.failedMessage}
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('report')}
                          className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-300 hover:bg-amber-200"
                        >
                          查看输出报告 →
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label="关闭"
                        onClick={() =>
                          setDismissedFailedBanner((prev) => ({
                            ...prev,
                            [missionId]: true,
                          }))
                        }
                        className="absolute right-1.5 top-1.5 rounded p-0.5 text-amber-700 hover:bg-amber-100"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 pr-8 text-xs text-red-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">Mission 失败</p>
                        <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed text-red-900/90">
                          {view.mission.failedMessage}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="关闭"
                        onClick={() =>
                          setDismissedFailedBanner((prev) => ({
                            ...prev,
                            [missionId]: true,
                          }))
                        }
                        className="absolute right-1.5 top-1.5 rounded p-0.5 text-red-700 hover:bg-red-100"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            );
          })()}

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
                missionCancelled={!!view.mission.cancelledAt}
                agents={view.agents}
                dimensionPipelines={view.dimensionPipelines}
                missionId={missionId}
                missionTerminal={!isRunning}
              />
            )}

            {activeTab === 'collab' && (
              <MissionFlowView view={view} events={events} />
            )}

            {activeTab === 'report' && (
              <div className="space-y-4">
                {/* ★ 2026-04-30 (#51 报告极简化)：
                    主区只渲染纯报告（ArtifactReader 含视图切换 + 修订 banner + 正文）
                    LeadJournalPanel / VerifyConsensusPanel / 质量分数 / 元信息 /
                    事实表 / 对账 / 工具召回 全部移到 ArtifactReader 内部右侧 slide-over，
                    点击"报告分析"按钮打开。 */}
                <ArtifactReader
                  artifact={reportArtifact}
                  missionId={missionId}
                  defaultView={reportDefaultView}
                  reconciliationReport={
                    reportReconciliationReport as Parameters<
                      typeof ArtifactReader
                    >[0]['reconciliationReport']
                  }
                  toolRecallEntries={reportToolRecallEntries}
                  dimensionPipelines={view.dimensionPipelines}
                  reportVersions={reportVersionMeta}
                  currentVersion={selectedVersion ?? undefined}
                  onSelectVersion={(v) => void handleSelectVersion(v)}
                  versionSwitching={versionSwitching}
                />
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
        allTodos={todoLedger}
        onClose={() => setSelectedTaskKey(null)}
        missionId={missionId}
        missionTerminal={!isRunning}
      />

      {/* Settings modal */}
      <MissionSettingsModal
        mission={view.mission}
        wallTimeMs={wallTimeMs}
        cost={view.cost}
        userProfile={
          (persisted as { userProfile?: Record<string, unknown> } | null)
            ?.userProfile ?? null
        }
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
  userProfile,
  open,
  onClose,
}: {
  mission: ReturnType<typeof deriveView>['mission'];
  wallTimeMs: number;
  cost: ReturnType<typeof deriveView>['cost'];
  userProfile: Record<string, unknown> | null;
  open: boolean;
  onClose: () => void;
}) {
  // ★ 2026-04-30 (#52): 可编辑表单 —— 改完点"另存为新 mission"用新配置创建新 mission，
  //   原 mission 保留作对比。topic / language / depth / lengthProfile / styleProfile /
  //   audienceProfile / withFigures / auditLayers / concurrency / knowledgeBaseIds 全可改。
  type Depth = 'quick' | 'standard' | 'deep';
  type Lang = 'zh-CN' | 'en-US';
  type LP = 'brief' | 'standard' | 'deep' | 'extended' | 'epic' | 'mega';
  type SP = 'academic' | 'executive' | 'journalistic' | 'technical';
  type AP = 'executive' | 'domain-expert' | 'general-public';
  type AL = 'minimal' | 'default' | 'thorough' | 'thorough+';

  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [depth, setDepth] = useState<Depth>('deep');
  const [language, setLanguage] = useState<Lang>('zh-CN');
  const [lengthProfile, setLengthProfile] = useState<LP>('standard');
  const [styleProfile, setStyleProfile] = useState<SP>('executive');
  const [audienceProfile, setAudienceProfile] = useState<AP>('domain-expert');
  const [auditLayers, setAuditLayers] = useState<AL>('default');
  const [withFigures, setWithFigures] = useState(true);
  const [concurrency, setConcurrency] = useState(3);
  const [knowledgeBaseIds, setKnowledgeBaseIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 打开时初始化表单值（来自 mission + userProfile 快照）
  useEffect(() => {
    if (!open) return;
    setTopic(mission.topic ?? '');
    setDepth((mission.depth as Depth) ?? 'deep');
    setLanguage((mission.language as Lang) ?? 'zh-CN');
    setLengthProfile((userProfile?.lengthProfile as LP) ?? 'standard');
    setStyleProfile((userProfile?.styleProfile as SP) ?? 'executive');
    setAudienceProfile((userProfile?.audienceProfile as AP) ?? 'domain-expert');
    setAuditLayers((userProfile?.auditLayers as AL) ?? 'default');
    setWithFigures((userProfile?.withFigures as boolean) ?? true);
    setConcurrency((userProfile?.concurrency as number) ?? 3);
    const kbIds = userProfile?.knowledgeBaseIds as string[] | undefined;
    setKnowledgeBaseIds(Array.isArray(kbIds) ? kbIds : []);
    setSaveError(null);
  }, [open, mission.topic, mission.depth, mission.language, userProfile]);

  if (!open) return null;

  const handleSaveAsNew = async () => {
    if (!topic.trim()) {
      setSaveError('主题不能为空');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const { runTeam } = await import('@/services/agent-playground/api');
      // ★ P0-K (2026-05-06): maxCredits + budgetMultiplierOverride 必填，从原 mission
      //   userProfile 读取（rerun 沿用原配置；用户可在专门 UI 改）
      const inheritedMax = (userProfile as { maxCredits?: number })?.maxCredits;
      const inheritedMul = (
        userProfile as { budgetMultiplierOverride?: number }
      )?.budgetMultiplierOverride;
      const { missionId: newId } = await runTeam({
        topic: topic.trim(),
        depth,
        language,
        lengthProfile,
        styleProfile,
        audienceProfile,
        auditLayers,
        withFigures,
        concurrency,
        maxCredits: inheritedMax ?? 1000,
        budgetMultiplierOverride: inheritedMul ?? 1.0,
        knowledgeBaseIds:
          knowledgeBaseIds.length > 0 ? knowledgeBaseIds : undefined,
      });
      router.push(`/agent-playground/team/${newId}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        style={{ maxHeight: '90vh' }}
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

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
          {/* 当前 mission 运行信息（只读） */}
          <div className="grid grid-cols-2 gap-3">
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

          {/* 可编辑表单 */}
          <FormField label="主题（必填）">
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 focus:border-blue-400 focus:outline-none"
              placeholder="例：系统洞察一下 Anthropic Managed Agent"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="语言">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Lang)}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px]"
              >
                <option value="zh-CN">中文</option>
                <option value="en-US">English</option>
              </select>
            </FormField>
            <FormField label="深度">
              <select
                value={depth}
                onChange={(e) => setDepth(e.target.value as Depth)}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px]"
              >
                <option value="quick">quick · 快速</option>
                <option value="standard">standard · 标准</option>
                <option value="deep">deep · 深度</option>
              </select>
            </FormField>
            <FormField label="长度档位">
              <select
                value={lengthProfile}
                onChange={(e) => setLengthProfile(e.target.value as LP)}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px]"
              >
                <option value="brief">brief · 3K</option>
                <option value="standard">standard · 8K</option>
                <option value="deep">deep · 15K</option>
                <option value="extended">extended · 25K</option>
                <option value="epic">epic · 80K</option>
                <option value="mega">mega · 200K</option>
              </select>
            </FormField>
            <FormField label="文风">
              <select
                value={styleProfile}
                onChange={(e) => setStyleProfile(e.target.value as SP)}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px]"
              >
                <option value="executive">executive · 管理</option>
                <option value="academic">academic · 学术</option>
                <option value="journalistic">journalistic · 新闻</option>
                <option value="technical">technical · 技术</option>
              </select>
            </FormField>
            <FormField label="受众">
              <select
                value={audienceProfile}
                onChange={(e) => setAudienceProfile(e.target.value as AP)}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px]"
              >
                <option value="executive">executive · 高管</option>
                <option value="domain-expert">domain-expert · 专家</option>
                <option value="general-public">general-public · 大众</option>
              </select>
            </FormField>
            <FormField label="审核层">
              <select
                value={auditLayers}
                onChange={(e) => setAuditLayers(e.target.value as AL)}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px]"
              >
                <option value="minimal">minimal · 最小</option>
                <option value="default">default · 默认</option>
                <option value="thorough">thorough · 深审</option>
                <option value="thorough+">thorough+ · 全审</option>
              </select>
            </FormField>
            <FormField label="并行数">
              <input
                type="number"
                min={1}
                max={6}
                value={concurrency}
                onChange={(e) =>
                  setConcurrency(Math.max(1, Math.min(6, +e.target.value)))
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px]"
              />
            </FormField>
            <FormField label="图文并茂">
              <label className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={withFigures}
                  onChange={(e) => setWithFigures(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span>启用</span>
              </label>
            </FormField>
          </div>

          <FormField label="知识库（最多 10 个，留空 = 纯 web-search）">
            <KnowledgeBaseSelector
              selectedIds={knowledgeBaseIds}
              onSelectionChange={setKnowledgeBaseIds}
              maxSelections={10}
            />
          </FormField>

          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-900">
            <p className="font-semibold">
              说明：「另存为新 mission」会用以上配置创建新 mission，原 mission
              保留作对比。
            </p>
            <p className="mt-0.5">
              （当前 mission 已经在跑或已完成，参数无法在原 mission 上
              mutate；这是有意设计，便于复盘和 A/B 对比）
            </p>
          </div>

          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700">
              {saveError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAsNew()}
            disabled={saving || !topic.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', saving && 'animate-spin')}
            />
            {saving ? '创建中…' : '另存为新 mission'}
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

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}

// Compact inline meters in the tab bar (cost / score / wall / words)
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

  // ★ 实时字数累加（每个 dim pipeline 的章节 wordCount 之和）
  const totalWords = useMemo(() => {
    let sum = 0;
    for (const dim of view.dimensionPipelines.values()) {
      for (const ch of dim.chapters) {
        if (ch.wordCount) sum += ch.wordCount;
      }
    }
    return sum;
  }, [view.dimensionPipelines]);
  const fmtWords = (n: number) =>
    n < 1000 ? `${n} 字` : `${(n / 1000).toFixed(1)}k 字`;

  return (
    <div className="hidden items-center gap-4 whitespace-nowrap text-xs text-gray-500 lg:flex">
      <span className="flex items-center gap-1">
        <Coins className="h-3.5 w-3.5 text-amber-500" />
        {fmtTokens(view.cost.tokensUsed)} tk
      </span>
      {totalWords > 0 && (
        <span className="flex items-center gap-1" title="累计已写章节字数">
          <FileText className="h-3.5 w-3.5 text-emerald-500" />
          {fmtWords(totalWords)}
        </span>
      )}
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
