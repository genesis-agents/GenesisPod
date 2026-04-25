'use client';

/**
 * TeamRosterPanel — 左侧固定团队阵型面板（参考 TI 的 TopicTeamPanel）
 *
 * 显示 5 个 agent 角色（Leader / Researchers / Analyst / Writer / Reviewer），
 * 带状态徽章 + 当前 thought 摘要。点击角色可滚动到 RightTabPanel 的 Live tab
 * 对应 agent 卡片。
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
  ChevronLeft,
  ChevronRight,
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

const TONE: Record<
  AgentRole,
  { bg: string; text: string; ring: string; gradient: string }
> = {
  leader: {
    bg: 'bg-violet-50',
    text: 'text-violet-600',
    ring: 'ring-violet-200',
    gradient: 'from-violet-500 to-purple-600',
  },
  researcher: {
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    ring: 'ring-sky-200',
    gradient: 'from-sky-500 to-cyan-600',
  },
  analyst: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    ring: 'ring-amber-200',
    gradient: 'from-amber-500 to-orange-600',
  },
  writer: {
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    ring: 'ring-rose-200',
    gradient: 'from-rose-500 to-pink-600',
  },
  reviewer: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    ring: 'ring-emerald-200',
    gradient: 'from-emerald-500 to-teal-600',
  },
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
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function TeamRosterPanel({
  agents,
  stages,
  collapsed,
  onToggleCollapse,
}: Props) {
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-r border-gray-200 bg-white py-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="mb-3 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Expand team"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="space-y-3">
          {ROSTER.map(({ role, stage, Icon }) => {
            const tone = TONE[role];
            const st = stageMap.get(stage);
            return (
              <div
                key={role}
                className={`relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${tone.gradient}`}
              >
                <Icon className="h-4 w-4 text-white" />
                {st && (
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5 shadow-sm">
                    <StageStatusIcon status={st.status} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-[340px] flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Research Team</h2>
          <p className="text-[11px] text-gray-500">
            5-agent crew · LeaderWorker
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Collapse team"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {ROSTER.map(({ role, stage, label, Icon }) => {
            const tone = TONE[role];
            const st = stageMap.get(stage);
            // 同 role 的 agents（researchers 多个）
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
                className="rounded-xl border border-gray-100 bg-white p-3 transition-all hover:border-gray-200 hover:shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${tone.gradient} shadow-sm`}
                    >
                      <Icon className="h-4 w-4 text-white" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {label}
                      </p>
                      {roleAgents.length > 0 && (
                        <p className="font-mono text-[10px] text-gray-400">
                          {roleAgents.length} instance
                          {roleAgents.length > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  {st && <StageStatusIcon status={st.status} />}
                </div>

                {/* status counters */}
                {roleAgents.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5 text-[10px] font-medium">
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

                {/* last thought preview */}
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
    </div>
  );
}
