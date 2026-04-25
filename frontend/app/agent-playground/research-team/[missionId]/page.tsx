'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Activity,
  AlertTriangle,
  RefreshCw,
  FileText,
  Layers,
  Gavel,
  Coins,
  ScrollText,
  Database,
} from 'lucide-react';
import {
  AgentLiveGrid,
  CapabilityMeters,
  CostBreakdownPanel,
  DimensionsPanel,
  MemoryIndexPanel,
  PipelineTimeline,
  RawEventLog,
  ReportPanel,
  TeamRosterPanel,
  VerifyConsensusPanel,
} from '@/components/agent-playground';
import { useAgentPlaygroundStream } from '@/hooks/useAgentPlaygroundStream';
import { deriveView } from '@/lib/agent-playground/derive';
import {
  getMissionDetail,
  type MissionDetail,
} from '@/lib/api/agent-playground';

type TabKey = 'live' | 'report' | 'verify' | 'sources' | 'cost' | 'raw';

const TABS: { key: TabKey; label: string; Icon: typeof Activity }[] = [
  { key: 'live', label: 'Live Collab', Icon: Activity },
  { key: 'report', label: 'Report', Icon: FileText },
  { key: 'verify', label: 'Verify', Icon: Gavel },
  { key: 'sources', label: 'Sources', Icon: Layers },
  { key: 'cost', label: 'Cost & Memory', Icon: Coins },
  { key: 'raw', label: 'Raw Events', Icon: ScrollText },
];

function StatusPill({
  state,
}: {
  state: 'connecting' | 'live' | 'polling' | 'disconnected';
}) {
  const meta = {
    connecting: {
      label: 'Connecting',
      bg: 'bg-gray-100 text-gray-600 ring-gray-200',
      dot: 'bg-gray-400',
      pulse: true,
    },
    live: {
      label: 'Live',
      bg: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      dot: 'bg-emerald-500',
      pulse: true,
    },
    polling: {
      label: 'Polling',
      bg: 'bg-amber-50 text-amber-700 ring-amber-200',
      dot: 'bg-amber-500',
      pulse: false,
    },
    disconnected: {
      label: 'Disconnected',
      bg: 'bg-gray-100 text-gray-600 ring-gray-200',
      dot: 'bg-gray-400',
      pulse: false,
    },
  }[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${meta.bg}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${meta.pulse ? 'animate-pulse' : ''}`}
      />
      {meta.label}
    </span>
  );
}

export default function MissionDetailPage() {
  const params = useParams();
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
            persisted.status === 'failed' && persisted.completedAt
              ? new Date(persisted.completedAt).getTime()
              : undefined,
          failedMessage: persisted.errorMessage ?? undefined,
          themeSummary: persisted.themeSummary ?? undefined,
          dimensions: persisted.dimensions ?? undefined,
          finalScore: persisted.finalScore ?? undefined,
        },
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

  // Default to "report" tab if mission already has a final report; else "live"
  const [activeTab, setActiveTab] = useState<TabKey>('live');
  useEffect(() => {
    if (view.finalReport) setActiveTab('report');
  }, [view.finalReport]);

  const [teamCollapsed, setTeamCollapsed] = useState(false);

  // collect all source URLs from final report sections
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

  if (invalidId) {
    return (
      <div className="h-full overflow-auto bg-gray-50">
        <div className="mx-auto max-w-2xl px-8 py-16 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h1 className="text-2xl font-bold text-gray-900">
            Mission not found
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            The URL doesn&apos;t carry a valid mission id.
          </p>
          <Link
            href="/agent-playground/research-team"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl"
          >
            <RefreshCw className="h-4 w-4" />
            Start a new mission
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/agent-playground"
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="Back to mission list"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-gray-900">
                {view.mission.topic ?? 'Research Mission'}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                {view.mission.depth && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                    {view.mission.depth}
                  </span>
                )}
                {view.mission.language && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                    {view.mission.language}
                  </span>
                )}
                <span className="font-mono text-[10px] text-gray-400">
                  {missionId}
                </span>
              </div>
            </div>
          </div>
        </div>
        <StatusPill state={connState} />
      </header>

      {/* Main split layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left team roster */}
        <TeamRosterPanel
          agents={view.agents}
          stages={view.stages}
          collapsed={teamCollapsed}
          onToggleCollapse={() => setTeamCollapsed((c) => !c)}
        />

        {/* Right content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Pipeline + meters strip */}
          <div className="space-y-3 border-b border-gray-200 bg-white px-6 py-4">
            {error && connState !== 'live' && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  Live stream unavailable · falling back to polling /replay
                  every 4s
                </p>
              </div>
            )}
            {view.mission.failedMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  <span className="font-medium">Mission failed:</span>{' '}
                  {view.mission.failedMessage}
                </p>
              </div>
            )}
            <CapabilityMeters view={view} wallTimeMs={wallTimeMs} />
            <PipelineTimeline stages={view.stages} />
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 bg-white px-6">
            <div className="flex gap-1">
              {TABS.map((tab) => {
                const Icon = tab.Icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'border-violet-500 text-violet-700'
                        : 'border-transparent text-gray-500 hover:border-gray-200 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-auto bg-gray-50 px-6 py-5">
            {activeTab === 'live' && (
              <div className="space-y-4">
                <DimensionsPanel mission={view.mission} />
                <AgentLiveGrid agents={view.agents} />
              </div>
            )}

            {activeTab === 'report' && (
              <ReportPanel
                finalReport={view.finalReport}
                reports={view.reports}
                finalScore={view.mission.finalScore}
              />
            )}

            {activeTab === 'verify' && (
              <VerifyConsensusPanel verdicts={view.verdicts} />
            )}

            {activeTab === 'sources' && (
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-violet-500" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    All sources cited in report
                  </h3>
                  <span className="ml-auto text-xs text-gray-500">
                    {allSources.length} unique URLs
                  </span>
                </div>
                {allSources.length === 0 ? (
                  <p className="rounded-lg bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
                    Sources will appear once Researchers / Writer cite them.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {allSources.map((u, i) => {
                      const safe = /^https?:\/\//i.test(u) ? u : null;
                      return (
                        <li
                          key={`${u}-${i}`}
                          className="rounded-lg border border-gray-100 px-3 py-2 hover:border-violet-200 hover:bg-violet-50/30"
                        >
                          {safe ? (
                            <a
                              href={safe}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block break-words text-xs text-violet-700 underline-offset-2 hover:underline"
                            >
                              {safe}
                            </a>
                          ) : (
                            <span
                              className="block break-words text-xs text-gray-400"
                              title="non-http(s) source filtered"
                            >
                              {u}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {activeTab === 'cost' && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <CostBreakdownPanel cost={view.cost} />
                <MemoryIndexPanel memory={view.memory} />
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
                  <div className="mb-3 flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold text-gray-900">
                      Trajectory & memory index
                    </h3>
                  </div>
                  <p className="text-xs text-gray-600">
                    The mission&apos;s trajectory (Writer&apos;s envelope +
                    events) is auto-vectorized into the user&apos;s memory
                    namespace on completion. Future similar missions can
                    semantically retrieve these chunks.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'raw' && <RawEventLog events={events} />}
          </div>
        </div>
      </div>
    </div>
  );
}
