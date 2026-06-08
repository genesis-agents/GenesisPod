'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Play, CircleDot, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { useCompanyStore } from '@/stores/company/companyStore';
import { useCompanyMissionStream } from '@/hooks/features/useCompanyMissionStream';

type Tone = 'info' | 'leader' | 'member' | 'success' | 'error';
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
  error: 'text-red-500',
};

/** 将后端阶段 id 转为可读中文标签 */
const STAGE_LABELS: Record<string, string> = {
  planning: '规划',
  execution: '执行',
  review: '评审',
};
function stageLabel(id: string): string {
  return STAGE_LABELS[id] ?? id;
}

/** 将 WS 事件类型 + payload 映射为流事件行 */
let eid = 0;
function eventToStreamItems(
  type: string,
  payload: unknown
): Omit<StreamEvent, 'id'>[] | null {
  if (type === 'company.mission:started') {
    return [{ role: '系统', tone: 'info', text: '任务已启动，开始执行...' }];
  }
  if (type === 'company.stage:lifecycle') {
    const p = payload as { stage?: string; status?: string };
    const label = stageLabel(p.stage ?? '');
    if (p.status === 'started') {
      return [{ role: '执行器', tone: 'member', text: `开始「${label}」` }];
    }
    if (p.status === 'completed') {
      return [{ role: '执行器', tone: 'leader', text: `完成「${label}」` }];
    }
    return null;
  }
  if (type === 'company.mission:completed') {
    return [{ role: '系统', tone: 'success', text: '任务全部完成 ✓' }];
  }
  if (type === 'company.mission:failed') {
    const p = payload as { message?: string };
    return [
      {
        role: '系统',
        tone: 'error',
        text: `任务失败：${p.message ?? '未知错误'}`,
      },
    ];
  }
  return null;
}

export function MissionRunView() {
  const {
    teams,
    hired,
    missions,
    teamWorkflows,
    createMission,
    setMissionProgress,
  } = useCompanyStore();

  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [running, setRunning] = useState(false);
  // 当前正在监听的 missionId（null = 未下达）
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  // 用 ref 跟踪最新 running 状态，避免 stale closure 影响 WS 回调
  const runningRef = useRef(false);

  const { events: wsEvents } = useCompanyMissionStream(activeMissionId);

  // 首次加载已有任务
  const { loadMissions } = useCompanyStore();
  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  // 同步第一个团队 id（避免初始渲染时 teams 为空）
  useEffect(() => {
    if (teams.length > 0 && !teamId) {
      setTeamId(teams[0].id);
    }
  }, [teams, teamId]);

  // 处理 WS 事件 → 更新 UI 流 + store 进度
  const processedTsRef = useRef<number>(0);
  useEffect(() => {
    if (!activeMissionId) return;
    const newEvents = wsEvents.filter(
      (e) => e.timestamp > processedTsRef.current
    );
    if (!newEvents.length) return;
    processedTsRef.current = newEvents[newEvents.length - 1].timestamp;

    for (const e of newEvents) {
      const items = eventToStreamItems(e.type, e.payload);
      if (items) {
        setEvents((prev) => [
          ...prev,
          ...items.map((item) => ({ id: eid++, ...item })),
        ]);
      }

      // 更新 store 进度
      if (e.type === 'company.mission:started') {
        setMissionProgress(activeMissionId, 0, 'running');
      } else if (e.type === 'company.stage:lifecycle') {
        const p = e.payload as { stage?: string; status?: string };
        if (p.status === 'completed') {
          const stageIndex = Object.keys(STAGE_LABELS).indexOf(p.stage ?? '');
          const total = Object.keys(STAGE_LABELS).length;
          const progress =
            stageIndex >= 0
              ? Math.round(((stageIndex + 1) / total) * 100)
              : undefined;
          if (progress !== undefined) {
            setMissionProgress(activeMissionId, progress, 'running');
          }
        }
      } else if (e.type === 'company.mission:completed') {
        setMissionProgress(activeMissionId, 100, 'done');
        if (runningRef.current) {
          setRunning(false);
          runningRef.current = false;
        }
      } else if (e.type === 'company.mission:failed') {
        setMissionProgress(activeMissionId, 0, 'failed');
        if (runningRef.current) {
          setRunning(false);
          runningRef.current = false;
        }
      }
    }
  }, [wsEvents, activeMissionId, setMissionProgress]);

  const activeTeam = teams.find((t) => t.id === teamId) ?? null;

  const dispatch = async () => {
    if (!activeTeam || !title.trim() || running) return;
    const taskTitle = title.trim();
    setTitle('');
    setEvents([]);
    setActiveMissionId(null);
    processedTsRef.current = 0;
    setRunning(true);
    runningRef.current = true;

    const missionId = await createMission(activeTeam.id, taskTitle);
    if (!missionId) {
      setRunning(false);
      runningRef.current = false;
      return;
    }
    setActiveMissionId(missionId);
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') void dispatch();
              }}
              placeholder="例如：调研 Q3 竞品定价并给出建议"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={() => void dispatch()}
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
              ? ` · ${teamWorkflows.find((w) => w.id === activeTeam.workflowId)?.name ?? ''}`
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
              <EmptyState
                type="default"
                size="sm"
                title="等待任务"
                description="下达任务后，这里实时显示团队协作过程"
                icon={<Play className="h-8 w-8" />}
              />
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
          {missions.length === 0 ? (
            <EmptyState
              type="default"
              size="sm"
              title="暂无任务"
              description="还没有提交过任务"
            />
          ) : (
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
                          m.status === 'done'
                            ? 'bg-green-500'
                            : m.status === 'failed'
                              ? 'bg-red-500'
                              : 'bg-blue-500'
                        )}
                        style={{ width: `${m.progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
