'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Send,
  Play,
  CircleDot,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { Modal } from '@/components/ui/dialogs';
import { StatusBadge, type BadgeTone } from '@/components/ui/badges';
import { useCompanyStore } from '@/stores/company/companyStore';
import { useCompanyMissionStream } from '@/hooks/features/useCompanyMissionStream';
import {
  MissionReportView,
  MissionLiveRail,
  type MissionReportResult,
  type LiveStageStatus,
} from '@/components/me/team/mission/MissionReportView';

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

/** mission 状态 → 徽章/进度条/图标底色。 */
const MISSION_STATUS: Record<
  string,
  { tone: BadgeTone; label: string; bar: string; iconBg: string }
> = {
  running: {
    tone: 'running',
    label: '进行中',
    bar: 'bg-blue-500',
    iconBg: 'bg-blue-500',
  },
  review: {
    tone: 'warning',
    label: '评审中',
    bar: 'bg-amber-500',
    iconBg: 'bg-amber-500',
  },
  done: {
    tone: 'success',
    label: '已完成',
    bar: 'bg-green-500',
    iconBg: 'bg-green-500',
  },
  failed: {
    tone: 'danger',
    label: '失败',
    bar: 'bg-red-500',
    iconBg: 'bg-red-500',
  },
  queued: {
    tone: 'neutral',
    label: '排队中',
    bar: 'bg-gray-400',
    iconBg: 'bg-gray-400',
  },
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
  // 点开查看的已完成任务（渲染研究报告）
  const [reportMissionId, setReportMissionId] = useState<string | null>(null);
  // 任务卡片搜索
  const [search, setSearch] = useState('');
  // 下发任务弹窗
  const [dispatchOpen, setDispatchOpen] = useState(false);
  // 运行中实时阶段状态（规划/执行/评审）
  const [stageStatus, setStageStatus] = useState<
    Record<string, LiveStageStatus>
  >({});
  const [running, setRunning] = useState(false);
  // 当前正在监听的 missionId（null = 未下达）
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  // 用 ref 跟踪最新 running 状态，避免 stale closure 影响 WS 回调
  const runningRef = useRef(false);

  const { events: wsEvents } = useCompanyMissionStream(activeMissionId);

  const filteredMissions = missions.filter((m) =>
    m.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  // 首次加载：公司快照（团队/成员）+ 已有任务（独立路由 /missions 需自行加载）
  const { loadMissions, loadCompany } = useCompanyStore();
  useEffect(() => {
    void loadCompany();
    void loadMissions();
  }, [loadCompany, loadMissions]);

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
        if (p.stage) {
          setStageStatus((s) => ({
            ...s,
            [p.stage!]: p.status === 'completed' ? 'done' : 'active',
          }));
        }
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
        setStageStatus({
          planning: 'done',
          execution: 'done',
          review: 'done',
        });
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
    setStageStatus({ planning: 'active' });
    setActiveMissionId(null);
    processedTsRef.current = 0;
    setRunning(true);
    runningRef.current = true;

    setDispatchOpen(false);

    const missionId = await createMission(activeTeam.id, taskTitle);
    if (!missionId) {
      setRunning(false);
      runningRef.current = false;
      return;
    }
    setActiveMissionId(missionId);
  };

  // 点开任务 → 整页详情（可返回任务列表）
  const reportMission = missions.find((m) => m.id === reportMissionId) ?? null;
  if (reportMission) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setReportMissionId(null)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          返回任务列表
        </button>
        <MissionReportView
          title={reportMission.title}
          createdAt={reportMission.createdAt}
          result={reportMission.result as MissionReportResult}
        />
      </div>
    );
  }

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
      {/* 下发任务弹窗 */}
      <Modal
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        title="下发任务"
        subtitle="选择团队、描述要做的事，交给团队执行"
        size="lg"
        footer={
          <>
            <button
              onClick={() => setDispatchOpen(false)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
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
              下发任务
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
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
          <div>
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
          {activeTeam && (
            <p className="text-xs text-gray-400">
              Leader：
              {hired.find((h) => h.instanceId === activeTeam.leaderId)?.name ??
                '（未指定）'}{' '}
              · 成员{' '}
              {
                activeTeam.memberIds.filter((id) =>
                  hired.some((h) => h.instanceId === id)
                ).length
              }{' '}
              名
              {activeTeam.workflowId
                ? ` · ${teamWorkflows.find((w) => w.id === activeTeam.workflowId)?.name ?? ''}`
                : ''}
            </p>
          )}
        </div>
      </Modal>

      {/* 运行中实时阶段进度 */}
      {(activeMissionId || events.length > 0) && (
        <MissionLiveRail status={stageStatus} />
      )}

      {/* 实时协作流（运行中 / 有事件时才出现）*/}
      {events.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            实时协作流
          </h3>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
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
          </div>
        </div>
      )}

      {/* 任务卡片 */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex-shrink-0 text-sm font-semibold text-gray-900">
            任务
          </h3>
          <div className="flex items-center gap-2.5">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索任务…"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              onClick={() => setDispatchOpen(true)}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Send className="h-4 w-4" />
              下发任务
            </button>
          </div>
        </div>
        {missions.length === 0 ? (
          <EmptyState
            type="default"
            size="sm"
            title="暂无任务"
            description="点击右上角「下发任务」给团队下达第一个任务"
            icon={<Play className="h-8 w-8" />}
          />
        ) : filteredMissions.length === 0 ? (
          <EmptyState
            type="default"
            size="sm"
            title="无匹配任务"
            description="换个关键词试试"
            icon={<Search className="h-8 w-8" />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMissions.map((m) => {
              const team = teams.find((t) => t.id === m.teamId);
              const done = m.status === 'done';
              const sm = MISSION_STATUS[m.status] ?? MISSION_STATUS.queued;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => done && setReportMissionId(m.id)}
                  disabled={!done}
                  className={cn(
                    'group flex flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-all',
                    done
                      ? 'cursor-pointer hover:border-primary/50 hover:shadow-sm'
                      : 'cursor-default'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={cn(
                          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white',
                          sm.iconBg
                        )}
                      >
                        <Send className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {m.title}
                        </div>
                        <div className="truncate text-xs text-gray-400">
                          {team?.name ?? '—'}
                        </div>
                      </div>
                    </div>
                    <StatusBadge tone={sm.tone} label={sm.label} />
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        sm.bar
                      )}
                      style={{ width: `${m.progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                    <span>{m.progress}%</span>
                    {done && (
                      <span className="font-medium text-primary group-hover:underline">
                        查看报告 →
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
