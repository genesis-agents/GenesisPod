'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Play, CircleDot, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { useCompanyStore } from '@/stores/company/companyStore';
import { findListing } from '@/components/marketplace/marketplace.mock';

type Tone = 'info' | 'leader' | 'member' | 'success';
interface StreamEvent {
  id: number;
  role: string;
  text: string;
  tone: Tone;
}

const TONE_DOT: Record<Tone, string> = {
  info: 'text-gray-400',
  leader: 'text-amber-500',
  member: 'text-blue-500',
  success: 'text-green-500',
};

export function MissionRunView() {
  const { teams, hired, missions, createMission, setMissionProgress } =
    useCompanyStore();

  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 卸载时清理定时器（避免泄漏 / 重入）
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const activeTeam = teams.find((t) => t.id === teamId) ?? null;

  const buildScript = (): Omit<StreamEvent, 'id'>[] => {
    if (!activeTeam) return [];
    const leader =
      hired.find((h) => h.instanceId === activeTeam.leaderId)?.name ?? 'Leader';
    const members = activeTeam.memberIds
      .map((id) => hired.find((h) => h.instanceId === id))
      .filter(Boolean)
      .map((m) => m!.name);
    const wf = activeTeam.workflowId
      ? findListing(activeTeam.workflowId)
      : null;
    const stages =
      wf && 'stages' in wf ? wf.stages : ['规划', '执行', '评审', '汇总'];

    const script: Omit<StreamEvent, 'id'>[] = [];
    script.push({ role: leader, tone: 'leader', text: `接到任务，开始拆解` });
    script.push({
      role: leader,
      tone: 'leader',
      text: `按「${wf?.name ?? '默认流程'}」分派给 ${members.length} 名成员`,
    });
    stages.forEach((stage, si) => {
      const who = members[si % Math.max(members.length, 1)] ?? leader;
      script.push({ role: who, tone: 'member', text: `开始「${stage}」` });
      script.push({ role: who, tone: 'member', text: `完成「${stage}」` });
      if (si < stages.length - 1)
        script.push({
          role: leader,
          tone: 'leader',
          text: `评审通过，进入下一阶段`,
        });
    });
    script.push({
      role: leader,
      tone: 'success',
      text: `综合产出，签字完成 ✓`,
    });
    return script;
  };

  const dispatch = () => {
    if (!activeTeam || !title.trim() || running) return;
    const script = buildScript();
    const missionId = createMission(activeTeam.id, title.trim());
    setEvents([]);
    setRunning(true);

    let i = 0;
    let eid = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const step = script[i];
      setEvents((prev) => [...prev, { id: eid++, ...step }]);
      const progress = Math.round(((i + 1) / script.length) * 100);
      setMissionProgress(
        missionId,
        progress,
        i + 1 >= script.length ? 'done' : 'running'
      );
      i += 1;
      if (i >= script.length) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setRunning(false);
      }
    }, 850);
    setTitle('');
  };

  if (teams.length === 0) {
    return (
      <EmptyState
        type="default"
        title="还没有团队"
        description="先去「组队」建一个 Team，再下任务"
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* 下达任务 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-48">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              交给哪个 Team
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              任务
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && dispatch()}
              placeholder="例如：调研 Q3 竞品定价并给出建议"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={dispatch}
            disabled={!title.trim() || running}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            下达任务
          </button>
        </div>
        {activeTeam && (
          <p className="mt-2 text-xs text-gray-400">
            Leader：
            {hired.find((h) => h.instanceId === activeTeam.leaderId)?.name ??
              '（未指定）'}{' '}
            · 成员 {activeTeam.memberIds.length} 名
            {activeTeam.workflowId
              ? ` · ${findListing(activeTeam.workflowId)?.name}`
              : ''}
          </p>
        )}
      </div>

      {/* 实时协作流 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            实时协作流
          </h3>
          <div className="min-h-[220px] rounded-xl border border-gray-200 bg-white p-4">
            {events.length === 0 ? (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center text-gray-400">
                <Play className="mb-2 h-8 w-8" />
                <p className="text-sm">下达任务后，这里实时显示团队协作过程</p>
              </div>
            ) : (
              <ol className="space-y-3">
                {events.map((e) => {
                  const Icon = e.tone === 'success' ? CheckCircle2 : CircleDot;
                  return (
                    <li key={e.id} className="flex items-start gap-2.5">
                      <Icon
                        className={cn(
                          'mt-0.5 h-4 w-4 flex-shrink-0',
                          TONE_DOT[e.tone]
                        )}
                      />
                      <div className="text-sm">
                        <span className="font-medium text-gray-900">
                          {e.role}
                        </span>
                        <span className="ml-2 text-gray-600">{e.text}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        {/* 任务列表 */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">近期任务</h3>
          <div className="space-y-2">
            {missions.slice(0, 8).map((m) => {
              const team = teams.find((t) => t.id === m.teamId);
              return (
                <div
                  key={m.id}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium text-gray-900">
                      {m.title}
                    </span>
                    <span className="flex-shrink-0 text-xs text-gray-400">
                      {m.progress}%
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {team?.name ?? '—'}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        m.status === 'done' ? 'bg-green-500' : 'bg-blue-500'
                      )}
                      style={{ width: `${m.progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
