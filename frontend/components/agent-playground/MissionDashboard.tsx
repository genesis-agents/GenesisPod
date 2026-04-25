'use client';

import { useMemo } from 'react';
import {
  CheckCircle2,
  Loader2,
  XCircle,
  Brain,
  Search,
  GitBranch,
  PenLine,
  Gavel,
  Clock,
} from 'lucide-react';
import type { PlaygroundEvent } from '@/hooks/useAgentPlaygroundStream';

const STAGES = [
  { id: 'leader', label: 'Leader', Icon: Brain },
  { id: 'researchers', label: 'Researchers', Icon: Search },
  { id: 'analyst', label: 'Analyst', Icon: GitBranch },
  { id: 'writer', label: 'Writer', Icon: PenLine },
  { id: 'reviewer', label: 'Reviewer', Icon: Gavel },
] as const;

type StageStatus = 'pending' | 'running' | 'done' | 'failed';

interface StageState {
  status: StageStatus;
  detail?: string;
  startedAt?: number;
  endedAt?: number;
}

function deriveStages(events: PlaygroundEvent[]): Record<string, StageState> {
  const init: Record<string, StageState> = Object.fromEntries(
    STAGES.map((s) => [s.id, { status: 'pending' as StageStatus }])
  );
  for (const ev of events) {
    if (ev.type === 'agent-playground.stage:started') {
      const stage = (ev.payload as { stage?: string }).stage;
      if (stage && init[stage]) {
        init[stage].status = 'running';
        init[stage].startedAt = ev.timestamp;
      }
    } else if (ev.type === 'agent-playground.stage:completed') {
      const stage = (ev.payload as { stage?: string }).stage;
      if (stage && init[stage]) {
        init[stage].status = 'done';
        init[stage].endedAt = ev.timestamp;
      }
    } else if (ev.type === 'agent-playground.researcher:completed') {
      const dim = (ev.payload as { dimension?: string }).dimension;
      if (init['researchers']) {
        init['researchers'].detail = `Latest: ${dim}`;
      }
    } else if (ev.type === 'agent-playground.reviewer:scored') {
      const score = (ev.payload as { score?: number }).score;
      if (init['reviewer']) {
        init['reviewer'].detail = `Score: ${score}`;
      }
    } else if (ev.type === 'agent-playground.mission:completed') {
      // Mark all running as done
      for (const s of STAGES) {
        if (init[s.id].status === 'running') init[s.id].status = 'done';
      }
    }
  }
  return init;
}

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === 'done')
    return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === 'running')
    return <Loader2 className="h-5 w-5 animate-spin text-purple-500" />;
  if (status === 'failed') return <XCircle className="h-5 w-5 text-red-500" />;
  return <Clock className="h-5 w-5 text-gray-300" />;
}

export function MissionDashboard({ events }: { events: PlaygroundEvent[] }) {
  const stages = useMemo(() => deriveStages(events), [events]);
  const totalDone = STAGES.filter((s) => stages[s.id].status === 'done').length;
  const pct = Math.round((totalDone / STAGES.length) * 100);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Mission Pipeline
        </h3>
        <span className="text-xs text-gray-500">{pct}% complete</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="space-y-2">
        {STAGES.map(({ id, label, Icon }) => {
          const s = stages[id];
          const dur =
            s.startedAt && s.endedAt
              ? `${((s.endedAt - s.startedAt) / 1000).toFixed(1)}s`
              : null;
          return (
            <div
              key={id}
              className={`flex items-center gap-3 rounded-lg p-2 ${
                s.status === 'running' ? 'bg-purple-50' : ''
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 text-gray-400" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{label}</div>
                {s.detail && (
                  <div className="text-xs text-gray-500">{s.detail}</div>
                )}
              </div>
              {dur && <span className="text-xs text-gray-400">{dur}</span>}
              <StatusIcon status={s.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
