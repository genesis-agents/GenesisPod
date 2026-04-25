'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  AgentLiveGrid,
  CapabilityMeters,
  CostBreakdownPanel,
  DimensionsPanel,
  MemoryIndexPanel,
  PipelineTimeline,
  RawEventLog,
  ReportPanel,
  VerifyConsensusPanel,
} from '@/components/agent-playground';
import { useAgentPlaygroundStream } from '@/hooks/useAgentPlaygroundStream';
import { deriveView } from '@/lib/agent-playground/derive';

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
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${meta.bg}`}
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

  // Live wall time clock
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const view = useMemo(() => deriveView(events), [events]);
  const finishedAt = view.mission.completedAt ?? view.mission.failedAt ?? null;
  const wallTimeMs = view.mission.startedAt
    ? (finishedAt ?? now) - view.mission.startedAt
    : 0;

  if (invalidId) {
    return (
      <div className="h-full overflow-auto bg-gray-50">
        <div className="mx-auto max-w-2xl px-8 py-16 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h1 className="text-2xl font-bold text-gray-900">
            Mission not found
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            The URL doesn&apos;t carry a valid mission id. This usually means
            the API call to start the mission failed.
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
    <div className="h-full overflow-auto bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/70 backdrop-blur-md">
        <div className="px-8 py-5">
          <Link
            href="/agent-playground/research-team"
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-violet-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            New mission
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-gray-900">
                  {view.mission.topic ?? 'Research Mission'}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
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
            <StatusPill state={connState} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-5 px-8 py-6">
        {error && connState !== 'live' && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Live stream unavailable</p>
              <p className="text-xs text-amber-700">
                Falling back to polling /replay every 4s · {error}
              </p>
            </div>
          </div>
        )}

        {view.mission.rejectedReason && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">
              Mission rejected · {view.mission.rejectedReason}
            </p>
            {view.mission.rejectedMessage && (
              <p className="mt-1 text-xs">{view.mission.rejectedMessage}</p>
            )}
          </div>
        )}

        {view.mission.failedMessage && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Mission failed</p>
              <p className="mt-1 break-words text-xs">
                {view.mission.failedMessage}
              </p>
            </div>
          </div>
        )}

        {/* Capability meters */}
        <CapabilityMeters view={view} wallTimeMs={wallTimeMs} />

        {/* Pipeline */}
        <PipelineTimeline stages={view.stages} />

        {/* Two-column main */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <AgentLiveGrid agents={view.agents} />
          </div>
          <div className="space-y-5">
            <DimensionsPanel mission={view.mission} />
            <VerifyConsensusPanel verdicts={view.verdicts} />
            <CostBreakdownPanel cost={view.cost} />
            <MemoryIndexPanel memory={view.memory} />
          </div>
        </div>

        {/* Final report */}
        <ReportPanel
          finalReport={view.finalReport}
          reports={view.reports}
          finalScore={view.mission.finalScore}
        />

        {/* Raw event log */}
        <RawEventLog events={events} />
      </div>
    </div>
  );
}
