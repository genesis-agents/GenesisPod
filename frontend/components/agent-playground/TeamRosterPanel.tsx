'use client';

/**
 * TeamRosterPanel — 完全照搬 TI TopicTeamPanel 的视觉结构
 *
 * - 顶部小写 uppercase tracking-wide 灰色标签 + 收起按钮
 * - 中部团队节点列表（5 角色）
 * - 底部状态栏：mission status / progress
 */

import {
  Brain,
  Search,
  GitBranch,
  PenLine,
  Gavel,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import type {
  AgentLiveState,
  AgentRole,
  StageState,
  StageId,
} from '@/lib/agent-playground/derive';

const ROSTER: {
  role: AgentRole;
  stage: StageId;
  label: string;
  Icon: typeof Brain;
}[] = [
  { role: 'leader', stage: 'leader', label: 'Leader', Icon: Brain },
  {
    role: 'researcher',
    stage: 'researchers',
    label: 'Researchers',
    Icon: Search,
  },
  { role: 'analyst', stage: 'analyst', label: 'Analyst', Icon: GitBranch },
  { role: 'writer', stage: 'writer', label: 'Writer', Icon: PenLine },
  { role: 'reviewer', stage: 'reviewer', label: 'Reviewer', Icon: Gavel },
];

const TONE: Record<AgentRole, string> = {
  leader: 'from-violet-500 to-purple-600',
  researcher: 'from-sky-500 to-cyan-600',
  analyst: 'from-amber-500 to-orange-600',
  writer: 'from-rose-500 to-pink-600',
  reviewer: 'from-emerald-500 to-teal-600',
};

function StageStatusIcon({ status }: { status: StageState['status'] }) {
  if (status === 'done')
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === 'running')
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />;
  if (status === 'failed')
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <Clock className="h-3.5 w-3.5 text-gray-300" />;
}

interface Props {
  agents: AgentLiveState[];
  stages: StageState[];
  finalScore?: number;
  topic?: string;
}

export function TeamRosterPanel({ agents, stages, finalScore }: Props) {
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const completedStages = stages.filter((s) => s.status === 'done').length;
  const totalStages = stages.length;
  const overallPct = Math.round((completedStages / totalStages) * 100);

  return (
    <div className="flex h-full flex-col">
      {/* Section header — TI style */}
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Research Team
        </span>
        <span className="text-xs text-gray-400">{agents.length} agents</span>
      </div>

      {/* Roster body */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2 p-3">
          {ROSTER.map(({ role, stage, label, Icon }) => {
            const tone = TONE[role];
            const st = stageMap.get(stage);
            const roleAgents = agents.filter((a) => a.role === role);
            const running = roleAgents.filter(
              (a) => a.phase === 'running'
            ).length;
            const done = roleAgents.filter(
              (a) => a.phase === 'completed'
            ).length;
            const failed = roleAgents.filter(
              (a) => a.phase === 'failed'
            ).length;

            const lastThought = (() => {
              for (let i = roleAgents.length - 1; i >= 0; i--) {
                const trace = roleAgents[i].trace;
                for (let j = trace.length - 1; j >= 0; j--) {
                  if (trace[j].kind === 'thought' && trace[j].text) {
                    return trace[j].text;
                  }
                }
              }
              return null;
            })();

            return (
              <div
                key={role}
                className="rounded-lg border border-gray-100 bg-white p-2.5 transition-all hover:border-gray-200"
              >
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${tone} shadow-sm`}
                    >
                      <Icon className="h-4 w-4 text-white" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {label}
                      </p>
                      {roleAgents.length > 0 && (
                        <p className="text-[10px] text-gray-400">
                          {roleAgents.length}{' '}
                          {roleAgents.length > 1 ? 'instances' : 'instance'}
                        </p>
                      )}
                    </div>
                  </div>
                  {st && <StageStatusIcon status={st.status} />}
                </div>

                {roleAgents.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1 text-[10px] font-medium">
                    {running > 0 && (
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
                        {running} running
                      </span>
                    )}
                    {done > 0 && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                        {done} done
                      </span>
                    )}
                    {failed > 0 && (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">
                        {failed} failed
                      </span>
                    )}
                  </div>
                )}

                {lastThought ? (
                  <p className="line-clamp-2 text-[11px] leading-snug text-gray-600">
                    💭 {lastThought}
                  </p>
                ) : (
                  <p className="text-[11px] italic text-gray-400">
                    {st?.detail ?? 'Waiting'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom status bar — TI style */}
      <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-gray-700">Mission progress</span>
          <span className="font-mono text-gray-500">
            {completedStages} / {totalStages}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all"
            style={{ width: `${overallPct}%` }}
          />
        </div>
        {finalScore != null && (
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="font-medium text-gray-700">Consensus quality</span>
            <span
              className={`font-mono font-semibold ${
                finalScore >= 80
                  ? 'text-emerald-600'
                  : finalScore >= 60
                    ? 'text-amber-600'
                    : 'text-red-600'
              }`}
            >
              {finalScore} / 100
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
