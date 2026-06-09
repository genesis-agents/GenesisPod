'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/dialogs';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { Button } from '@/components/ui/primitives/button';
import { Input } from '@/components/ui/form/Input';
import { MissionGalleryView } from '@/components/common/missions/MissionGalleryView';
import type { MissionListItem } from '@/services/agent-playground/api';
import { MODULE_THEMES } from '@/lib/design/module-themes';
import { useCompanyStore } from '@/stores/company/companyStore';
import type { CompanyMission } from '@/stores/company/companyStore';
import { useCompanyMissionStream } from '@/hooks/features/useCompanyMissionStream';
import {
  DeepInsightMissionDetail,
  fromCompanyMissionResult,
  type MissionReportResultLike,
} from '@/components/missions/deep-insight';

/** 运行中实时阶段三态（WS 事件驱动详情页 live rail；纯运行态，不入 kit 契约）。 */
type LiveStageStatus = 'pending' | 'active' | 'done';

/** 后端阶段 id → 进度百分比计算用。 */
const STAGE_LABELS: Record<string, string> = {
  planning: '规划',
  execution: '执行',
  review: '评审',
};

/** company mission 状态 → playground gallery 状态枚举。 */
const STATUS_MAP: Record<string, string> = {
  queued: 'running',
  running: 'running',
  review: 'running',
  done: 'completed',
  failed: 'failed',
};

/** company mission → canonical MissionListItem（喂给 MissionGalleryView）。 */
function toListItem(m: CompanyMission): MissionListItem {
  const r = (m.result ?? {}) as {
    review?: { score?: number };
    usage?: { totalTokens?: number; totalCostCents?: number };
    summary?: string;
    themeSummary?: string;
    depth?: string;
    language?: string;
  };
  const iso = new Date(m.createdAt).toISOString();
  return {
    id: m.id,
    topic: m.title,
    depth: r.depth ?? 'deep',
    language: r.language ?? 'zh-CN',
    status: STATUS_MAP[m.status] ?? m.status,
    startedAt: iso,
    completedAt: m.status === 'done' ? iso : null,
    elapsedWallTimeMs: null,
    finalScore: r.review?.score ?? null,
    tokensUsed: r.usage?.totalTokens ?? null,
    costUsd:
      r.usage?.totalCostCents != null ? r.usage.totalCostCents / 100 : null,
    reportTitle: m.title,
    reportSummary:
      r.themeSummary ?? (r.summary ? r.summary.slice(0, 200) : null),
    errorMessage: null,
    visibility: 'PRIVATE',
  };
}

export function MissionRunView() {
  const {
    teams,
    hired,
    missions,
    teamWorkflows,
    createMission,
    deleteMission,
    renameMission,
    setMissionProgress,
    loadMissions,
    loadCompany,
  } = useCompanyStore();

  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? '');
  const [title, setTitle] = useState('');
  // 点开查看的任务详情
  const [reportMissionId, setReportMissionId] = useState<string | null>(null);
  // 下发任务弹窗
  const [dispatchOpen, setDispatchOpen] = useState(false);
  // 运行中实时阶段状态（驱动详情页 live rail；列表态不再内联展示）
  const [, setStageStatus] = useState<Record<string, LiveStageStatus>>({});
  const [running, setRunning] = useState(false);
  // 当前正在监听的 missionId（null = 未下达）
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const runningRef = useRef(false);
  // gallery 重载触发器：store missions 变化时 +1，让卡片随 WS 进度刷新
  const [galleryReload, setGalleryReload] = useState(0);

  const { events: wsEvents } = useCompanyMissionStream(activeMissionId);
  // 详情态第二路订阅：为当前打开的报告 mission 订阅实时事件（注入 collab tab）
  const { events: reportMissionEvents } =
    useCompanyMissionStream(reportMissionId);

  // 首次加载：公司快照（团队/成员）+ 已有任务
  useEffect(() => {
    void loadCompany();
    void loadMissions();
  }, [loadCompany, loadMissions]);

  // store missions 变化 → 通知 gallery 重新读取（含 WS 进度 / 新建 / 删除）
  useEffect(() => {
    setGalleryReload((n) => n + 1);
  }, [missions]);

  // 同步第一个团队 id（避免初始渲染时 teams 为空）
  useEffect(() => {
    if (teams.length > 0 && !teamId) {
      setTeamId(teams[0].id);
    }
  }, [teams, teamId]);

  // 处理 WS 事件 → 更新 store 进度 + 阶段状态（详情页 live rail 用）
  const processedTsRef = useRef<number>(0);
  useEffect(() => {
    if (!activeMissionId) return;
    const newEvents = wsEvents.filter(
      (e) => e.timestamp > processedTsRef.current
    );
    if (!newEvents.length) return;
    processedTsRef.current = newEvents[newEvents.length - 1].timestamp;

    for (const e of newEvents) {
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
        setStageStatus({ planning: 'done', execution: 'done', review: 'done' });
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

  // gallery 数据源：从 store 读取并映射为 canonical MissionListItem（稳定引用）
  const fetchMissions = useCallback(async () => {
    return useCompanyStore.getState().missions.map(toListItem);
  }, []);

  // ── 详情态：整页 DeepInsightMissionDetail（L4 kit，吃归一契约）─────────
  const reportMission = missions.find((m) => m.id === reportMissionId) ?? null;
  if (reportMission) {
    const reportResult = reportMission.result as
      | (MissionReportResultLike & { depth?: string; language?: string })
      | undefined;
    const detailView = fromCompanyMissionResult({
      id: reportMission.id,
      title: reportMission.title,
      status: reportMission.status,
      createdAt: reportMission.createdAt,
      result: reportResult,
      depth: reportResult?.depth,
      language: reportResult?.language,
      events: reportMissionEvents,
      actions: [
        {
          variant: 'primary',
          emoji: '▶',
          label: '重新下发',
          title: '用相同团队 + 任务标题起一个新 mission',
          onClick: () => {
            void createMission(reportMission.teamId, reportMission.title).then(
              (id) => {
                if (id) setActiveMissionId(id);
              }
            );
            setReportMissionId(null);
          },
        },
        {
          variant: 'danger',
          emoji: '⏹',
          label: '删除',
          title: '删除该任务及其报告',
          onClick: () => {
            void deleteMission(reportMission.id);
            setReportMissionId(null);
          },
        },
      ],
    });

    const handleRerun = () => {
      void createMission(reportMission.teamId, reportMission.title).then(
        (id) => {
          if (id) setActiveMissionId(id);
        }
      );
      setReportMissionId(null);
    };

    return (
      <DeepInsightMissionDetail
        data={detailView}
        onBack={() => setReportMissionId(null)}
        onRerun={handleRerun}
        // onUpdate: 用相同 topic 进入新建弹窗，预填 title
        onUpdate={() => {
          setTitle(reportMission.title);
          setReportMissionId(null);
          setDispatchOpen(true);
        }}
        // onSettings: 复用 onUpdate 流（预填 title 打开弹窗配置后再跑）
        onSettings={() => {
          setTitle(reportMission.title);
          setReportMissionId(null);
          setDispatchOpen(true);
        }}
        // onCancel: company 侧暂无取消接口
        onCancel={undefined}
        // onLeaderClick / onResearchTeamClick: 暂无弹窗
        onLeaderClick={undefined}
        onResearchTeamClick={undefined}
        onDelete={() => {
          void deleteMission(reportMission.id);
          setReportMissionId(null);
        }}
      />
    );
  }

  // ── 列表态：canonical MissionGalleryView（搜索 + 卡片网格 + 新建占位卡）──
  return (
    <>
      <Modal
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        title="下发任务"
        subtitle="选择团队、描述要做的事，交给团队执行"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDispatchOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => void dispatch()}
              disabled={!title.trim() || running || teams.length === 0}
            >
              {running ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              下发任务
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {teams.length === 0 ? (
            <EmptyState
              type="default"
              size="sm"
              title="还没有团队"
              description="先去「我的团队 · 组队」建一个 Team，再回来下发任务"
            />
          ) : (
            <>
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
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void dispatch();
                  }}
                  placeholder="例如：调研 Q3 竞品定价并给出建议"
                />
              </div>
              {activeTeam && (
                <p className="text-xs text-gray-400">
                  Leader：
                  {hired.find((h) => h.instanceId === activeTeam.leaderId)
                    ?.name ?? '（未指定）'}{' '}
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
            </>
          )}
        </div>
      </Modal>

      <MissionGalleryView
        title="我的团队任务"
        subtitle="给团队下达任务，实时看协作过程，完成后查看完整研究报告"
        iconGradient={MODULE_THEMES.ask.gradient}
        createButtonLabel="下发任务"
        onCreateMission={() => setDispatchOpen(true)}
        fetchMissions={fetchMissions}
        onMissionClick={(m) => setReportMissionId(m.id)}
        onEdit={(m) => {
          const next = window.prompt('重命名任务：', m.topic);
          if (next && next.trim() && next !== m.topic) {
            void renameMission(m.id, next.trim());
          }
        }}
        onDelete={(m) => void deleteMission(m.id)}
        searchPlaceholder="搜索任务标题…"
        emptyState={{
          title: '还没有任务',
          hint: '给团队下达第一个任务，看它们协作产出研究报告',
          ctaLabel: '下发任务',
        }}
        reloadKey={galleryReload}
      />
    </>
  );
}
